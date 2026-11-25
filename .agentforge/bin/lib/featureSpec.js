// Writing specs for features that already exist. The
// Product Manager reads a feature's code and writes its spec: what it does today, with
// acceptance criteria that each cite the lines they rest on. The model only writes; this
// module decides whether the spec is acceptable. It normalizes the spec, checks every
// criterion against the repository text, and says whether the feature's spec layer may
// be marked complete. The model never sets that status.

import { verifyEvidence } from './analysis.js'

// A spec must have at least this many acceptance criteria to count as complete.
export const MIN_CRITERIA = 3
export const MAX_CRITERIA = 15
const SUPPORTED = new Set(['verified', 'verified_elsewhere'])

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

// The paths a catalog feature owns, from its anchors ("module:public/js/agent",
// "route:/api/goals", "doc:docs/GOALS.md"): where the Product Manager starts reading.
export function anchorPaths(anchors) {
  return [...new Set((Array.isArray(anchors) ? anchors : [])
    .map(anchor => (typeof anchor === 'string' ? anchor : anchor?.id || ''))
    .map(anchor => {
      const [kind, ...rest] = anchor.split(':')
      const value = rest.join(':')
      return ['module', 'doc', 'route'].includes(kind) && value ? `${kind === 'route' ? 'route ' : ''}${value}` : ''
    })
    .filter(Boolean))]
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

// A scenario is one flow through the feature, step by step: the main flow, an
// alternative, or a failure and how it recovers. Each step names who acts — the user,
// the agent or the system — and, for an agent step, whether it needs the user's approval
// first. Scenarios carry the order and the approval points that one-line criteria lose.
export const SCENARIO_KINDS = Object.freeze(['main', 'alternative', 'failure'])
const ACTORS = ['user', 'agent', 'system']

function normalizeScenario(item, index) {
  const kind = SCENARIO_KINDS.includes(item?.kind) ? item.kind : 'main'
  const steps = (Array.isArray(item?.steps) ? item.steps : [])
    .map(step => ({ actor: ACTORS.includes(step?.actor) ? step.actor : 'system', action: text(step?.action), approval: step?.approval === true }))
    .filter(step => step.action)
  return { id: `SC${index + 1}`, title: text(item?.title), kind, steps }
}

// Coerce the model's spec. Criteria and requirements get stable ids (AC1…, FS-R01…).
export function normalizeFeatureSpec(result) {
  const criteria = (Array.isArray(result?.acceptanceCriteria) ? result.acceptanceCriteria : [])
    .map(item => ({
      given: text(item?.given),
      when: text(item?.when),
      then: text(item?.then),
      surface: text(item?.surface),
      evidence: (Array.isArray(item?.evidence) ? item.evidence : []).map(normalizeEvidence).filter(evidence => evidence.path),
      // The tests that check this criterion ({ path, name }), and what check-qa found
      // when it ran them: pass | fail | missing (a linked test wasn't found) | untested.
      tests: (Array.isArray(item?.tests) ? item.tests : []).map(test => ({ path: text(test?.path).replace(/^\.?\//, ''), name: text(test?.name) })).filter(test => test.path && test.name).slice(0, 6),
      ...(['pass', 'fail', 'missing', 'untested'].includes(item?.qa) ? { qa: item.qa } : {}),
    }))
    .filter(item => item.given || item.when || item.then)
    .slice(0, MAX_CRITERIA)
    .map((item, index) => ({ id: `AC${index + 1}`, ...item }))
  return {
    objective: text(result?.objective),
    summary: text(result?.summary),
    howItWorks: text(result?.howItWorks),
    inScope: strings(result?.inScope),
    outOfScope: strings(result?.outOfScope),
    userStories: strings(result?.userStories),
    functionalRequirements: strings(result?.functionalRequirements).map((requirement, index) => ({ id: `FS-R${String(index + 1).padStart(2, '0')}`, requirement })),
    acceptanceCriteria: criteria,
    scenarios: (Array.isArray(result?.scenarios) ? result.scenarios : []).map(normalizeScenario).filter(item => item.title || item.steps.length),
    risks: strings(result?.risks),
    openQuestions: strings(result?.openQuestions),
    limitations: strings(result?.limitations),
  }
}

// The summary is for anyone reading the spec: what the user gets and how it behaves, in
// plain words. How it's built goes in howItWorks, so the check sends code references and
// long walkthroughs there.
export const SUMMARY_LIMITS = { objective: 40, summary: 90 }
const CODE_REFERENCE = [
  /[\w.-]+\/[\w./-]*\.[a-z]{1,5}\b/gi, // a path: public/js/agent/run.js
  /\b[\w-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs|java|kt|swift|json|sql|css|html|ya?ml)\b/gi, // a file name: run.js
  /\b[A-Za-z_$][\w$.]*\(\)/g, // a call: run()
  /(?:^|[\s(])\/api\/[\w/-]+/g, // an endpoint: /api/llm
]
export function codeReferences(value) {
  const found = new Set()
  for (const pattern of CODE_REFERENCE) for (const match of String(value || '').matchAll(pattern)) found.add(match[0].trim().replace(/\/+$/, ''))
  return [...found]
}
const words = (value) => String(value || '').split(/\s+/).filter(Boolean).length
export function summaryProblems(spec) {
  const problems = []
  for (const field of ['objective', 'summary']) {
    const label = field === 'objective' ? 'The objective' : 'The summary'
    const refs = codeReferences(spec[field])
    if (refs.length) problems.push(`${label} names code (${refs.slice(0, 4).join(', ')}). Say what the user gets and how it behaves; put how it’s built in howItWorks.`)
    const count = words(spec[field])
    if (count > SUMMARY_LIMITS[field]) problems.push(`${label} is ${count} words; keep it under ${SUMMARY_LIMITS[field]} and move the detail to the requirements or howItWorks.`)
  }
  return problems
}

// Check the spec. Every criterion needs a given, a when, and a then, and at least one
// citation whose quote is found in the code; the spec needs an objective and at least
// MIN_CRITERIA criteria. `getText(path)` resolves to a file's text, or null.
// Returns the spec with each criterion's evidence checked, and { passed, problems }.
export async function checkFeatureSpec(spec, getText) {
  const cache = new Map()
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, Promise.resolve(getText(path)).catch(() => null))
    return cache.get(path)
  }
  const problems = []
  if (!spec.objective) problems.push('The objective is empty: say in one or two sentences what the feature does for the user.')
  problems.push(...summaryProblems(spec))
  const acceptanceCriteria = []
  for (const criterion of spec.acceptanceCriteria) {
    const evidence = []
    for (const item of criterion.evidence) {
      const check = verifyEvidence(item, await read(item.path))
      // A quote found away from its cited lines is cited where it really is, so the spec
      // never shows a wrong line number.
      if (check.status === 'verified_elsewhere' && check.actualLine) {
        const span = item.startLine && item.endLine ? item.endLine - item.startLine : 0
        evidence.push({ ...item, startLine: check.actualLine, endLine: check.actualLine + span, check: { ...check, citedLine: item.startLine } })
      } else evidence.push({ ...item, check })
    }
    const supported = evidence.some(item => SUPPORTED.has(item.check.status))
    const missing = ['given', 'when', 'then'].filter(part => !criterion[part])
    const issues = []
    if (missing.length) issues.push(`is missing its ${missing.join(', ')}`)
    if (evidence.length === 0) issues.push('cites no code')
    else if (!supported) issues.push(`cites code whose quote was not found (${evidence.map(item => `${item.path}${item.startLine ? `:${item.startLine}` : ''}: ${item.check.status.replace(/_/g, ' ')}`).join('; ')})`)
    if (issues.length) problems.push(`${criterion.id} ${issues.join(' and ')}.`)
    acceptanceCriteria.push({ ...criterion, evidence, verified: supported && missing.length === 0 })
  }
  // Scenarios are optional; one that is there must be a real flow.
  for (const scenario of spec.scenarios || []) {
    const issues = []
    if (!scenario.title) issues.push('has no title')
    if (scenario.steps.length < 2) issues.push('needs at least two steps')
    if (scenario.steps.some(step => step.approval && step.actor !== 'agent')) issues.push('marks a step that is not the agent\'s as needing approval')
    if (issues.length) problems.push(`Scenario ${scenario.id} ${issues.join(' and ')}.`)
  }
  if (acceptanceCriteria.length < MIN_CRITERIA) problems.push(`Only ${acceptanceCriteria.length} acceptance criteria; write at least ${MIN_CRITERIA}, each citing the code it describes.`)
  const verified = acceptanceCriteria.filter(item => item.verified).length
  return {
    spec: { ...spec, acceptanceCriteria },
    passed: problems.length === 0,
    problems,
    counts: { criteria: acceptanceCriteria.length, verified },
  }
}

// One criterion as the single line the delivery pipeline reads (featureSpec.acceptanceCriteria).
export function criterionLine(criterion) {
  return `${criterion.id}: Given ${criterion.given}, when ${criterion.when}, then ${criterion.then}${criterion.surface ? ` (${criterion.surface})` : ''}`
}

// The feature's spec layer to store, from a checked spec. Code, not the model, decides
// the status: complete only when every check passed; otherwise in progress, with the
// problems kept so the map can say the spec needs review.
export function specLayer({ checked, model, writtenAt = new Date().toISOString(), attempts = 1 }) {
  return {
    status: checked.passed ? 'complete' : 'in_progress',
    acceptanceCriteria: checked.spec.acceptanceCriteria.map(criterionLine),
    document: checked.spec,
    review: checked.passed ? null : { problems: checked.problems },
    counts: checked.counts,
    writtenBy: 'product_manager',
    writtenAt,
    model: model || null,
    attempts,
  }
}

const list = (items) => items.map(item => `- ${item}`)

// The spec as Markdown in the team's feature-spec template shape.
// The feature's state at a glance, for the top of its spec page: the feature's own
// lifecycle (built, partial, deprecated, removed), its spec, and its QA.
const FEATURE_STATUS_LABEL = { built: 'Built', partial: 'Partly built', deprecated: 'Deprecated', removed: 'Removed' }
const SPEC_STATUS_LABEL = { complete: 'Complete', in_progress: 'In progress', not_started: 'Not started', not_checked: 'Not checked' }
export function featureStatusLine({ featureStatus = '', specStatus = '', qa = null } = {}) {
  const parts = []
  if (featureStatus) parts.push(`**Feature:** ${FEATURE_STATUS_LABEL[featureStatus] || featureStatus}`)
  if (specStatus) parts.push(`**Spec:** ${SPEC_STATUS_LABEL[specStatus] || specStatus.replace(/_/g, ' ')}`)
  const counts = qa?.counts
  if (counts?.criteria) {
    const failing = counts.failing ? `, ${counts.failing} failing` : ''
    parts.push(`**QA:** ${counts.passing} of ${counts.criteria} criteria pass${failing}`)
  } else if (specStatus) parts.push('**QA:** not run')
  return parts.join(' · ')
}

export function featureSpecMarkdown(name, spec, { featureId = '', writtenAt = '', featureStatus = '', specStatus = '', qa = null } = {}) {
  const cell = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
  // "The user presses Enter." reads as "the user presses Enter" inside a sentence; an
  // acronym (API, UI) keeps its capital.
  const clause = (value) => {
    const textValue = String(value || '').trim().replace(/[.]+$/, '')
    // Only an opening common word is lowercased; a name (Muse, Gmail, Settings) keeps its capital.
    return /^(?:A|An|The|This|That|These|Those|It|Its|They|Their|Each|Every|No|Nothing|Only|Some|Any|All|Several|One|Another|Both|Either|Neither|There|When|If|Once)\b/.test(textValue) ? textValue[0].toLowerCase() + textValue.slice(1) : textValue
  }
  const criteria = spec.acceptanceCriteria || []
  const verified = criteria.filter(criterion => criterion.verified).length
  const out = ['---', `title: ${name}`, 'type: Feature spec', featureId ? `featureId: ${featureId}` : null, featureStatus ? `featureStatus: ${featureStatus}` : null, 'status: Written from code', 'owner: Product Manager (Maya)', '---', '', `# ${name}`, ''].filter(line => line !== null)
  const statusLine = featureStatusLine({ featureStatus, specStatus, qa })
  if (statusLine) out.push(statusLine, '')
  if (featureStatus === 'deprecated') out.push('> **Deprecated.** This feature is no longer used. Its code is still in the repository; this spec is kept as a record of what it did.', '')
  if (featureStatus === 'removed') out.push('> **Removed.** This feature and its code are gone; this spec is kept as a record of what it did.', '')
  const glance = []
  if (criteria.length) glance.push(`**${verified} of ${criteria.length}** acceptance criteria checked against the code`)
  if (spec.risks.length) glance.push(`${spec.risks.length} risk${spec.risks.length === 1 ? '' : 's'}`)
  if (spec.openQuestions.length) glance.push(`${spec.openQuestions.length} open question${spec.openQuestions.length === 1 ? '' : 's'}`)
  if (glance.length) out.push(glance.join(' · '), '')
  out.push(`_Written by Maya from the code${writtenAt ? ` on ${writtenAt.slice(0, 10)}` : ''}. It describes the feature as built, not as planned._`, '')
  if (spec.objective || spec.summary) {
    out.push('## Summary', '')
    if (spec.objective) out.push(`**${spec.objective}**`, '')
    if (spec.summary) out.push(spec.summary, '')
  }
  if (spec.userStories.length) out.push('## User stories', '', ...list(spec.userStories), '')
  if (spec.inScope.length || spec.outOfScope.length) {
    out.push('## Scope', '')
    if (spec.inScope.length) out.push('**In scope**', '', ...list(spec.inScope), '')
    if (spec.outOfScope.length) out.push('**Out of scope**', '', ...list(spec.outOfScope), '')
  }
  if (spec.functionalRequirements.length) {
    out.push('## Requirements', '', '| ID | Requirement |', '|---|---|', ...spec.functionalRequirements.map(item => `| ${item.id} | ${cell(item.requirement)} |`), '')
  }
  if (criteria.length) {
    const showSurface = criteria.some(criterion => criterion.surface)
    const showCheck = criteria.some(criterion => criterion.verified !== undefined)
    // Once check-qa has run: did the criterion's tests pass?
    const showQa = criteria.some(criterion => criterion.qa)
    const QA_CELL = { pass: '✓ passes', fail: '✗ fails', missing: '? test not found', untested: '— no test' }
    const head = ['#', 'Given', 'When', 'Then', ...(showSurface ? ['Where'] : []), ...(showCheck ? ['In code'] : []), ...(showQa ? ['Tested'] : [])]
    out.push('## Acceptance criteria', '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`)
    for (const criterion of criteria) {
      const row = [criterion.id, cell(clause(criterion.given)), cell(clause(criterion.when)), cell(clause(criterion.then)), ...(showSurface ? [cell(criterion.surface)] : []), ...(showCheck ? [criterion.verified ? '✓' : '✗ not found'] : []), ...(showQa ? [QA_CELL[criterion.qa] || '— no test'] : [])]
      out.push(`| ${row.join(' | ')} |`)
    }
    out.push('', '_The code each criterion rests on is under Evidence, at the end._', '')
  }
  if (spec.scenarios?.length) {
    out.push('## Scenarios', '')
    for (const scenario of spec.scenarios) {
      out.push(`### ${scenario.id} ${scenario.title}${scenario.kind === 'main' ? '' : ` (${scenario.kind})`}`, '')
      scenario.steps.forEach((step, index) => out.push(`${index + 1}. **${step.actor[0].toUpperCase()}${step.actor.slice(1)}**${step.approval ? ' _(after the user approves)_' : ''}: ${step.action}`))
      out.push('')
    }
  }
  if (spec.risks.length) out.push('## Risks', '', ...list(spec.risks), '')
  if (spec.openQuestions.length) out.push('## Open questions', '', ...list(spec.openQuestions), '')
  if (spec.howItWorks) out.push('## How it works', '', '_For engineers: where the behavior above lives in the code._', '', spec.howItWorks, '')
  const cited = criteria.filter(criterion => criterion.evidence.length)
  if (cited.length) {
    out.push('## Evidence', '', '| # | Code | Quote |', '|---|---|---|')
    for (const criterion of cited) {
      criterion.evidence.forEach((item, index) => {
        const quote = item.quote ? `\`${cell(item.quote.replace(/`/g, "'").trim().slice(0, 120))}\`` : ''
        out.push(`| ${index === 0 ? criterion.id : ''} | \`${item.path}${item.startLine ? `:${item.startLine}` : ''}\` | ${quote} |`)
      })
    }
    out.push('')
  }
  const tested = criteria.filter(criterion => criterion.tests?.length)
  if (tested.length) {
    out.push('## Tests', '', '| # | Test | File |', '|---|---|---|')
    for (const criterion of tested) criterion.tests.forEach((test, index) => out.push(`| ${index === 0 ? criterion.id : ''} | ${cell(test.name)} | \`${test.path}\` |`))
    out.push('')
  }
  if (spec.limitations.length) out.push('## Not confirmed from the code', '', ...list(spec.limitations), '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
