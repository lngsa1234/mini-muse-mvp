// Pull-request checks. On every pull request
// AgentForge posts two GitHub check runs, worked out from the PR's changed files with no
// model call:
//   Spec drift    — Maya's side: which features in the feature map the PR changes, whether
//                   their specs move with the code, and new code no feature owns.
//   Architecture  — Alex's side: which accepted decision records and invariants govern the
//                   code the PR changes, and changes that look major (a new dependency, a
//                   migration, infrastructure, auth) with no decision record in the PR.
// Both are advisory: a finding gives a neutral conclusion, never a failure, so the checks
// inform the reviewer without blocking a merge. Everything here is pure.
//
// This module imports only featureEvidence.js and analysis.js, so the Claude Code plugin
// can bundle it unchanged (plugins/lynncraft/scripts/lib, kept identical by a test).
import { codeAnchorPaths, coveredAnchorPaths } from './featureEvidence.js'
import { verifyEvidence } from './analysis.js'

// The same paths teamDocs.js and architectureRecord.js write to (a test keeps them equal).
const slugify = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
export const specPath = (feature) => `docs/specs/${slugify(String(feature?.id || '').split('::').pop() || feature?.name)}.md`
export const adrPath = (decision) => `docs/adr/${String(decision.number).padStart(4, '0')}-${slugify(decision.title) || 'decision'}.md`

export const CHECK_NAMES = Object.freeze({ spec: 'AgentForge / Spec drift', architecture: 'AgentForge / Architecture' })
const LIST_LIMIT = 15
const CODE_EXTENSIONS = /\.(js|jsx|mjs|cjs|ts|tsx|py|go|rb|rs|java|kt|swift|vue|svelte|php|cs|c|cc|cpp|h)$/i
const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/i

const under = (path, file) => file === path || file.startsWith(`${path}/`)
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

// The PR's files as plain paths. A rename counts as touching both its old and new path.
export function changedPaths(files) {
  const paths = new Set()
  for (const file of Array.isArray(files) ? files : []) {
    if (typeof file?.filename === 'string') paths.add(file.filename)
    if (typeof file?.previous_filename === 'string') paths.add(file.previous_filename)
  }
  return [...paths].sort()
}

// docs/ and AgentForge's own files (.agentforge/, including the CI copy of its checks) aren't product code.
const isCodeFile = (path) => CODE_EXTENSIONS.test(path) && !TEST_FILE.test(path) && !path.startsWith('docs/') && !path.startsWith('.agentforge/')

// The paths of a feature's documents: its spec file and any doc:* anchors it owns.
function featureDocPaths(feature) {
  const paths = new Set([specPath(feature)])
  for (const anchor of Array.isArray(feature?.anchors) ? feature.anchors : []) {
    const id = typeof anchor === 'string' ? anchor : anchor?.id
    if (typeof id === 'string' && id.startsWith('doc:')) paths.add(id.slice(4).replace(/^\.?\/+/, ''))
  }
  return [...paths]
}

// Which acceptance criteria the PR breaks, for certain. For each feature the PR touches,
// every criterion citing a changed file is checked again against that file at the PR's
// head: a criterion none of whose cited quotes is still there no longer holds. Files the
// PR doesn't change can't break a criterion, so they aren't read. `getText(path)` returns
// a file's text at the head, or null when it is gone. Returns Map(feature id → broken
// criteria [{ id, text, path, line, quote }]).
export async function recheckCriteria({ files, features, getText }) {
  const paths = changedPaths(files)
  const changed = new Set(paths)
  const cache = new Map()
  const read = (path) => {
    if (!cache.has(path)) cache.set(path, Promise.resolve(getText(path)).catch(() => null))
    return cache.get(path)
  }
  const broken = new Map()
  for (const feature of Array.isArray(features) ? features : []) {
    if (!coveredAnchorPaths(feature.anchors, paths).length) continue
    const criteria = Array.isArray(feature.spec?.document?.acceptanceCriteria) ? feature.spec.document.acceptanceCriteria : []
    const found = []
    criteria.forEach((criterion, index) => {
      const evidence = (Array.isArray(criterion?.evidence) ? criterion.evidence : []).filter(item => item?.path && item.quote)
      if (!evidence.some(item => changed.has(item.path))) return
      found.push({ criterion, index, evidence })
    })
    const list = []
    for (const { criterion, index, evidence } of found) {
      let holds = false
      for (const item of evidence) {
        const status = verifyEvidence(item, await read(item.path)).status
        if (status === 'verified' || status === 'verified_elsewhere') { holds = true; break }
      }
      if (!holds) {
        const cited = evidence.find(item => changed.has(item.path)) || evidence[0]
        list.push({ id: criterion.id || `AC${index + 1}`, text: `Given ${clean(criterion.given)}, when ${clean(criterion.when)}, then ${clean(criterion.then)}`, path: cited.path, line: cited.startLine || null, quote: clean(cited.quote) })
      }
    }
    if (list.length) broken.set(feature.id, list)
  }
  return broken
}

// Maya's check. Each feature whose code anchors the PR touches lands in one of three
// groups: specUpdated (its spec or docs change in the same PR), drift (it has a complete
// spec the PR does not touch, so the spec may no longer match and its Verified evidence
// goes stale until QA re-runs), or noSpec (it has no complete spec yet). New code files
// under no feature's anchors are unmapped.
// With `broken` (from recheckCriteria), a feature whose criteria the PR breaks moves from
// drift to broken, naming each criterion — unless its spec changes in the same PR.
export function specDriftReport({ files, features, broken = new Map() }) {
  const paths = changedPaths(files)
  const list = Array.isArray(features) ? features : []
  const report = { featureMapEmpty: list.length === 0, broken: [], specUpdated: [], drift: [], noSpec: [], unmapped: [], deprecated: [] }
  if (report.featureMapEmpty) return report
  for (const feature of list) {
    const covered = coveredAnchorPaths(feature.anchors, paths)
    if (!covered.length) continue
    // A deprecated feature (out of use, code still there) isn't held to its spec: the
    // useful prompt is that its code could be deleted. A removed feature's anchors still
    // own their paths, so leftover code isn't reported as unmapped.
    if (feature.status === 'deprecated') { report.deprecated.push({ name: clean(feature.name), paths: covered }); continue }
    if (feature.status === 'removed') continue
    const entry = { name: clean(feature.name), paths: covered, specPath: specPath(feature), criteria: Array.isArray(feature.spec?.acceptanceCriteria) ? feature.spec.acceptanceCriteria.length : 0 }
    const docs = featureDocPaths(feature)
    // A hand-written doc changing is not a spec: a feature with no complete spec stays in
    // noSpec even when a doc:* anchor of its moves, unless its own spec file is written.
    const specMoved = paths.includes(specPath(feature)) || (feature.spec?.status === 'complete' && paths.some(path => docs.includes(path)))
    if (specMoved) report.specUpdated.push(entry)
    else if (broken.get(feature.id)?.length) report.broken.push({ ...entry, criteria: broken.get(feature.id) })
    else if (feature.spec?.status === 'complete') report.drift.push(entry)
    else report.noSpec.push(entry)
  }
  const owned = list.flatMap(feature => codeAnchorPaths(feature.anchors))
  report.unmapped = (Array.isArray(files) ? files : [])
    .filter(file => file?.status === 'added' && typeof file.filename === 'string' && isCodeFile(file.filename))
    .map(file => file.filename)
    .filter(path => !owned.some(anchor => under(anchor, path)))
    .sort()
  return report
}

// Changes that usually mean a major architecture impact (the Technical Lead's "major"
// level): each signal names what it saw and the files that show it.
const SIGNALS = [
  { id: 'dependencies', label: 'Dependencies change', test: path => /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Cargo\.toml|Gemfile|pom\.xml|build\.gradle(\.kts)?)$/.test(path) },
  { id: 'data', label: 'A data store or schema changes', test: path => /(^|\/)migrations?\//i.test(path) || /\.sql$/i.test(path) || /(^|\/)schema\.prisma$/.test(path) },
  { id: 'infrastructure', label: 'Build, deploy or infrastructure changes', test: path => path.startsWith('.github/workflows/') || /(^|\/)(Dockerfile|docker-compose[^/]*\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|serverless\.ya?ml)$/.test(path) || /\.tf$/.test(path) },
  { id: 'security', label: 'Authentication or security code changes', test: path => isCodeFile(path) && /(^|\/|[-_.])(auth|oauth|session|middleware|security|crypto|permissions?)([-_./]|$)/i.test(path) },
  { id: 'configuration', label: 'Environment configuration changes', test: path => /(^|\/)\.env(\.[a-z]+)?\.(example|sample|template)$/i.test(path) },
]

// Alex's check. governed: accepted, not-superseded decision records whose cited paths the
// PR touches; invariants: rules whose paths the PR touches; signals: major-looking changes;
// decisionRecords: ADR files the PR adds or edits; removedRecords: ADR files it deletes.
// needsRecord is true when there are signals and the PR adds or edits no decision record.
// staleWorkflows: workflows (docs/architecture/workflows/) whose steps' code the PR changes
// while their doc and .agentforge/workflows.json don't change with it; workflowsUpdated:
// the ones that do.
export const WORKFLOWS_FILE = '.agentforge/workflows.json'
export const workflowDocPath = (workflow) => `docs/architecture/workflows/${workflow.id}.md`
export function architectureReport({ files, record, workflows = [] }) {
  const paths = changedPaths(files)
  const touches = (cited) => (Array.isArray(cited) ? cited : []).filter(path => typeof path === 'string' && path).some(path => paths.some(file => under(path.replace(/:\d+(-\d+)?$/, '').replace(/\/$/, ''), file)))
  const governed = (record?.decisions || [])
    .filter(decision => decision?.status === 'accepted' && !decision.supersededBy && touches(decision.paths))
    .map(decision => ({ number: decision.number, title: clean(decision.title), decision: clean(decision.decision), path: adrPath(decision) }))
  const invariants = (record?.invariants || []).filter(item => item?.rule && touches(item.paths)).map(item => ({ rule: clean(item.rule), paths: item.paths }))
  const signals = SIGNALS.map(signal => ({ id: signal.id, label: signal.label, files: paths.filter(signal.test) })).filter(signal => signal.files.length)
  const adrFiles = (Array.isArray(files) ? files : []).filter(file => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(file?.filename || ''))
  const decisionRecords = adrFiles.filter(file => file.status !== 'removed').map(file => file.filename).sort()
  const removedRecords = adrFiles.filter(file => file.status === 'removed').map(file => file.filename).sort()
  const staleWorkflows = []
  const workflowsUpdated = []
  for (const workflow of Array.isArray(workflows) ? workflows : []) {
    const steps = (workflow?.steps || []).map((step, index) => ({ number: index + 1, changed: (step.paths || []).map(path => path.replace(/:\d+(-\d+)?$/, '').replace(/\/$/, '')).flatMap(path => paths.filter(file => under(path, file))) })).filter(step => step.changed.length)
    if (!steps.length) continue
    const entry = { id: workflow.id, name: clean(workflow.name), steps: steps.map(step => step.number), paths: [...new Set(steps.flatMap(step => step.changed))], docPath: workflowDocPath(workflow) }
    if (paths.includes(entry.docPath) || paths.includes(WORKFLOWS_FILE)) workflowsUpdated.push(entry)
    else staleWorkflows.push(entry)
  }
  return { hasRecord: Boolean(record), governed, invariants, signals, decisionRecords, removedRecords, needsRecord: signals.length > 0 && decisionRecords.length === 0, staleWorkflows, workflowsUpdated }
}

const bullets = (items, render) => {
  const shown = items.slice(0, LIST_LIMIT).map(item => `- ${render(item)}`)
  if (items.length > LIST_LIMIT) shown.push(`- …and ${items.length - LIST_LIMIT} more`)
  return shown
}
const code = (paths) => paths.slice(0, 4).map(path => `\`${path}\``).join(', ') + (paths.length > 4 ? ` and ${paths.length - 4} more` : '')
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// The Spec drift check run's conclusion and output.
export function specDriftCheck(report) {
  if (report.featureMapEmpty) {
    return { name: CHECK_NAMES.spec, conclusion: 'neutral', title: 'No feature map yet', summary: 'This repository has no feature map, so the PR could not be compared with feature specs. Build one on AgentForge’s Product page, or with the Claude Code plugin’s feature-map skill.', text: '' }
  }
  const brokenCount = report.broken.reduce((sum, item) => sum + item.criteria.length, 0)
  const deprecated = report.deprecated || []
  const attention = report.broken.length + report.drift.length + report.noSpec.length + report.unmapped.length + deprecated.length
  const parts = [
    brokenCount && `breaks ${brokenCount} acceptance ${brokenCount === 1 ? 'criterion' : 'criteria'} in ${plural(report.broken.length, 'feature')}`,
    report.drift.length && `${plural(report.drift.length, 'feature')} may drift from ${report.drift.length === 1 ? 'its spec' : 'their specs'}`,
    report.noSpec.length && `${plural(report.noSpec.length, 'feature')} without a complete spec`,
    report.unmapped.length && `${plural(report.unmapped.length, 'new file')} in no feature`,
    deprecated.length && `changes ${plural(deprecated.length, 'deprecated feature')}`,
  ].filter(Boolean)
  const title = attention ? parts.join(', ') : report.specUpdated.length ? 'Specs updated with the code' : 'No mapped feature changes'
  const onlyDeprecated = deprecated.length > 0 && attention === deprecated.length
  const summary = onlyDeprecated
    ? 'Advisory: this PR changes code of a feature that is deprecated (no longer used). Consider deleting that code instead, then mark the feature removed in the feature map.'
    : brokenCount
    ? 'Advisory: this PR changes the code that acceptance criteria rest on, so they no longer hold as written. Fix the code, or update the spec in this PR if the behavior changed on purpose. Verified status for these features goes stale until QA runs again.'
    : attention
    ? 'Advisory: this PR changes code that its feature specs describe, and the specs do not change with it. Check that each spec still matches, or update it in this PR. Verified status for these features goes stale until QA runs again.'
    : report.specUpdated.length ? 'Every feature this PR changes has its spec updated in the same PR.' : 'This PR changes no code that the feature map owns.'
  const text = [
    ...(report.broken.length ? ['### Criteria this PR breaks', ...report.broken.flatMap(item => bullets(item.criteria, criterion => `**${item.name} ${criterion.id}** — ${criterion.text}. Its cited code${criterion.quote ? ` \`${criterion.quote.slice(0, 80)}\`` : ''} is no longer in \`${criterion.path}\`${criterion.line ? ` (was line ${criterion.line})` : ''}.`)), `Spec: ${report.broken.map(item => `\`${item.specPath}\``).join(', ')}`, ''] : []),
    ...(report.drift.length ? ['### Spec may no longer match', ...bullets(report.drift, item => `**${item.name}** — changes ${code(item.paths)}; spec \`${item.specPath}\`${item.criteria ? ` (${item.criteria} acceptance ${item.criteria === 1 ? 'criterion' : 'criteria'})` : ''}`), ''] : []),
    ...(report.noSpec.length ? ['### No complete spec', ...bullets(report.noSpec, item => `**${item.name}** — changes ${code(item.paths)}. Ask Maya to write its spec.`), ''] : []),
    ...(report.unmapped.length ? ['### New code in no feature', ...bullets(report.unmapped, path => `\`${path}\``), 'Run Maya\'s feature map again after merging so this code gets an owner.', ''] : []),
    ...(deprecated.length ? ['### Deprecated features', ...bullets(deprecated, item => `**${item.name}** — changes ${code(item.paths)}. This feature is no longer used: consider deleting its code, then set its status to \`removed\`.`), ''] : []),
    ...(report.specUpdated.length ? ['### Spec updated in this PR', ...bullets(report.specUpdated, item => `**${item.name}**`), ''] : []),
  ].join('\n').trim()
  return { name: CHECK_NAMES.spec, conclusion: attention ? 'neutral' : 'success', title, summary, text }
}

// The Architecture check run's conclusion and output.
export function architectureCheck(report) {
  const stale = report.staleWorkflows || []
  const updated = report.workflowsUpdated || []
  const decisionsAttention = report.needsRecord || report.removedRecords.length > 0 || report.governed.length > 0 || report.invariants.length > 0
  const attention = decisionsAttention || stale.length > 0
  const parts = [
    report.needsRecord && 'looks like a major change with no decision record',
    report.removedRecords.length && `removes ${plural(report.removedRecords.length, 'decision record')}`,
    (report.governed.length || report.invariants.length) && 'touches code governed by recorded decisions',
    stale.length && `${plural(stale.length, 'workflow')} may be out of date`,
  ].filter(Boolean)
  const title = attention ? parts.join('; ').replace(/^./, letter => letter.toUpperCase()) : report.decisionRecords.length ? 'Decision record included' : updated.length ? 'Workflows updated with the code' : 'No architecture concerns'
  const summary = decisionsAttention
    ? `Advisory: check that this PR still follows the decisions below. A major change (a new dependency, data store, external system, infrastructure, or an auth or security change) should add a decision record in docs/adr/.${stale.length ? ' It also changes code that workflow steps describe.' : ''}`
    : stale.length
    ? 'Advisory: this PR changes code that workflow steps describe, and the workflows don’t change with it. Check that the steps still hold, or map the workflows again (the architecture skill) in this PR.'
    : report.hasRecord ? 'This PR touches no code governed by a recorded decision and shows no sign of a major architecture change.' : 'No sign of a major architecture change. This repository has no decision records yet; ask Alex to record the architecture so the check can compare PRs with it.'
  const text = [
    ...(report.needsRecord ? ['### Major change without a decision record', ...bullets(report.signals, signal => `**${signal.label}** — ${code(signal.files)}`), 'If this is a major change, add a decision record in `docs/adr/`. If it is not, nothing needs doing.', ''] : []),
    ...(report.removedRecords.length ? ['### Decision records removed', ...bullets(report.removedRecords, path => `\`${path}\``), 'Decision records are history: mark one superseded instead of deleting it.', ''] : []),
    ...(report.governed.length ? ['### Decisions this PR must still follow', ...bullets(report.governed, item => `**ADR-${String(item.number).padStart(4, '0')} ${item.title}**${item.decision ? ` — ${item.decision}` : ''} (\`${item.path}\`)`), ''] : []),
    ...(report.invariants.length ? ['### Rules this PR must still follow', ...bullets(report.invariants, item => item.rule), ''] : []),
    ...(!report.needsRecord && report.signals.length ? ['### Major-looking changes, with a decision record', ...bullets(report.signals, signal => `**${signal.label}** — ${code(signal.files)}`), ''] : []),
    ...(stale.length ? ['### Workflows that may be out of date', ...bullets(stale, item => `**${item.name}** — ${item.steps.length === 1 ? 'step' : 'steps'} ${item.steps.join(', ')} (${code(item.paths)}); doc \`${item.docPath}\``), ''] : []),
    ...(updated.length ? ['### Workflows updated in this PR', ...bullets(updated, item => `**${item.name}**`), ''] : []),
  ].join('\n').trim()
  return { name: CHECK_NAMES.architecture, conclusion: attention ? 'neutral' : 'success', title, summary, text }
}

// The two check runs for a pull request.
export function pullRequestChecks({ files, features, record, broken, workflows = [] }) {
  return [specDriftCheck(specDriftReport({ files, features, broken })), architectureCheck(architectureReport({ files, record, workflows }))]
}
