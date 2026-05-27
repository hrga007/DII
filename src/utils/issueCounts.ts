import type { ImportIssue } from '../models/financialEntry'

export interface IssueCounts {
  errorCount: number
  warningCount: number
}

type CountableIssue = Pick<ImportIssue, 'batchId' | 'severity' | 'resolvedAt'>

export function countUnresolvedIssuesByBatch(issues: CountableIssue[]): Map<string, IssueCounts> {
  const counts = new Map<string, IssueCounts>()
  issues.forEach((issue) => {
    if (issue.resolvedAt) return
    const current = counts.get(issue.batchId) ?? { errorCount: 0, warningCount: 0 }
    if (issue.severity === 'error') current.errorCount += 1
    if (issue.severity === 'warning') current.warningCount += 1
    counts.set(issue.batchId, current)
  })
  return counts
}
