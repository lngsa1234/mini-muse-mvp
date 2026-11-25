// Analysis work items. An analysis — an architecture
// review, an audit, a gap analysis — is answered by one role reading the repository and
// writing a report; it never enters the spec → plan → build → QA pipeline. This module
// is pure: it normalizes the role's report, checks every cited line against the
// repository text, renders the report as Markdown, and turns chosen findings into
// proposed work items. Fetching files is the caller's job (`getText`).

export const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info'])
export const FINDING_CATEGORIES = Object.freeze(['security', 'defect', 'reliability', 'performance', 'maintainability', 'doc_drift', 'product_gap', 'other'])
const FOLLOW_UP_TYPES = new Set(['feature', 'bug', 'chore'])
// How far (in lines) a quote may sit from its cited range and still count as found there:
// models are often off by a line or two when citing a range they read.
const LINE_SLACK = 3

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function strings(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function lineNumber(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeEvidence(item) {
  const startLine = lineNumber(item?.startLine)
  const endLine = lineNumber(item?.endLine)
  return {
    path: text(item?.path).replace(/^\.\//, ''),
    startLine,
    endLine: startLine && endLine && endLine >= startLine ? endLine : startLine,
    quote: typeof item?.quote === 'string' ? item.quote : '',
  }
}

// A summary that stops mid-sentence ("…and the") loses its unfinished tail, so the chat
// never shows a broken sentence. A summary with no complete sentence is kept as is.
export function completeSentences(value) {
  const summary = text(value)
  if (!summary || /[.!?)"'”’`:]$/.test(summary)) return summary
  const end = Math.max(summary.lastIndexOf('. '), summary.lastIndexOf('! '), summary.lastIndexOf('? '))
  return end > 0 ? summary.slice(0, end + 1) : summary
}

// Coerce the role's structured report. Findings are ordered most severe first and given
// stable ids (F1, F2, …) that the follow-up action refers to.
export function normalizeAnalysisReport(result) {
  const findings = (Array.isArray(result?.findings) ? result.findings : [])
    .filter(finding => text(finding?.title))
    .map(finding => {
      const proposed = finding.proposedWorkItem || {}
      return {
        title: text(finding.title),
        severity: SEVERITIES.includes(finding.severity) ? finding.severity : 'info',
        category: FINDING_CATEGORIES.includes(finding.category) ? finding.category : 'other',
        area: text(finding.area),
        detail: text(finding.detail),
        evidence: (Array.isArray(finding.evidence) ? finding.evidence : []).map(normalizeEvidence).filter(item => item.path),
        recommendation: text(finding.recommendation),
        proposedWorkItem: {
          type: FOLLOW_UP_TYPES.has(proposed.type) ? proposed.type : 'none',
          title: text(proposed.title) || text(finding.title),
          summary: text(proposed.summary) || text(finding.recommendation),
        },
      }
    })
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => SEVERITIES.indexOf(a.finding.severity) - SEVERITIES.indexOf(b.finding.severity) || a.index - b.index)
    .map(({ finding }, index) => ({ id: `F${index + 1}`, ...finding }))
  return {
    title: text(result?.title) || 'Analysis',
    summary: completeSentences(result?.summary),
    sections: (Array.isArray(result?.sections) ? result.sections : [])
      .map(section => ({ heading: text(section?.heading), body: typeof section?.body === 'string' ? section.body.trim() : '' }))
      .filter(section => section.heading || section.body),
    findings,
    limitations: strings(result?.limitations),
  }
}

// Compare text ignoring whitespace runs and a copied line-number prefix ("12| ").
function squash(value) {
  return String(value)
    .split('\n')
    .map(line => line.replace(/^\s*\d+\|\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Check one piece of evidence against the file's text. Statuses:
//   verified          — the quote is in the cited lines (± LINE_SLACK)
//   verified_elsewhere — the quote is in the file, at `actualLine`, not where cited
//   quote_not_found   — the lines exist but do not contain the quote
//   no_quote          — the lines exist but there is nothing to check them against
//   line_out_of_range — the file is shorter than the cited line
//   file_not_found    — the path is not a readable file
export function verifyEvidence(evidence, fileText) {
  if (typeof fileText !== 'string') return { status: 'file_not_found' }
  const lines = fileText.split('\n')
  const start = evidence.startLine
  if (!start) return { status: 'line_out_of_range', totalLines: lines.length }
  const quote = squash(evidence.quote)
  if (!quote) return { status: 'no_quote' }
  // A line past the end of the file (it got shorter, or the line was guessed) still gets
  // the quote looked for elsewhere below; only a quote found nowhere is out of range.
  const outOfRange = start > lines.length
  const end = Math.min(lines.length, evidence.endLine || start)
  if (!outOfRange) {
    const window = squash(lines.slice(Math.max(0, start - 1 - LINE_SLACK), Math.min(lines.length, end + LINE_SLACK)).join('\n'))
    if (window.includes(quote)) return { status: 'verified' }
  }
  // Elsewhere in the file: the first line the quote starts on, widening the window only
  // as far as the cited range is long, so the reported line is the quote's own.
  const span = outOfRange ? Math.max(1, (evidence.endLine || start) - start + 1) : Math.max(1, end - start + 1)
  for (let size = 1; size <= span + 1; size += 1) {
    const at = lines.findIndex((_, index) => squash(lines.slice(index, index + size).join('\n')).includes(quote))
    if (at >= 0) return { status: 'verified_elsewhere', actualLine: at + 1 }
  }
  return outOfRange ? { status: 'line_out_of_range', totalLines: lines.length } : { status: 'quote_not_found' }
}

const SUPPORTED = new Set(['verified', 'verified_elsewhere'])

// Check every finding's evidence. A finding is verified when all its evidence checks
// out, partial when some does, and unverified when none does or it cites nothing.
// `getText(path)` resolves to the file's text, or null when it cannot be read.
export async function verifyReport(report, getText) {
  const cache = new Map()
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, Promise.resolve(getText(path)).catch(() => null))
    return cache.get(path)
  }
  const findings = []
  for (const finding of report.findings) {
    const evidence = []
    for (const item of finding.evidence) evidence.push({ ...item, check: verifyEvidence(item, await read(item.path)) })
    const supported = evidence.filter(item => SUPPORTED.has(item.check.status)).length
    const verification = evidence.length === 0 || supported === 0 ? 'unverified' : supported === evidence.length ? 'verified' : 'partial'
    findings.push({ ...finding, evidence, verification })
  }
  const count = (status) => findings.filter(finding => finding.verification === status).length
  return {
    ...report,
    findings,
    verification: { findings: findings.length, verified: count('verified'), partial: count('partial'), unverified: count('unverified') },
  }
}

const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' }
const CHECK_LABEL = { verified: '✓', verified_elsewhere: '✓ (found at another line)', quote_not_found: '✗ quote not found', no_quote: '? no quote to check', line_out_of_range: '✗ line out of range', file_not_found: '✗ file not found' }

function citation(item) {
  const range = item.startLine ? (item.endLine && item.endLine !== item.startLine ? `:${item.startLine}-${item.endLine}` : `:${item.startLine}`) : ''
  const moved = item.check?.status === 'verified_elsewhere' ? ` (actually line ${item.check.actualLine})` : ''
  return `\`${item.path}${range}\`${moved}`
}

// The report as a Markdown document, e.g. for docs/ARCHITECTURE-REVIEW.md.
export function analysisMarkdown(report, { request = '', author = '', model = '', filesRead = [], createdAt = '' } = {}) {
  const out = [`# ${report.title}`, '']
  const meta = [author && `By ${author}`, createdAt && createdAt.slice(0, 10), model && `model ${model}`, filesRead.length && `${filesRead.length} files read`].filter(Boolean)
  if (meta.length) out.push(`_${meta.join(' · ')}_`, '')
  if (request) out.push(`> ${request.replace(/\n/g, '\n> ')}`, '')
  if (report.summary) out.push('## Summary', '', report.summary, '')
  for (const section of report.sections) out.push(`## ${section.heading}`, '', section.body, '')
  if (report.findings.length) {
    const v = report.verification
    out.push('## Findings', '')
    if (v) out.push(`${v.findings} findings: ${v.verified} verified against the code, ${v.partial} partly verified, ${v.unverified} unverified.`, '')
    for (const finding of report.findings) {
      const badge = finding.verification && finding.verification !== 'verified' ? ` _(${finding.verification})_` : ''
      out.push(`### ${finding.id}. ${finding.title} — ${SEVERITY_LABEL[finding.severity]}${badge}`, '')
      out.push(`**Area:** ${finding.area || '—'} · **Category:** ${finding.category.replace(/_/g, ' ')}`, '')
      if (finding.detail) out.push(finding.detail, '')
      if (finding.evidence.length) {
        out.push('**Evidence**', '')
        for (const item of finding.evidence) out.push(`- ${citation(item)}${item.check ? ` ${CHECK_LABEL[item.check.status] || ''}` : ''}${item.quote ? ` — \`${item.quote.replace(/`/g, "'").trim().slice(0, 160)}\`` : ''}`)
        out.push('')
      }
      if (finding.recommendation) out.push(`**Recommendation:** ${finding.recommendation}`, '')
      if (finding.proposedWorkItem.type !== 'none') out.push(`**Proposed ${finding.proposedWorkItem.type}:** ${finding.proposedWorkItem.title}`, '')
    }
  }
  if (report.limitations.length) out.push('## Limitations', '', ...report.limitations.map(item => `- ${item}`), '')
  if (filesRead.length) out.push('<details><summary>Files read</summary>', '', ...filesRead.map(path => `- \`${path}\``), '', '</details>', '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

// The request an analysis answers, from its stored work item: the human's own message
// when it was kept, then triage's reading of it. The message comes first and wins where
// they differ, because triage's summary can carry assumptions the human never made.
export function analysisRequestOf(item) {
  const reading = [text(item?.title), text(item?.summary)].filter(Boolean).join('\n\n')
  const message = text(item?.runState?.analysis?.message)
  if (!message) return reading
  return `The human asked, in their own words:\n${message}\n\nTriage's reading of it (follow the human's words where they differ):\n${reading}`
}

// Proposed work items for the findings a human chose to act on. Only findings with a
// follow-up type are filed; each keeps its evidence in the summary so the role that picks
// it up starts from the cited lines.
export function findingWorkItemRows({ repository, analysisId, report, findingIds }) {
  const chosen = new Set(Array.isArray(findingIds) ? findingIds : [])
  return (report?.findings || [])
    .filter(finding => chosen.has(finding.id) && FOLLOW_UP_TYPES.has(finding.proposedWorkItem?.type))
    .map(finding => {
      const evidence = finding.evidence.slice(0, 3).map(item => `${item.path}${item.startLine ? `:${item.startLine}` : ''}`).join(', ')
      return {
        repository,
        source: 'analysis',
        parent_id: analysisId || null,
        type: finding.proposedWorkItem.type,
        title: finding.proposedWorkItem.title,
        summary: [finding.proposedWorkItem.summary, evidence && `Evidence: ${evidence}.`].filter(Boolean).join(' '),
        rationale: `From finding ${finding.id} (${finding.severity}) of the analysis "${report.title}": ${finding.title}`,
        status: 'proposed',
      }
    })
}

// --- Filing findings automatically ----------------------
// Code, not the model, decides which findings become work items: a finding is filed
// when it proposes work, its evidence was confirmed in the code, and its severity is
// medium or above. Everything else stays a note in the report. A finding that matches an
// open work item is linked to it instead of filed twice. Filed items are only proposed:
// nothing starts until a human starts it and approves its plan.
export const AUTO_FILE_SEVERITIES = Object.freeze(['critical', 'high', 'medium'])
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'when', 'that', 'this', 'from', 'into', 'are', 'not', 'add', 'fix', 'make', 'use', 'its', 'can', 'should'])

function titleWords(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length >= 3 && !STOPWORDS.has(word)))
}

// Whether two work titles name the same work: at least half their meaningful words shared.
export function sameWork(a, b) {
  const left = titleWords(a)
  const right = titleWords(b)
  if (left.size === 0 || right.size === 0) return false
  const shared = [...left].filter(word => right.has(word)).length
  return shared / Math.min(left.size, right.size) >= 0.6 && shared / Math.max(left.size, right.size) >= 0.4
}

// Split a report's findings into what to file, what is already on the work list, and
// notes. `openItems` are the repository's open feature, bug, and chore items; `filed`
// maps finding ids already filed from this analysis.
export function autoFilePlan({ report, openItems = [], filed = {} }) {
  const plan = { file: [], duplicates: [], notes: [] }
  for (const finding of report?.findings || []) {
    if (filed[finding.id]) continue
    const proposesWork = FOLLOW_UP_TYPES.has(finding.proposedWorkItem?.type)
    const qualifies = proposesWork && finding.verification === 'verified' && AUTO_FILE_SEVERITIES.includes(finding.severity)
    if (!qualifies) { plan.notes.push(finding.id); continue }
    const match = openItems.find(item => FOLLOW_UP_TYPES.has(item.type) && (sameWork(item.title, finding.proposedWorkItem.title) || sameWork(item.title, finding.title)))
    if (match) plan.duplicates.push({ findingId: finding.id, itemId: match.id, title: match.title })
    else plan.file.push(finding.id)
  }
  return plan
}
