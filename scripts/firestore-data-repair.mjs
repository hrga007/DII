import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDocs, getFirestore, writeBatch } from 'firebase/firestore'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyA5Cpqzw1Xj77hVR_N_E9fKSqaQC5IC8zM',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'dii-tracker.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? 'dii-tracker',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'dii-tracker.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '431980684090',
  appId: process.env.VITE_FIREBASE_APP_ID ?? '1:431980684090:web:025404cda7ce7e50f3e603',
}

const COLLECTIONS = [
  'importBatches',
  'financialEntries',
  'installedResources',
  'importIssues',
]

const SPECIAL_VALUES = new Set(['', 'NP', 'NE', '-', 'N/A', 'N.A.', 'N.A', 'N/P', '------'])
const applyChanges = process.argv.includes('--apply')
const fixAmounts = process.argv.includes('--fix-amounts')

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return rl.question(question).finally(() => rl.close())
}

function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return ask(question)

  return new Promise((resolve, reject) => {
    let value = ''
    const stdin = process.stdin

    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      process.stdout.write('\n')
    }

    const onData = (chunk) => {
      const text = chunk.toString('utf8')
      for (const char of text) {
        if (char === '\u0003') {
          cleanup()
          reject(new Error('Prekinuto.'))
          return
        }
        if (char === '\r' || char === '\n' || char === '\u0004') {
          cleanup()
          resolve(value)
          return
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1)
          continue
        }
        if (char >= ' ') value += char
      }
    }

    process.stdout.write(question)
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

function isDeleted(batch) {
  return batch?.isDeleted === true
}

function isActive(batch) {
  return !isDeleted(batch) && batch?.isActive === true
}

function isGroupedInteger(value, separator) {
  const escaped = separator === '.' ? '\\.' : separator
  return new RegExp(`^\\d{1,3}(${escaped}\\d{3})+$`).test(value)
}

function parseLocaleNumber(raw) {
  const normalized = raw.replace(/\u00a0/g, ' ').trim()
  if (normalized === '') return null

  let sign = ''
  let body = normalized
  if (body.startsWith('+') || body.startsWith('-')) {
    sign = body[0]
    body = body.slice(1)
  }

  body = body.replace(/[\s']/g, '')
  if (!body || !/^\d[0-9.,]*$/.test(body)) return null

  const commaCount = (body.match(/,/g) ?? []).length
  const dotCount = (body.match(/\./g) ?? []).length

  if (commaCount > 0 && dotCount > 0) {
    const decimalSep = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    const decimalParts = body.split(decimalSep)
    if (decimalParts.length !== 2) return null
    const [integerPart, decimalPart] = decimalParts
    if (!decimalPart || !/^\d+$/.test(decimalPart)) return null
    if (integerPart.includes(thousandSep) && !isGroupedInteger(integerPart, thousandSep)) return null
    if (integerPart.includes(decimalSep)) return null
    const parsed = Number(`${sign}${integerPart.replaceAll(thousandSep, '')}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : null
  if (!separator) {
    const parsed = Number(`${sign}${body}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parts = body.split(separator)
  if (parts.some((part) => part === '' || !/^\d+$/.test(part))) return null

  if (isGroupedInteger(body, separator)) {
    const parsed = Number(`${sign}${body.replaceAll(separator, '')}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (parts.length === 2) {
    const [integerPart, decimalPart] = parts
    const parsed = Number(`${sign}${integerPart}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeAmount(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const trimmed = String(raw).trim()
  if (SPECIAL_VALUES.has(trimmed.toUpperCase())) return null
  return parseLocaleNumber(trimmed)
}

function isSpecialValue(raw) {
  if (raw === null || raw === undefined) return false
  return SPECIAL_VALUES.has(String(raw).trim().toUpperCase())
}

function numbersEqual(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return a == null && b == null
  return Math.abs(Number(a) - Number(b)) < 0.000001
}

function groupBy(items, keyFn) {
  const grouped = new Map()
  for (const item of items) {
    const key = keyFn(item)
    const list = grouped.get(key) ?? []
    list.push(item)
    grouped.set(key, list)
  }
  return grouped
}

function parseFinancialIssueLocator(issue) {
  const fieldMatch = /^(\d{4})\s+(realizirano|planirano)$/i.exec(String(issue.fieldName ?? '').trim())
  const rowMatch = /^R(\d+)$/i.exec(String(issue.rowLabel ?? '').trim())
  if (!issue.batchId || !fieldMatch || !rowMatch) return null

  return {
    batchId: issue.batchId,
    sourceSheet: issue.sheetName,
    sourceRowIndex: Number(rowMatch[1]) - 1,
    year: Number(fieldMatch[1]),
    valueType: fieldMatch[2].toLowerCase(),
  }
}

function serialize(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]))
}

async function readCollection(db, collectionName) {
  const snap = await getDocs(collection(db, collectionName))
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
}

function buildPlans(data) {
  const batches = data.importBatches
  const financialEntries = data.financialEntries
  const installedResources = data.installedResources
  const issues = data.importIssues

  const batchesById = new Map(batches.map((batch) => [batch.id, batch]))
  const activeBatches = batches.filter(isActive)
  const activeBatchesById = new Map(activeBatches.map((batch) => [batch.id, batch]))
  const nonDeletedBatches = batches.filter((batch) => !isDeleted(batch))
  const issuesByBatch = groupBy(issues, (issue) => issue.batchId ?? '')

  const financialInstitutionBackfills = financialEntries
    .filter((entry) => activeBatchesById.has(entry.batchId))
    .map((entry) => ({ entry, batch: activeBatchesById.get(entry.batchId) }))
    .filter(({ entry, batch }) => batch?.institutionId && entry.institutionId !== batch.institutionId)
    .map(({ entry, batch }) => ({
      collectionName: 'financialEntries',
      id: entry.id,
      patch: { institutionId: batch.institutionId },
      before: { institutionId: entry.institutionId },
      after: { institutionId: batch.institutionId },
      context: { batchId: entry.batchId, fileName: batch.fileName },
    }))

  const resourceInstitutionBackfills = installedResources
    .filter((resource) => activeBatchesById.has(resource.batchId))
    .map((resource) => ({ resource, batch: activeBatchesById.get(resource.batchId) }))
    .filter(({ resource, batch }) => batch?.institutionId && resource.institutionId !== batch.institutionId)
    .map(({ resource, batch }) => ({
      collectionName: 'installedResources',
      id: resource.id,
      patch: { institutionId: batch.institutionId },
      before: { institutionId: resource.institutionId },
      after: { institutionId: batch.institutionId },
      context: { batchId: resource.batchId, fileName: batch.fileName },
    }))

  const issueCountRefreshes = nonDeletedBatches
    .map((batch) => {
      const batchIssues = issuesByBatch.get(batch.id) ?? []
      const unresolved = batchIssues.filter((issue) => !issue.resolvedAt)
      const errorCount = unresolved.filter((issue) => issue.severity === 'error').length
      const warningCount = unresolved.filter((issue) => issue.severity === 'warning').length
      return {
        batch,
        patch: { errorCount, warningCount },
      }
    })
    .filter(({ batch, patch }) => Number(batch.errorCount ?? 0) !== patch.errorCount || Number(batch.warningCount ?? 0) !== patch.warningCount)
    .map(({ batch, patch }) => ({
      collectionName: 'importBatches',
      id: batch.id,
      patch,
      before: { errorCount: Number(batch.errorCount ?? 0), warningCount: Number(batch.warningCount ?? 0) },
      after: patch,
      context: { fileName: batch.fileName, institutionId: batch.institutionId },
    }))

  const numericAmountRepairs = fixAmounts
    ? financialEntries
        .map((entry) => ({
          entry,
          normalizedRaw: normalizeAmount(entry.rawValue),
        }))
        .filter(({ entry, normalizedRaw }) => {
          if (normalizedRaw === null) return false
          return !numbersEqual(normalizedRaw, entry.normalizedValue) || !numbersEqual(normalizedRaw, entry.amount)
        })
        .map(({ entry, normalizedRaw }) => ({
          collectionName: 'financialEntries',
          id: entry.id,
          patch: { amount: normalizedRaw, normalizedValue: normalizedRaw },
          before: { amount: entry.amount, normalizedValue: entry.normalizedValue, rawValue: entry.rawValue },
          after: { amount: normalizedRaw, normalizedValue: normalizedRaw, rawValue: entry.rawValue },
          context: {
            batchId: entry.batchId,
            institutionId: entry.institutionId,
            sourceSheet: entry.sourceSheet,
            sourceRowIndex: entry.sourceRowIndex,
            year: entry.year,
            valueType: entry.valueType,
          },
        }))
    : []

  const financialByLocator = new Map()
  for (const entry of financialEntries) {
    const key = [
      entry.batchId,
      entry.sourceSheet,
      entry.sourceRowIndex,
      entry.year,
      entry.valueType,
    ].join('::')
    const list = financialByLocator.get(key) ?? []
    list.push(entry)
    financialByLocator.set(key, list)
  }

  const skippedManualCorrections = []
  const manualCorrectionRepairs = []
  for (const issue of issues) {
    if (!issue.resolvedAt || issue.resolvedMethod !== 'MANUAL_EDIT' || issue.correctedValue === undefined) continue
    const locator = parseFinancialIssueLocator(issue)
    if (!locator) continue

    const key = [
      locator.batchId,
      locator.sourceSheet,
      locator.sourceRowIndex,
      locator.year,
      locator.valueType,
    ].join('::')
    const matches = financialByLocator.get(key) ?? []
    const correctedAmount = normalizeAmount(issue.correctedValue)

    if (matches.length !== 1 || (correctedAmount === null && !isSpecialValue(issue.correctedValue))) {
      skippedManualCorrections.push({
        issueId: issue.id,
        batchId: issue.batchId,
        correctedValue: issue.correctedValue,
        matchCount: matches.length,
      })
      continue
    }

    const entry = matches[0]
    if (numbersEqual(correctedAmount, entry.normalizedValue) && numbersEqual(entry.normalizedValue, entry.amount)) continue

    manualCorrectionRepairs.push({
      collectionName: 'financialEntries',
      id: entry.id,
      patch: { rawValue: issue.correctedValue, amount: correctedAmount, normalizedValue: correctedAmount },
      before: { rawValue: entry.rawValue, amount: entry.amount, normalizedValue: entry.normalizedValue },
      after: { rawValue: issue.correctedValue, amount: correctedAmount, normalizedValue: correctedAmount },
      context: { issueId: issue.id, batchId: issue.batchId, fieldName: issue.fieldName, rowLabel: issue.rowLabel },
    })
  }

  const inactiveChildren = {
    financialEntries: financialEntries.filter((entry) => {
      const batch = batchesById.get(entry.batchId)
      return batch && !isActive(batch)
    }).length,
    installedResources: installedResources.filter((resource) => {
      const batch = batchesById.get(resource.batchId)
      return batch && !isActive(batch)
    }).length,
  }

  return {
    financialInstitutionBackfills,
    resourceInstitutionBackfills,
    issueCountRefreshes,
    numericAmountRepairs,
    manualCorrectionRepairs,
    skippedManualCorrections,
    inactiveChildren,
  }
}

async function applyPlan(db, updates) {
  const byCollection = groupBy(updates, (update) => update.collectionName)
  let written = 0
  for (const [collectionName, collectionUpdates] of byCollection) {
    for (let i = 0; i < collectionUpdates.length; i += 400) {
      const chunk = collectionUpdates.slice(i, i + 400)
      const batch = writeBatch(db)
      for (const update of chunk) {
        batch.update(doc(db, collectionName, update.id), update.patch)
      }
      if (applyChanges) await batch.commit()
      written += chunk.length
    }
  }
  return written
}

function summarizePlans(plans) {
  return {
    financialInstitutionBackfills: plans.financialInstitutionBackfills.length,
    resourceInstitutionBackfills: plans.resourceInstitutionBackfills.length,
    issueCountRefreshes: plans.issueCountRefreshes.length,
    numericAmountRepairs: plans.numericAmountRepairs.length,
    manualCorrectionRepairs: plans.manualCorrectionRepairs.length,
    skippedManualCorrections: plans.skippedManualCorrections.length,
    inactiveChildren: plans.inactiveChildren,
  }
}

async function main() {
  console.log(`DII Firestore data repair (${firebaseConfig.projectId})`)
  console.log(applyChanges ? 'Mode: APPLY - skripta ce pisati u Firestore.' : 'Mode: DRY RUN - nema upisa u Firestore.')
  console.log(fixAmounts ? 'Numeric amount repair: ON' : 'Numeric amount repair: OFF')
  console.log('')

  const email = process.env.FIREBASE_EMAIL ?? (await ask('Firebase email: '))
  const password = process.env.FIREBASE_PASSWORD ?? (await askHidden('Firebase password: '))

  const app = initializeApp(firebaseConfig, `repair-${Date.now()}`)
  const auth = getAuth(app)
  const db = getFirestore(app)

  try {
    await signInWithEmailAndPassword(auth, email.trim(), password)
    console.log('Prijava uspjesna. Citam kolekcije...')

    const data = Object.fromEntries(
      await Promise.all(
        COLLECTIONS.map(async (name) => {
          const rows = await readCollection(db, name)
          console.log(`- ${name}: ${rows.length}`)
          return [name, rows]
        })
      )
    )

    const plans = buildPlans(data)
    const safeUpdates = [
      ...plans.financialInstitutionBackfills,
      ...plans.resourceInstitutionBackfills,
      ...plans.issueCountRefreshes,
      ...plans.manualCorrectionRepairs,
      ...plans.numericAmountRepairs,
    ]

    const written = await applyPlan(db, safeUpdates)
    const report = {
      generatedAt: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
      mode: applyChanges ? 'apply' : 'dry-run',
      fixAmounts,
      plannedWrites: safeUpdates.length,
      appliedWrites: applyChanges ? written : 0,
      summary: summarizePlans(plans),
      plans: {
        financialInstitutionBackfills: plans.financialInstitutionBackfills,
        resourceInstitutionBackfills: plans.resourceInstitutionBackfills,
        issueCountRefreshes: plans.issueCountRefreshes,
        numericAmountRepairs: plans.numericAmountRepairs,
        manualCorrectionRepairs: plans.manualCorrectionRepairs,
        skippedManualCorrections: plans.skippedManualCorrections,
      },
    }

    const outDir = path.resolve('scripts')
    await mkdir(outDir, { recursive: true })
    const jsonPath = path.join(outDir, 'firestore-data-repair-report.json')
    await writeFile(jsonPath, `${JSON.stringify(serialize(report), null, 2)}\n`, 'utf8')

    console.log('')
    console.log('Repair plan gotov.')
    console.log(`Report: ${jsonPath}`)
    console.log(JSON.stringify(report.summary, null, 2))
    console.log(applyChanges ? `Upisano promjena: ${written}` : `Planirano promjena bez upisa: ${safeUpdates.length}`)
  } finally {
    await signOut(auth).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('')
  console.error('Repair nije uspio.')
  console.error(error?.message ?? error)
  process.exitCode = 1
})
