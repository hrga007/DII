import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, getDocs, getFirestore } from 'firebase/firestore'
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
  'institutions',
  'importBatches',
  'financialEntries',
  'installedResources',
  'importIssues',
]

const SPECIAL_VALUES = new Set(['', 'NP', 'NE', '-', 'N/A', 'N.A.', 'N.A', 'N/P', '------'])
const SAMPLE_LIMIT = 25

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

function normalizeScope(value) {
  return String(value ?? '').trim().toLowerCase()
}

function batchScopeKey(batch) {
  const institution = normalizeScope(batch.institutionId)
  const branch = normalizeScope(batch.importSummary?.institutionName)
  const file = normalizeScope(batch.fileName)
  return `${institution}::${branch || file}`
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

function sample(items) {
  return items.slice(0, SAMPLE_LIMIT)
}

function addFinding(findings, severity, code, message, items, recommendation) {
  if (items.length === 0) return
  findings.push({
    severity,
    code,
    message,
    count: items.length,
    samples: sample(items),
    recommendation,
  })
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

function buildAudit(data) {
  const findings = []
  const institutions = data.institutions
  const batches = data.importBatches
  const financialEntries = data.financialEntries
  const installedResources = data.installedResources
  const issues = data.importIssues

  const batchesById = new Map(batches.map((batch) => [batch.id, batch]))
  const activeBatches = batches.filter(isActive)
  const activeBatchIds = new Set(activeBatches.map((batch) => batch.id))
  const activeBatchesById = new Map(activeBatches.map((batch) => [batch.id, batch]))
  const nonDeletedBatches = batches.filter((batch) => !isDeleted(batch))
  const financialByBatch = groupBy(financialEntries, (entry) => entry.batchId ?? '')
  const resourcesByBatch = groupBy(installedResources, (resource) => resource.batchId ?? '')
  const issuesByBatch = groupBy(issues, (issue) => issue.batchId ?? '')

  addFinding(
    findings,
    'high',
    'active_batch_missing_institution',
    'Aktivni batch nema institutionId pa ne moze pouzdano uci u institucijske izvjestaje.',
    activeBatches
      .filter((batch) => !batch.institutionId)
      .map((batch) => ({ batchId: batch.id, fileName: batch.fileName, uploadedAt: serialize(batch.uploadedAt) })),
    'Povezati batch s institucijom ili ga deaktivirati ako ne pripada aktivnom izvjestaju.'
  )

  const duplicateActiveScopes = []
  for (const [scopeKey, scopeBatches] of groupBy(activeBatches, batchScopeKey)) {
    if (scopeBatches.length > 1) {
      duplicateActiveScopes.push({
        scopeKey,
        batches: scopeBatches.map((batch) => ({
          batchId: batch.id,
          fileName: batch.fileName,
          institutionId: batch.institutionId,
          branchName: batch.importSummary?.institutionName,
          uploadedAt: serialize(batch.uploadedAt),
        })),
      })
    }
  }
  addFinding(
    findings,
    'high',
    'duplicate_active_scope',
    'Pronadjeno je vise aktivnih batcheva za isti scope institucija + naziv tijela/podruznica.',
    duplicateActiveScopes,
    'Za isti scope smije ostati aktivan samo najnoviji/ispravan batch; ostale treba deaktivirati ili oznaciti superseded.'
  )

  const institutionActiveScopes = []
  for (const [institutionId, institutionBatches] of groupBy(activeBatches, (batch) => batch.institutionId ?? '')) {
    const scopeCount = new Set(institutionBatches.map(batchScopeKey)).size
    if (institutionId && scopeCount > 1) {
      institutionActiveScopes.push({
        institutionId,
        scopeCount,
        batches: institutionBatches.map((batch) => ({
          batchId: batch.id,
          fileName: batch.fileName,
          branchName: batch.importSummary?.institutionName,
        })),
      })
    }
  }
  addFinding(
    findings,
    'info',
    'multiple_active_scopes_per_institution',
    'Institucija ima vise aktivnih scopeova. To je ocekivano za podruznice i isti OIB s razlicitim nazivom tijela.',
    institutionActiveScopes,
    'Nema akcije ako svaki scope predstavlja stvarnu podruznicu ili zaseban obrazac.'
  )

  const orphanFinancialEntries = financialEntries
    .filter((entry) => !entry.batchId || !batchesById.has(entry.batchId))
    .map((entry) => ({
      entryId: entry.id,
      batchId: entry.batchId,
      institutionId: entry.institutionId,
      sourceSheet: entry.sourceSheet,
      sourceRowIndex: entry.sourceRowIndex,
      year: entry.year,
      valueType: entry.valueType,
    }))
  addFinding(
    findings,
    'high',
    'financial_entry_missing_batch',
    'Financijski zapis pokazuje na nepostojeci ili prazan batchId.',
    orphanFinancialEntries,
    'Provjeriti uvoz iz kojeg je zapis nastao; zapis se ne moze pouzdano prikazati u aktivnim izvjestajima bez valjanog batcha.'
  )

  const orphanResources = installedResources
    .filter((resource) => !resource.batchId || !batchesById.has(resource.batchId))
    .map((resource) => ({
      resourceId: resource.id,
      batchId: resource.batchId,
      institutionId: resource.institutionId,
      dataCenterName: resource.dataCenterName,
      resourceName: resource.resourceName,
    }))
  addFinding(
    findings,
    'medium',
    'resource_missing_batch',
    'Zapis resursa pokazuje na nepostojeci ili prazan batchId.',
    orphanResources,
    'Provjeriti izvorni uvoz; resurs se ne moze pouzdano povezati s aktivnom institucijom bez valjanog batcha.'
  )

  const financialInstitutionMismatches = financialEntries
    .filter((entry) => activeBatchIds.has(entry.batchId))
    .map((entry) => ({ entry, batch: activeBatchesById.get(entry.batchId) }))
    .filter(({ entry, batch }) => batch?.institutionId && entry.institutionId !== batch.institutionId)
    .map(({ entry, batch }) => ({
      entryId: entry.id,
      batchId: entry.batchId,
      childInstitutionId: entry.institutionId,
      batchInstitutionId: batch.institutionId,
      fileName: batch.fileName,
      sourceSheet: entry.sourceSheet,
      sourceRowIndex: entry.sourceRowIndex,
      year: entry.year,
      valueType: entry.valueType,
    }))
  addFinding(
    findings,
    'medium',
    'financial_entry_institution_mismatch',
    'Financijski zapis aktivnog batcha ima institutionId koji se razlikuje od batch institutionId.',
    financialInstitutionMismatches,
    'PR #48 u izvjestajima cita institutionId iz aktivnog batcha, ali podatke u bazi treba backfillati radi dugorocne konzistentnosti.'
  )

  const resourceInstitutionMismatches = installedResources
    .filter((resource) => activeBatchIds.has(resource.batchId))
    .map((resource) => ({ resource, batch: activeBatchesById.get(resource.batchId) }))
    .filter(({ resource, batch }) => batch?.institutionId && resource.institutionId !== batch.institutionId)
    .map(({ resource, batch }) => ({
      resourceId: resource.id,
      batchId: resource.batchId,
      childInstitutionId: resource.institutionId,
      batchInstitutionId: batch.institutionId,
      fileName: batch.fileName,
      dataCenterName: resource.dataCenterName,
      resourceName: resource.resourceName,
    }))
  addFinding(
    findings,
    'medium',
    'resource_institution_mismatch',
    'Zapis resursa aktivnog batcha ima institutionId koji se razlikuje od batch institutionId.',
    resourceInstitutionMismatches,
    'PR #48 u izvjestajima cita institutionId iz aktivnog batcha, ali podatke u bazi treba backfillati radi dugorocne konzistentnosti.'
  )

  const activeFinancialCountMismatches = activeBatches
    .map((batch) => ({
      batch,
      expected: batch.importSummary?.financialEntriesCount,
      actual: financialByBatch.get(batch.id)?.length ?? 0,
    }))
    .filter(({ expected, actual }) => typeof expected === 'number' && expected !== actual)
    .map(({ batch, expected, actual }) => ({
      batchId: batch.id,
      fileName: batch.fileName,
      institutionId: batch.institutionId,
      branchName: batch.importSummary?.institutionName,
      expected,
      actual,
    }))
  addFinding(
    findings,
    'high',
    'active_financial_count_mismatch',
    'Aktivni batch ima drugaciji broj financijskih zapisa od broja zapisanog u importSummary.',
    activeFinancialCountMismatches,
    'Usporediti batch s izvornim Excelom i po potrebi ponoviti uvoz ili korigirati summary.'
  )

  const activeResourceCountMismatches = activeBatches
    .map((batch) => ({
      batch,
      expected: batch.importSummary?.installedResourcesCount,
      actual: resourcesByBatch.get(batch.id)?.length ?? 0,
    }))
    .filter(({ expected, actual }) => typeof expected === 'number' && expected !== actual)
    .map(({ batch, expected, actual }) => ({
      batchId: batch.id,
      fileName: batch.fileName,
      institutionId: batch.institutionId,
      branchName: batch.importSummary?.institutionName,
      expected,
      actual,
    }))
  addFinding(
    findings,
    'medium',
    'active_resource_count_mismatch',
    'Aktivni batch ima drugaciji broj resursa od broja zapisanog u importSummary.',
    activeResourceCountMismatches,
    'Usporediti batch s izvornim Excelom i po potrebi ponoviti uvoz ili korigirati summary.'
  )

  const issueCountMismatches = nonDeletedBatches
    .map((batch) => {
      const batchIssues = issuesByBatch.get(batch.id) ?? []
      const unresolved = batchIssues.filter((issue) => !issue.resolvedAt)
      const errorCount = unresolved.filter((issue) => issue.severity === 'error').length
      const warningCount = unresolved.filter((issue) => issue.severity === 'warning').length
      return {
        batch,
        actualErrorCount: errorCount,
        actualWarningCount: warningCount,
        storedErrorCount: Number(batch.errorCount ?? 0),
        storedWarningCount: Number(batch.warningCount ?? 0),
      }
    })
    .filter((item) => item.actualErrorCount !== item.storedErrorCount || item.actualWarningCount !== item.storedWarningCount)
    .map((item) => ({
      batchId: item.batch.id,
      fileName: item.batch.fileName,
      institutionId: item.batch.institutionId,
      storedErrorCount: item.storedErrorCount,
      actualErrorCount: item.actualErrorCount,
      storedWarningCount: item.storedWarningCount,
      actualWarningCount: item.actualWarningCount,
    }))
  addFinding(
    findings,
    'medium',
    'batch_issue_count_mismatch',
    'Broj gresaka/upozorenja na batchu ne odgovara stvarnim nerijesenim importIssues zapisima.',
    issueCountMismatches,
    'Pokrenuti refresh brojaca ili otvoriti batch u aplikaciji nakon deploya PR-a #48 koji brojeve racuna iz stvarnih issue zapisa.'
  )

  const financialNormalizationMismatches = financialEntries
    .map((entry) => ({
      entry,
      normalizedRaw: normalizeAmount(entry.rawValue),
    }))
    .filter(({ entry, normalizedRaw }) => {
      const normalizedValueMatches = numbersEqual(normalizedRaw, entry.normalizedValue)
      const amountMatches = numbersEqual(entry.normalizedValue, entry.amount)
      return !normalizedValueMatches || !amountMatches
    })
    .map(({ entry, normalizedRaw }) => ({
      entryId: entry.id,
      batchId: entry.batchId,
      institutionId: entry.institutionId,
      sourceSheet: entry.sourceSheet,
      sourceRowIndex: entry.sourceRowIndex,
      year: entry.year,
      valueType: entry.valueType,
      rawValue: entry.rawValue,
      normalizedFromRaw: normalizedRaw,
      storedNormalizedValue: entry.normalizedValue,
      storedAmount: entry.amount,
    }))
  addFinding(
    findings,
    'high',
    'financial_normalization_mismatch',
    'rawValue, normalizedValue i amount nisu medjusobno uskladjeni.',
    financialNormalizationMismatches,
    'Provjeriti ove zapise prije potvrde izvjestaja; moguce je da su nastali prije stroze normalizacije brojeva.'
  )

  const financialByBatchSheetRowYearType = new Map()
  for (const entry of financialEntries) {
    const key = [
      entry.batchId,
      entry.sourceSheet,
      entry.sourceRowIndex,
      entry.year,
      entry.valueType,
    ].join('::')
    const list = financialByBatchSheetRowYearType.get(key) ?? []
    list.push(entry)
    financialByBatchSheetRowYearType.set(key, list)
  }

  const unresolvedCorrections = []
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
    const matches = financialByBatchSheetRowYearType.get(key) ?? []
    const correctedAmount = normalizeAmount(issue.correctedValue)

    if (matches.length !== 1) {
      unresolvedCorrections.push({
        issueId: issue.id,
        batchId: issue.batchId,
        sheetName: issue.sheetName,
        rowLabel: issue.rowLabel,
        fieldName: issue.fieldName,
        correctedValue: issue.correctedValue,
        matchCount: matches.length,
      })
      continue
    }

    const entry = matches[0]
    if (!numbersEqual(correctedAmount, entry.normalizedValue) || !numbersEqual(entry.normalizedValue, entry.amount)) {
      unresolvedCorrections.push({
        issueId: issue.id,
        entryId: entry.id,
        batchId: issue.batchId,
        sheetName: issue.sheetName,
        rowLabel: issue.rowLabel,
        fieldName: issue.fieldName,
        correctedValue: issue.correctedValue,
        correctedAmount,
        storedNormalizedValue: entry.normalizedValue,
        storedAmount: entry.amount,
        rawValue: entry.rawValue,
      })
    }
  }
  addFinding(
    findings,
    'high',
    'manual_financial_correction_not_applied',
    'Rucno rijesena financijska greska nije vidljiva u odgovarajucem financialEntries zapisu.',
    unresolvedCorrections,
    'Za ove stare korekcije treba pokrenuti backfill ili ponovo rucno spremiti ispravak nakon deploya PR-a #48.'
  )

  const activeEntries = financialEntries.filter((entry) => activeBatchIds.has(entry.batchId))
  const totalsByYearAndType = []
  for (const [key, entries] of groupBy(activeEntries, (entry) => `${entry.year} ${entry.valueType}`)) {
    totalsByYearAndType.push({
      key,
      count: entries.length,
      amountSum: entries.reduce((sum, entry) => sum + (typeof entry.amount === 'number' ? entry.amount : 0), 0),
    })
  }
  totalsByYearAndType.sort((a, b) => a.key.localeCompare(b.key))

  const severityCounts = findings.reduce((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1
    return acc
  }, {})

  return {
    generatedAt: new Date().toISOString(),
    projectId: firebaseConfig.projectId,
    summary: {
      institutions: institutions.length,
      importBatches: batches.length,
      activeBatches: activeBatches.length,
      financialEntries: financialEntries.length,
      activeFinancialEntries: activeEntries.length,
      installedResources: installedResources.length,
      importIssues: issues.length,
      unresolvedIssues: issues.filter((issue) => !issue.resolvedAt).length,
      severityCounts,
      totalsByYearAndType,
    },
    findings,
  }
}

function formatReport(report) {
  const lines = []
  lines.push(`DII Firestore data audit`)
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Project: ${report.projectId}`)
  lines.push('')
  lines.push('Summary')
  for (const [key, value] of Object.entries(report.summary)) {
    if (key === 'totalsByYearAndType' || key === 'severityCounts') continue
    lines.push(`- ${key}: ${value}`)
  }
  lines.push(`- finding groups: ${report.findings.length}`)
  lines.push(`- severity groups: ${JSON.stringify(report.summary.severityCounts)}`)
  lines.push('')
  lines.push('Active totals')
  for (const total of report.summary.totalsByYearAndType) {
    lines.push(`- ${total.key}: count=${total.count}, amountSum=${total.amountSum}`)
  }
  lines.push('')
  lines.push('Findings')
  if (report.findings.length === 0) {
    lines.push('- No findings.')
  } else {
    for (const finding of report.findings) {
      lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`)
      lines.push(`  Count: ${finding.count}`)
      lines.push(`  Recommendation: ${finding.recommendation}`)
      lines.push(`  Samples: ${JSON.stringify(finding.samples, null, 2).replace(/\n/g, '\n  ')}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

async function main() {
  console.log(`DII Firestore data audit (${firebaseConfig.projectId})`)
  console.log('Ova skripta samo cita Firestore; ne upisuje i ne mijenja podatke.')

  const email = process.env.FIREBASE_EMAIL ?? (await ask('Firebase email: '))
  const password = process.env.FIREBASE_PASSWORD ?? (await askHidden('Firebase password: '))

  const app = initializeApp(firebaseConfig, `audit-${Date.now()}`)
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

    const report = buildAudit(data)
    const outDir = path.resolve('scripts')
    await mkdir(outDir, { recursive: true })

    const jsonPath = path.join(outDir, 'firestore-data-audit-report.json')
    const textPath = path.join(outDir, 'firestore-data-audit-report.txt')
    await writeFile(jsonPath, `${JSON.stringify(serialize(report), null, 2)}\n`, 'utf8')
    await writeFile(textPath, formatReport(serialize(report)), 'utf8')

    console.log('')
    console.log(`Audit gotov.`)
    console.log(`JSON: ${jsonPath}`)
    console.log(`TXT:  ${textPath}`)
    console.log(`Finding groups: ${report.findings.length}`)

    const seriousCount = report.findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high').length
    if (seriousCount > 0) {
      console.log(`Ozbiljnih finding grupa: ${seriousCount}`)
      process.exitCode = 2
    }
  } finally {
    await signOut(auth).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('')
  console.error('Audit nije uspio.')
  console.error(error?.message ?? error)
  process.exitCode = 1
})
