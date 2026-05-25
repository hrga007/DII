import { SUBMISSION_REGISTRY, type RegistryEntry } from '../data/submissionRegistry'

const STOP_WORDS = new Set([
  'd.o.o.', 'd.d.', 'j.t.d.', 'd.o.o', 'd.d', 'jtd',
  'za', 'i', 'u', 'na', 'od', 'do', 'iz', 'sa', 'po',
])

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[().,\-]/g, ' ')
      .split(/\s+/)
      .map(t => t.replace(/\.$/, ''))
      .filter(t => t.length > 1 && !STOP_WORDS.has(t))
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(t => b.has(t)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

export interface RegistryCandidate {
  index: number
  entry: RegistryEntry
  score: number
}

export function findCandidates(institutionName: string, top = 5): RegistryCandidate[] {
  const tokens = tokenize(institutionName)
  return SUBMISSION_REGISTRY
    .map((entry, index) => ({ index, entry, score: jaccard(tokens, tokenize(entry.name)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
}

export function findBestMatch(institutionName: string): RegistryCandidate | null {
  const best = findCandidates(institutionName, 1)[0]
  return best && best.score >= 0.8 ? best : null
}

export function scoreLabel(score: number): string {
  if (score >= 0.8) return 'Visoka sličnost'
  if (score >= 0.5) return 'Srednja sličnost'
  return 'Niska sličnost'
}
