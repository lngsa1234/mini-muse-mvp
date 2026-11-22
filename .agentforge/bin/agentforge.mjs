#!/usr/bin/env node
// AgentForge's checks for the Claude Code plugin. Claude writes; this script decides.
//
//   node agentforge.mjs check-specs [--root DIR]
//     Checks every feature spec in .agentforge/feature-map.json against the code: each
//     acceptance criterion needs a given/when/then and a cited quote found at its lines,
//     and a spec needs an objective and at least 3 criteria. Sets each spec's status
//     (complete or in_progress) — the model never does — and writes docs/specs/<slug>.md.
//     Stops first if the map's ids are missing, malformed or duplicated (each spec file is
//     named after its feature's id, so two features with one id would overwrite each other).
//
//   node agentforge.mjs check-baseline [--root DIR]
//     Checks the product baseline (.agentforge/product-baseline.json) against the feature
//     map — journeys must run through real features, PRD requirements must cite them —
//     sets its status and writes docs/product/baseline.md.
//
//   node agentforge.mjs check-qa [--root DIR] [--runner node|jest|vitest] [--ci]
//     Runs the tests each acceptance criterion names (criterion.tests: [{ path, name }])
//     and sets each feature's QA layer from the results — complete when every criterion's
//     tests pass, rejected when one fails — with evidence (the commit and a fingerprint of
//     the feature's code) so a later change reads as "needs re-verify".
//
//   node agentforge.mjs check-architecture [--root DIR]
//     Checks the architecture map (.agentforge/architecture-map.json): cited paths exist,
//     the component view zooms into a real container, and each feature has one component
//     that holds only its own code. Sets its status and writes the C4 container and
//     component pages in docs/architecture/.
//
//   node agentforge.mjs check-workflows [--root DIR]
//     Checks the workflow maps (.agentforge/workflows.json): every step that runs in code
//     must cite files that exist, and each workflow's features must be in the feature map.
//     Sets their status and writes docs/architecture/workflows/.
//
//   node agentforge.mjs pr-check [--base BRANCH] [--root DIR] [--strict]
//     Compares the current branch with BASE (default: the remote default branch, else
//     main) and prints the Spec drift and Architecture checks, the same ones AgentForge
//     posts on pull requests. Advisory: exits 0 unless --strict and there are findings.
//
//   node agentforge.mjs hook session-start|pre-bash
//     Claude Code hooks (hooks/hooks.json): reads the hook's JSON on stdin.
//
// No network, no model, no dependencies beyond Node 18+ and git.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { checkFeatureSpec, featureSpecMarkdown, normalizeFeatureSpec, MIN_CRITERIA } from './lib/featureSpec.js'
import { pullRequestChecks, recheckCriteria, specPath, WORKFLOWS_FILE, workflowDocPath } from './lib/prChecks.js'
import { normalizeWorkflowMap, workflowIndexMarkdown, workflowMarkdown } from './lib/workflowMap.js'
import { architectureProblems, c4ComponentsMarkdown, c4ContainersMarkdown, componentsDocPath, normalizeArchitectureMap } from './lib/architectureMap.js'
import { baselineMarkdown, checkBaseline, normalizeBaseline } from './lib/productBaseline.js'
import { criterionQa, featureQa, parseJestJson, parsePlaywrightJson, parseTap, testOutcome } from './lib/qaChecks.js'
import { anchorFingerprints, codeAnchorPaths } from './lib/featureEvidence.js'
import { tmpdir } from 'node:os'

const MAP_PATH = '.agentforge/feature-map.json'

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = { command, root: process.cwd(), base: '', strict: false }
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--root') options.root = resolve(rest[++index] || '.')
    else if (arg === '--base') options.base = rest[++index] || ''
    else if (arg === '--strict') options.strict = true
    else if (arg === '--runner') options.runner = rest[++index] || ''
    else if (arg === '--ci') options.ci = true
  }
  return options
}

const readText = (root, path) => {
  const full = resolve(root, path)
  if (!full.startsWith(resolve(root))) return null
  try { return readFileSync(full, 'utf8') } catch { return null }
}

export function loadFeatureMap(root) {
  const text = readText(root, MAP_PATH)
  if (text === null) return null
  const map = JSON.parse(text)
  return { ...map, features: Array.isArray(map?.features) ? map.features : [] }
}

// ---- feature map ------------------------------------------------------------------

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
// Past this many live features a flat list is hard to scan; group them with `area`.
export const AREA_THRESHOLD = 15

// The map's own rules, checked before anything hangs off it. `errors` stop the checks:
// every spec, baseline step and PR check finds a feature by its id, so an id must exist,
// be a kebab-case slug, and be used once in the whole map — removed features included,
// because a removed feature's id is never reused. `notes` are advice.
export function checkFeatureMap(features) {
  const errors = []
  const notes = []
  const seen = new Map()
  features.forEach((feature, index) => {
    const label = feature?.name ? `"${feature.name}"` : `feature ${index + 1}`
    const id = typeof feature?.id === 'string' ? feature.id : ''
    if (!id) { errors.push(`${label} has no id. Give it the kebab-case slug of its name.`); return }
    if (!ID_PATTERN.test(id)) errors.push(`${label} has id "${id}", which isn't a kebab-case slug (lowercase letters, digits and single hyphens).`)
    if (seen.has(id)) errors.push(`${label} uses the id "${id}", already used by ${seen.get(id)}. Ids are used once, removed features included.`)
    else seen.set(id, label)
    if (feature.area !== undefined && (typeof feature.area !== 'string' || !feature.area.trim())) errors.push(`${label} has an empty area. Name the area or leave the field out.`)
  })
  const live = features.filter(feature => feature?.status !== 'removed')
  const grouped = live.filter(feature => typeof feature?.area === 'string' && feature.area.trim())
  if (live.length > AREA_THRESHOLD && grouped.length === 0) notes.push(`${live.length} features: consider grouping them with an "area" on each (the feature-map skill says how).`)
  else if (grouped.length && grouped.length < live.length) notes.push(`${live.length - grouped.length} of ${live.length} features have no area: ${live.filter(feature => !grouped.includes(feature)).map(feature => feature.name).join(', ')}.`)
  return { errors, notes }
}

const mapErrorMessage = (errors) => `The feature map needs fixing before anything else can be checked:\n${errors.map(item => `- ${item}`).join('\n')}`

// Items in area order (first appearance), unassigned last. One group keyed null when no
// item has an area, so ungrouped maps print as before.
export function groupByArea(items) {
  if (!items.some(item => item.area)) return [[null, items]]
  const groups = new Map()
  for (const item of items) {
    const key = item.area || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  const unassigned = groups.get('')
  groups.delete('')
  return [...groups.entries(), ...(unassigned ? [['', unassigned]] : [])]
}

// ---- check-specs ------------------------------------------------------------------

export async function checkSpecs(root, { now = new Date().toISOString() } = {}) {
  const map = loadFeatureMap(root)
  if (!map) return { error: `No ${MAP_PATH} yet. Run the feature-map skill first.` }
  const mapCheck = checkFeatureMap(map.features)
  if (mapCheck.errors.length) return { error: mapErrorMessage(mapCheck.errors), mapErrors: mapCheck.errors }
  const results = []
  for (const feature of map.features) {
    const draft = feature.spec?.document
    if (!draft) {
      // A spec file written some other way (by hand, or by the hosted app) is kept and
      // reported, never overwritten; the feature-spec skill brings it in.
      const existing = existsSync(join(root, specPath(feature))) ? specPath(feature) : ''
      feature.spec = existing ? { status: 'not_checked', existingDoc: existing } : { status: 'not_started' }
      results.push({ name: feature.name, status: feature.spec.status, problems: existing ? [`Has a spec at ${existing} that isn't in the feature map, so it can't be checked. The feature-spec skill brings it in.`] : [] })
      continue
    }
    const checked = await checkFeatureSpec(normalizeFeatureSpec(draft), path => readText(root, path))
    feature.spec = {
      status: checked.passed ? 'complete' : 'in_progress',
      acceptanceCriteria: checked.spec.acceptanceCriteria.map(item => `${item.id}: Given ${item.given}, when ${item.when}, then ${item.then}.`),
      // The draft as written, with citations moved to where their quotes really are.
      document: { ...draft, acceptanceCriteria: (draft.acceptanceCriteria || []).map((criterion, index) => {
        const fixed = checked.spec.acceptanceCriteria[index]
        return fixed ? { ...criterion, evidence: (criterion.evidence || []).map((item, at) => (fixed.evidence[at] ? { ...item, startLine: fixed.evidence[at].startLine, endLine: fixed.evidence[at].endLine } : item)) } : criterion
      }) },
      problems: checked.problems,
      counts: checked.counts,
      checkedAt: now,
    }
    const path = specPath(feature)
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), featureSpecMarkdown(feature.name, checked.spec, { featureId: feature.id || '', writtenAt: now }))
    const moved = checked.spec.acceptanceCriteria.flatMap(criterion => criterion.evidence).filter(item => item.check?.citedLine).length
    results.push({ name: feature.name, status: feature.spec.status, problems: checked.problems, counts: checked.counts, path, moved })
  }
  results.forEach((item, index) => { item.area = typeof map.features[index]?.area === 'string' ? map.features[index].area.trim() : '' })
  writeFileSync(join(root, MAP_PATH), `${JSON.stringify(map, null, 2)}\n`)
  return { results, notes: mapCheck.notes }
}

function printSpecResults({ error, results, notes = [] }) {
  if (error) { console.log(error); return 1 }
  const done = results.filter(item => item.status === 'complete').length
  console.log(`# Feature specs: ${done} of ${results.length} complete\n`)
  const printItem = (item) => {
    if (item.moved) console.log(`- ${item.name}: ${item.moved} citation${item.moved === 1 ? '' : 's'} moved to the line where the quote is`)
    const counts = item.counts ? ` — ${item.counts.verified}/${item.counts.criteria} criteria verified` : ''
    console.log(`- **${item.name}**: ${item.status.replace(/_/g, ' ')}${counts}${item.path ? ` (${item.path})` : ''}`)
    for (const problem of item.problems) console.log(`  - ${problem}`)
  }
  for (const [area, items] of groupByArea(results)) {
    if (area !== null) console.log(`\n## ${area || 'No area'}`)
    items.forEach(printItem)
  }
  if (notes.length) console.log(`\n${notes.map(item => `Note: ${item}`).join('\n')}`)
  console.log(`\nA spec is complete when it has an objective and at least ${MIN_CRITERIA} criteria, each citing code whose quote is found at its lines.`)
  return 0
}

// ---- check-baseline ---------------------------------------------------------------

const BASELINE_PATH = '.agentforge/product-baseline.json'
export const BASELINE_DOC = 'docs/product/baseline.md'

// Checks .agentforge/product-baseline.json against the feature map, records the result
// there (status complete or in_progress — set by code, never by the model) and writes
// docs/product/baseline.md.
export function checkProductBaseline(root, { now = new Date().toISOString() } = {}) {
  const text = readText(root, BASELINE_PATH)
  if (text === null) return { error: `No ${BASELINE_PATH} yet. Run the product-baseline skill first.` }
  const stored = JSON.parse(text)
  const features = loadFeatureMap(root)?.features || []
  const mapCheck = checkFeatureMap(features)
  if (mapCheck.errors.length) return { error: mapErrorMessage(mapCheck.errors), mapErrors: mapCheck.errors }
  const baseline = normalizeBaseline(stored.document || stored)
  const checked = checkBaseline(baseline, features)
  const result = { document: stored.document || stored, status: checked.passed ? 'complete' : 'in_progress', problems: checked.problems, coverage: checked.coverage, checkedAt: now }
  writeFileSync(join(root, BASELINE_PATH), `${JSON.stringify(result, null, 2)}\n`)
  mkdirSync(dirname(join(root, BASELINE_DOC)), { recursive: true })
  writeFileSync(join(root, BASELINE_DOC), baselineMarkdown(baseline, features, { checked, writtenAt: now, specPath, specExists: path => existsSync(join(root, path)) }))
  return { ...result, journeys: baseline.journeys.length, path: BASELINE_DOC }
}

function printBaseline(result) {
  if (result.error) { console.log(result.error); return 1 }
  const { coverage } = result
  console.log(`# Product baseline: ${result.status.replace('_', ' ')} (${result.path})\n`)
  console.log(`- ${result.journeys} journeys, covering ${coverage.onJourney} of ${coverage.features} features`)
  if (coverage.prdRequirements) console.log(`- PRD: ${coverage.prdBuilt} of ${coverage.prdRequirements} requirements built${coverage.notInPrd.length ? `; built but not in the PRD: ${coverage.notInPrd.join(', ')}` : ''}`)
  if (coverage.notOnJourney.length) console.log(`- Not on any journey: ${coverage.notOnJourney.join(', ')}`)
  if (result.problems.length) console.log(`\nTo fix:\n${result.problems.map(item => `- ${item}`).join('\n')}`)
  return 0
}

// ---- check-qa ------------------------------------------------------------------------

// Which runner the repository's tests use: --runner, else what package.json's test script
// or dependencies name.
export function detectRunner(root, wanted = '') {
  if (['node', 'jest', 'vitest'].includes(wanted)) return wanted
  let pkg = {}
  try { pkg = JSON.parse(readText(root, 'package.json') || '{}') } catch {}
  const script = String(pkg.scripts?.test || '')
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  if (/\bvitest\b/.test(script) || deps.vitest) return 'vitest'
  if (/\bjest\b/.test(script) || deps.jest) return 'jest'
  if (/node\s+(--[\w-]+\s+)*--test\b/.test(script)) return 'node'
  return ''
}

// Node flags the repo's own test script passes (e.g. --experimental-test-module-mocks),
// so each file runs the way `npm test` runs it. Reporter and file arguments are ours.
export function nodeTestFlags(script = '') {
  const m = String(script).match(/\bnode\s+((?:--[\w-]+(?:=\S+)?\s*)+)/)
  if (!m) return []
  return m[1].trim().split(/\s+/).filter(f => f !== '--test' && !f.startsWith('--test-reporter'))
}

// A browser test file (Playwright) runs with Playwright whatever the repo's main runner is.
export function fileRunner(root, file, runner) {
  const text = readText(root, file) || ''
  return /from\s+['"]@playwright\/test['"]|require\(\s*['"]@playwright\/test['"]\s*\)/.test(text) ? 'playwright' : runner
}

// Run one test file and return its tests' results ([{ name, fullName, status }]).
function runTestFile(root, runner, file) {
  const options = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', FORCE_COLOR: '0' }, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 }
  const run = (command, args) => { try { return execFileSync(command, args, options) } catch (error) { return String(error.stdout || '') } }
  if (runner === 'node') {
    let script = ''
    try { script = JSON.parse(readText(root, 'package.json') || '{}').scripts?.test || '' } catch {}
    return parseTap(run(process.execPath, [...nodeTestFlags(script), '--test', '--test-reporter=tap', file]))
  }
  const out = join(tmpdir(), `agentforge-qa-${process.pid}-${Date.now()}.json`)
  if (runner === 'playwright') {
    try { execFileSync('npx', ['--no-install', 'playwright', 'test', file, '--reporter=json'], { ...options, env: { ...options.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out } }) } catch {}
    let report = null
    try { report = JSON.parse(readFileSync(out, 'utf8')) } catch {}
    try { rmSync(out) } catch {}
    const byFile = parsePlaywrightJson(report, resolve(root))
    return byFile[file] || Object.values(byFile)[0] || []
  }
  if (runner === 'jest') run('npx', ['--no-install', 'jest', '--json', `--outputFile=${out}`, '--runTestsByPath', file])
  else run('npx', ['--no-install', 'vitest', 'run', '--reporter=json', `--outputFile=${out}`, file])
  let report = null
  try { report = JSON.parse(readFileSync(out, 'utf8')) } catch {}
  try { rmSync(out) } catch {}
  const byFile = parseJestJson(report, resolve(root))
  return byFile[file] || Object.values(byFile)[0] || []
}

// Fingerprints of a feature's code at HEAD, when that code has no uncommitted changes
// (tests ran on the working tree; evidence only describes a commit when they match).
function headEvidence(root, feature) {
  const paths = codeAnchorPaths(feature.anchors)
  let commitSha = '', branch = '', fingerprints = null
  try { commitSha = git(root, ['rev-parse', 'HEAD']); branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) } catch { return null }
  try {
    const dirty = paths.length && git(root, ['status', '--porcelain', '--', ...paths])
    if (paths.length && !dirty) {
      const entries = git(root, ['ls-tree', '-r', 'HEAD']).split('\n').filter(Boolean).map(line => { const [meta, path] = line.split('\t'); const [, type, sha] = meta.split(' '); return { path, type, sha } })
      fingerprints = anchorFingerprints(entries, paths)
    }
  } catch {}
  return { commitSha, branch, ...(fingerprints ? { fingerprints } : { uncommitted: true }) }
}

// write: false (CI) leaves the feature map and spec pages alone and only reports.
// retries: a file with a failed test runs again that many times; a test that fails and
// then passes counts as passing and is reported as flaky.
export function checkQa(root, { runner: wanted = '', now = new Date().toISOString(), runFile = runTestFile, write = true, retries = 0 } = {}) {
  const map = loadFeatureMap(root)
  if (!map) return { error: `No ${MAP_PATH} yet. Run the feature-map skill first.`, nothingToCheck: true }
  const linked = map.features.flatMap(feature => (feature.spec?.document?.acceptanceCriteria || []).flatMap(criterion => Array.isArray(criterion.tests) ? criterion.tests : []))
  if (!linked.length) return { error: 'No acceptance criterion names a test yet. Run the qa skill to link tests to criteria.', nothingToCheck: true }
  const runner = detectRunner(root, wanted)
  if (!runner) return { error: 'Could not tell which test runner this repository uses. Pass --runner node, jest or vitest.' }
  // Run each linked file once.
  const files = [...new Set(linked.map(test => String(test.path || '').replace(/^\.?\//, '')).filter(Boolean))]
  const results = {}
  const missingFiles = []
  const flaky = []
  for (const file of files) {
    if (!existsSync(join(root, file))) { missingFiles.push(file); results[file] = []; continue }
    results[file] = runFile(root, fileRunner(root, file, runner), file)
    for (let attempt = 0; attempt < retries && results[file].some(test => test.status === 'failed'); attempt += 1) {
      const again = runFile(root, fileRunner(root, file, runner), file)
      results[file] = results[file].map(test => {
        if (test.status !== 'failed') return test
        const rerun = again.find(other => other.fullName === test.fullName && other.name === test.name)
        if (rerun?.status !== 'passed') return test
        flaky.push(`${file}: ${test.fullName || test.name}`)
        return { ...test, status: 'passed' }
      })
    }
  }
  const report = []
  for (const feature of map.features) {
    const document = feature.spec?.document
    if (!document) continue
    const criteria = normalizeFeatureSpec(document).acceptanceCriteria
    if (!criteria.some(criterion => criterion.tests.length)) {
      if (feature.qa?.source === 'plugin') delete feature.qa
      continue
    }
    criteria.forEach((criterion, index) => {
      criterion.qa = criterionQa(criterion.tests.map(test => testOutcome(results[test.path], test.name)))
      if (document.acceptanceCriteria[index]) document.acceptanceCriteria[index].qa = criterion.qa
    })
    const qa = featureQa(criteria)
    const featureFiles = [...new Set(criteria.flatMap(criterion => criterion.tests.map(test => test.path)))]
    const runners = [...new Set(featureFiles.map(file => existsSync(join(root, file)) ? fileRunner(root, file, runner) : runner))]
    feature.qa = { status: qa.status, source: 'plugin', runner: runners.join('+'), checkedAt: now, counts: qa.counts, gaps: qa.gaps, evidence: { ...headEvidence(root, feature), files: [...new Set(criteria.flatMap(criterion => criterion.tests.map(test => test.path)))] } }
    // The spec page shows each criterion's result.
    if (write && (feature.spec?.status === 'complete' || feature.spec?.status === 'in_progress')) {
      const path = specPath(feature)
      writeFileSync(join(root, path), featureSpecMarkdown(feature.name, { ...normalizeFeatureSpec(document), acceptanceCriteria: criteria.map(criterion => ({ ...criterion, verified: feature.spec.status === 'complete' })) }, { featureId: feature.id || '', writtenAt: feature.spec.checkedAt || now }))
    }
    report.push({ name: feature.name, ...qa, failing: criteria.filter(criterion => criterion.qa === 'fail').map(criterion => criterion.id), uncommitted: Boolean(feature.qa.evidence.uncommitted) })
  }
  if (write) writeFileSync(join(root, MAP_PATH), `${JSON.stringify(map, null, 2)}\n`)
  const runners = [...new Set([runner, ...files.filter(file => existsSync(join(root, file))).map(file => fileRunner(root, file, runner))])]
  return { runner: runners.join('+'), files, missingFiles, flaky, report }
}

// The QA report as markdown lines. In CI (ci: true) the check fails when a criterion's
// test fails or a linked test can't be found; criteria with no test yet are listed only.
export function qaReport(result, { ci = false } = {}) {
  // In CI, a repo with nothing to check yet passes with a note rather than failing every PR.
  if (result.error) return { lines: [ci && result.nothingToCheck ? `QA skipped: ${result.error}` : result.error], exitCode: ci && result.nothingToCheck ? 0 : 1 }
  const done = result.report.filter(item => item.status === 'complete').length
  const lines = [`# QA: ${done} of ${result.report.length} features fully tested (${result.runner}, ${result.files.length} test files)`, '']
  const WORD = { complete: 'every criterion passes', in_progress: 'partly tested', rejected: 'a test fails', not_started: 'no passing test' }
  for (const item of result.report) {
    lines.push(`- **${item.name}**: ${WORD[item.status]} — ${item.counts.passing}/${item.counts.criteria} criteria pass${item.counts.failing ? `, ${item.counts.failing} fail (${item.failing.join(', ')})` : ''}`)
    const gaps = item.gaps.filter(gap => gap.qa !== 'fail')
    if (gaps.length) lines.push(`  - Not covered: ${gaps.map(gap => `${gap.id}${gap.qa === 'missing' ? ' (linked test not found)' : ''}`).join(', ')}`)
    if (item.uncommitted && !ci) lines.push('  - Its code has uncommitted changes, so this result isn’t tied to a commit. Commit, then run check-qa again.')
  }
  if (result.missingFiles.length) lines.push('', `Test files not found: ${result.missingFiles.join(', ')}`)
  if (result.flaky?.length) lines.push('', `Flaky (failed, then passed on retry): ${result.flaky.join('; ')}`)
  const failing = result.report.some(item => item.counts.failing || item.gaps.some(gap => gap.qa === 'missing')) || result.missingFiles.length > 0
  if (ci) lines.push('', failing ? '**QA failed:** a criterion’s test fails or can’t be found.' : '**QA passed:** every linked test passes.')
  return { lines, exitCode: ci && failing ? 1 : 0 }
}

// The copy of these scripts that a repository's CI runs (.agentforge/bin/): CI can't
// fetch the plugin itself, since its repository is private. No dependencies, so the
// copy is just the files. Replaced whole on every install, so it never mixes versions.
export const CI_BIN = '.agentforge/bin'
export function installCi(root) {
  const source = dirname(resolve(new URL(import.meta.url).pathname))
  const target = join(root, CI_BIN)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  const files = ['agentforge.mjs', 'ci-install.sh', ...readdirSync(join(source, 'lib')).filter(name => name.endsWith('.js') && !name.includes('.test.')).map(name => `lib/${name}`)]
  for (const file of files) copyFileSync(join(source, file), join(target, file))
  let version = ''
  try { version = JSON.parse(readFileSync(join(source, '../.claude-plugin/plugin.json'), 'utf8')).version || '' } catch {}
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({ private: true, type: 'module', description: `AgentForge's checks for CI, copied from the plugin${version ? ` (${version})` : ''}. Run the setup-github skill again to update them; don't edit by hand.` }, null, 2)}\n`)
  return { path: CI_BIN, version, files: files.length }
}

function printQa(result, { ci = false } = {}) {
  const { lines, exitCode } = qaReport(result, { ci })
  console.log(lines.join('\n'))
  // On GitHub Actions the report also goes on the run's summary page.
  if (ci && process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' }) } catch {} }
  return exitCode
}

// ---- check-architecture ------------------------------------------------------------

export const ARCHITECTURE_FILE = '.agentforge/architecture-map.json'

export function checkArchitecture(root, { now = new Date().toISOString() } = {}) {
  const text = readText(root, ARCHITECTURE_FILE)
  if (text === null) return { error: `No ${ARCHITECTURE_FILE} yet. Run the architecture skill first.` }
  const stored = JSON.parse(text)
  const document = stored.document || stored
  const features = (loadFeatureMap(root)?.features || []).filter(feature => feature?.status !== 'removed' && feature?.id)
  const map = normalizeArchitectureMap(document, trackedFiles(root), { knownFeatures: features.length ? features.map(feature => feature.name) : null })
  const problems = architectureProblems(map, { features })
  if (map.components.length < 2) problems.push('Map at least two containers: the deployable parts and the data stores, plus the outside services they call.')
  const result = { document, status: problems.length ? 'in_progress' : 'complete', problems, checkedAt: now }
  writeFileSync(join(root, ARCHITECTURE_FILE), `${JSON.stringify(result, null, 2)}\n`)
  mkdirSync(join(root, 'docs/architecture'), { recursive: true })
  const written = ['docs/architecture/c4-containers.md']
  writeFileSync(join(root, written[0]), `${c4ContainersMarkdown(map, { builtAt: now })}\n`)
  if (map.componentView?.components?.length) {
    written.push(componentsDocPath(map))
    writeFileSync(join(root, written[1]), `${c4ComponentsMarkdown(map, { builtAt: now })}\n`)
  }
  // A component page for a container the view no longer zooms into goes, if AgentForge wrote it.
  const removed = []
  for (const file of readdirSync(join(root, 'docs/architecture'))) {
    const path = `docs/architecture/${file}`
    if (!/^c4-components-.+\.md$/.test(file) || written.includes(path)) continue
    if (/^---\n[\s\S]*?type: Architecture[\s\S]*?owner: Alex/.test(readText(root, path) || '')) { rmSync(join(root, path)); removed.push(path) }
  }
  const inside = map.components.find(component => component.id === map.componentView?.container)
  return { ...result, containers: map.components.length, inside: inside?.name || '', components: map.componentView?.components?.length || 0, written, removed }
}

function printArchitecture(result) {
  if (result.error) { console.log(result.error); return 1 }
  console.log(`# Architecture map: ${result.status.replace('_', ' ')}\n`)
  console.log(`- ${result.containers} containers${result.inside ? `; ${result.components} components inside ${result.inside}` : ''}`)
  console.log(`- Wrote ${result.written.join(', ')}${result.removed.length ? `; removed ${result.removed.join(', ')}` : ''}`)
  if (result.problems.length) console.log(`\nTo fix:\n${result.problems.map(item => `- ${item}`).join('\n')}`)
  return 0
}

// ---- check-workflows ---------------------------------------------------------------

export const WORKFLOW_DIR = 'docs/architecture/workflows'

const trackedFiles = (root) => {
  try { return git(root, ['ls-files']).split('\n').filter(Boolean) } catch { return null }
}
const liveFeatures = (root) => (loadFeatureMap(root)?.features || []).filter(feature => feature?.status !== 'removed' && feature?.id).map(feature => ({ id: feature.id, name: feature.name || feature.id }))

// The workflows as checked last time, for the PR check (paths not re-checked here).
export function loadWorkflows(root) {
  const text = readText(root, WORKFLOWS_FILE)
  if (text === null) return []
  try {
    const stored = JSON.parse(text)
    return normalizeWorkflowMap(stored.document || stored, { knownFeatures: liveFeatures(root) }).workflows
  } catch { return [] }
}

// Checks .agentforge/workflows.json against the repository, records the result there
// (status complete or in_progress — set by code, never by the model) and writes
// docs/architecture/workflows/: an index and one file per workflow.
export function checkWorkflows(root, { now = new Date().toISOString() } = {}) {
  const text = readText(root, WORKFLOWS_FILE)
  if (text === null) return { error: `No ${WORKFLOWS_FILE} yet. Run the architecture skill first.` }
  const stored = JSON.parse(text)
  const document = stored.document || stored
  const features = liveFeatures(root)
  const map = normalizeWorkflowMap(document, { treePaths: trackedFiles(root), knownFeatures: features })
  const problems = []
  const notes = []
  const raw = Array.isArray(document?.workflows) ? document.workflows : []
  const kept = new Set(map.workflows.map(workflow => workflow.name))
  for (const item of raw) {
    const name = String(item?.name || '').trim()
    if (!name) problems.push('A workflow has no name.')
    else if (!kept.has(name) && map.workflows.length < 8) problems.push(`"${name}" was dropped: a workflow needs at least two steps.`)
  }
  if (raw.length > 8) notes.push(`Only the first 8 of ${raw.length} workflows are kept; map the ones that matter most.`)
  const known = new Set(features.map(feature => feature.id))
  for (const workflow of map.workflows) {
    const source = raw.find(item => String(item?.name || '').trim() === workflow.name)
    workflow.steps.forEach((step, index) => {
      if (step.unconfirmedPaths.length) problems.push(`"${workflow.name}" step ${index + 1} cites code that isn’t in the repository: ${step.unconfirmedPaths.join(', ')}.`)
      else if (!step.confirmed) problems.push(`"${workflow.name}" step ${index + 1} is done by the ${step.actor} but cites no code.`)
    })
    const unknown = (Array.isArray(source?.features) ? source.features : []).filter(id => !known.has(id))
    if (unknown.length) problems.push(`"${workflow.name}" names features not in the feature map: ${unknown.join(', ')}.`)
    if (!workflow.features.length && features.length) notes.push(`"${workflow.name}" names no feature it serves.`)
  }
  if (map.workflows.length < 2) problems.push('Map at least two workflows: the flows a new engineer most needs to understand.')
  const served = new Set(map.workflows.flatMap(workflow => workflow.features))
  const unserved = features.filter(feature => !served.has(feature.id)).map(feature => feature.name)
  const result = { document, status: problems.length ? 'in_progress' : 'complete', problems, notes, coverage: { workflows: map.workflows.length, features: features.length, served: features.length - unserved.length, unserved }, checkedAt: now }
  writeFileSync(join(root, WORKFLOWS_FILE), `${JSON.stringify(result, null, 2)}\n`)
  // Write the docs; remove workflow files this map no longer has, but only ones AgentForge wrote.
  mkdirSync(join(root, WORKFLOW_DIR), { recursive: true })
  const featureNames = Object.fromEntries(features.map(feature => [feature.id, feature.name]))
  const written = new Set(['README.md'])
  writeFileSync(join(root, WORKFLOW_DIR, 'README.md'), `${workflowIndexMarkdown(map, { builtAt: now })}\n`)
  for (const workflow of map.workflows) {
    writeFileSync(join(root, workflowDocPath(workflow)), `${workflowMarkdown(workflow, { featureNames, builtAt: now })}\n`)
    written.add(`${workflow.id}.md`)
  }
  const removed = []
  for (const file of readdirSync(join(root, WORKFLOW_DIR))) {
    if (written.has(file) || !file.endsWith('.md')) continue
    const old = readText(root, `${WORKFLOW_DIR}/${file}`) || ''
    if (/^---\n[\s\S]*?type: Workflow[\s\S]*?owner: Alex/.test(old)) { rmSync(join(root, WORKFLOW_DIR, file)); removed.push(file) }
  }
  return { ...result, workflows: map.workflows.map(workflow => ({ id: workflow.id, name: workflow.name, steps: workflow.steps.length, features: workflow.features })), removed, path: WORKFLOW_DIR }
}

function printWorkflows(result) {
  if (result.error) { console.log(result.error); return 1 }
  console.log(`# Workflows: ${result.status.replace('_', ' ')} (${result.path})\n`)
  for (const workflow of result.workflows) console.log(`- **${workflow.name}** — ${workflow.steps} steps${workflow.features.length ? `; serves ${workflow.features.join(', ')}` : ''}`)
  if (result.removed.length) console.log(`- Removed: ${result.removed.join(', ')}`)
  if (result.coverage.features) console.log(`\n${result.coverage.served} of ${result.coverage.features} features are served by a workflow${result.coverage.unserved.length ? `; not on any: ${result.coverage.unserved.join(', ')}` : ''}.`)
  if (result.problems.length) console.log(`\nTo fix:\n${result.problems.map(item => `- ${item}`).join('\n')}`)
  if (result.notes.length) console.log(`\n${result.notes.map(item => `Note: ${item}`).join('\n')}`)
  return 0
}

// ---- pr-check ---------------------------------------------------------------------

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

function defaultBase(root) {
  try { return git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']) } catch {}
  for (const candidate of ['origin/main', 'main', 'origin/master', 'master']) {
    try { git(root, ['rev-parse', '--verify', '--quiet', candidate]); return candidate } catch {}
  }
  return 'main'
}

const STATUS = { A: 'added', M: 'modified', D: 'removed', R: 'renamed', C: 'added', T: 'modified' }

// `git diff --name-status` lines as GitHub's PR file list: { filename, status, previous_filename }.
export function parseNameStatus(output) {
  return String(output || '').split('\n').filter(Boolean).map(line => {
    const [code, first, second] = line.split('\t')
    const status = STATUS[code[0]] || 'modified'
    return code[0] === 'R' ? { filename: second, status, previous_filename: first } : { filename: second || first, status }
  })
}

// Decision records from docs/adr/NNNN-*.md. Status and cited paths come from frontmatter
// (status:, paths:) or a "**Status**:" line in the body.
export function parseDecisionRecord(filename, text) {
  const match = filename.match(/^(\d{4})-(.+)\.md$/)
  if (!match) return null
  const front = String(text).match(/^---\n([\s\S]*?)\n---/)
  const fields = {}
  if (front) {
    let listKey = ''
    for (const line of front[1].split('\n')) {
      const item = line.match(/^\s+-\s+(.+)$/)
      if (item && listKey) { fields[listKey].push(item[1].trim().replace(/^["']|["']$/g, '')); continue }
      const pair = line.match(/^([A-Za-z]+):\s*(.*)$/)
      if (!pair) continue
      listKey = ''
      const [, key, value] = pair
      if (value === '') { fields[key] = []; listKey = key } else if (/^\[.*\]$/.test(value)) fields[key] = value.slice(1, -1).split(',').map(part => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      else fields[key] = value.replace(/^["']|["']$/g, '')
    }
  }
  const bodyStatus = String(text).match(/\*\*Status:?\*\*:?\s*([^\n·]+)/i)?.[1]
  const status = String(fields.status || bodyStatus || '').trim().toLowerCase()
  const heading = String(text).match(/^#\s+(?:ADR-\d+:\s*)?(.+)$/m)?.[1]
  const decision = String(text).match(/## Decision\s*\n+([^\n]+)/)?.[1]
  return {
    number: Number(match[1]),
    title: String(fields.title || heading || match[2]).replace(/^ADR-\d+:\s*/, '').trim(),
    decision: decision ? decision.replace(/^[-*]\s+/, '').trim() : '',
    status: status.startsWith('accepted') ? 'accepted' : status.startsWith('superseded') ? 'superseded' : status || 'unknown',
    paths: Array.isArray(fields.paths) ? fields.paths : [],
  }
}

export function loadDecisionRecords(root) {
  const dir = join(root, 'docs/adr')
  if (!existsSync(dir)) return null
  const decisions = readdirSync(dir).map(name => parseDecisionRecord(name, readText(root, `docs/adr/${name}`) || '')).filter(Boolean)
  return decisions.length ? { decisions, invariants: [] } : null
}

// Files as committed at HEAD — what the pull request will contain, not the working tree.
const headText = (root) => (path) => { try { return execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20 * 1024 * 1024 }) } catch { return null } }

export async function prCheck(root, base) {
  const against = base || defaultBase(root)
  const files = parseNameStatus(git(root, ['diff', '--name-status', '-M', `${against}...HEAD`]))
  const features = loadFeatureMap(root)?.features || []
  const broken = await recheckCriteria({ files, features, getText: headText(root) })
  return { base: against, files, checks: pullRequestChecks({ files, features, record: loadDecisionRecords(root), broken, workflows: loadWorkflows(root) }) }
}

function printChecks({ base, files, checks }) {
  console.log(`Compared with ${base}: ${files.length} changed file${files.length === 1 ? '' : 's'}.\n`)
  for (const check of checks) {
    const mark = check.conclusion === 'success' ? '✓' : '!'
    console.log(`## ${mark} ${check.name}: ${check.title}\n\n${check.summary}\n${check.text ? `\n${check.text}\n` : ''}`)
  }
}

// ---- hooks --------------------------------------------------------------------------
// Claude Code hooks (hooks/hooks.json) call these so users get Maya and Alex without
// naming a skill. Each reads the hook's JSON on stdin and never fails the session: any
// error means "say nothing".

const PUSH_OR_PR = /(^|[;&|(]\s*|\s)(git\s+(-C\s+\S+\s+)?push|gh\s+pr\s+create)(\s|$)/

export function readConfig(root) {
  try { return JSON.parse(readText(root, '.agentforge/config.json') || '{}') } catch { return {} }
}
const hookEnabled = (root, name) => process.env.AGENTFORGE_HOOKS !== 'off' && readConfig(root)?.hooks?.[name] !== false

function repoRoot(cwd) {
  try { return git(cwd, ['rev-parse', '--show-toplevel']) } catch { return '' }
}

// Session start: one factual line for Claude about what AgentForge can do here.
export function sessionStartContext(root) {
  if (!root || !hookEnabled(root, 'sessionStart')) return ''
  const map = (() => { try { return loadFeatureMap(root) } catch { return null } })()
  const lines = []
  const existingSpecs = (() => { try { return readdirSync(join(root, 'docs/specs')).filter(name => name.endsWith('.md')).length } catch { return 0 } })()
  if (!map) {
    if (existingSpecs) lines.push(`AgentForge: docs/specs already holds ${existingSpecs} spec${existingSpecs === 1 ? '' : 's'}; the feature map should reuse their ids so they are kept.`)
    lines.push('AgentForge: this repository has no feature map (.agentforge/feature-map.json) yet. The agentforge:feature-map skill builds one from the code, and agentforge:feature-spec then writes specs whose acceptance criteria cite the code. When the user is working on product features, offer this once.')
  } else {
    const open = map.features.filter(feature => feature.status !== 'removed' && feature.spec?.status !== 'complete').length
    lines.push(`AgentForge: the feature map lists ${map.features.length} features${open ? `; ${open} ${open === 1 ? "has" : "have"} no complete spec (the agentforge:feature-spec skill writes them)` : ', all with complete specs'}.`)
    if (!existsSync(join(root, BASELINE_PATH))) lines.push('There is no product baseline yet; the agentforge:product-baseline skill writes the users, the journeys across features, and how a PRD lines up with the code.')
  }
  if (!existsSync(join(root, '.github/workflows/agentforge.yml'))) lines.push('The AgentForge GitHub workflow is not set up here; the agentforge:setup-github skill adds checks on every pull request and keeps the docs current after each merge. Mention it once if the user asks about automation or GitHub.')
  return lines.join(' ')
}

// Before `git push` or `gh pr create`: run the PR check. With findings, stop the command
// once per commit and hand the findings to Claude; running it again goes through. A repo
// with no feature map and nothing major in the diff is never stopped.
export async function prePushDecision(root, command, { base = '' } = {}) {
  if (!root || !PUSH_OR_PR.test(String(command || '')) || !hookEnabled(root, 'prePush')) return null
  const head = git(root, ['rev-parse', 'HEAD'])
  const marker = join(resolve(root, git(root, ['rev-parse', '--git-dir'])), 'agentforge', `checked-${head}`)
  if (existsSync(marker)) return null
  const result = await prCheck(root, base)
  const findings = result.checks.filter(check => check.conclusion !== 'success' && check.title !== 'No feature map yet')
  if (!findings.length) return null
  mkdirSync(dirname(marker), { recursive: true })
  writeFileSync(marker, `${new Date().toISOString()}\n`)
  const report = findings.map(check => `### ${check.name}: ${check.title}\n${check.summary}\n${check.text}`).join('\n\n')
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `AgentForge's pre-PR check (advisory) found items to review before this goes to a pull request. Compared with ${result.base}.\n\n${report}\n\nShow these findings to the user and offer to fix them; the agentforge:pr-check skill says how to handle each one. If the user wants to go ahead as it is, run the same command again: AgentForge does not stop the same commit twice.`,
    },
  }
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  try { return JSON.parse(text || '{}') } catch { return {} }
}

async function runHook(name) {
  try {
    const input = await readStdin()
    // Most Bash calls are not a push: answer those before touching git.
    if (name === 'pre-bash' && !PUSH_OR_PR.test(String(input.tool_input?.command || ''))) process.exit(0)
    const root = repoRoot(input.cwd || process.cwd())
    if (name === 'session-start') {
      const context = sessionStartContext(root)
      if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }))
    } else if (name === 'pre-bash') {
      const decision = await prePushDecision(root, input.tool_input?.command)
      if (decision) process.stdout.write(JSON.stringify(decision))
    }
  } catch {
    // A hook must never break the session.
  }
  process.exit(0)
}

// ---- main -------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.command === 'check-specs') process.exit(printSpecResults(await checkSpecs(options.root)))
  if (options.command === 'check-baseline') process.exit(printBaseline(checkProductBaseline(options.root)))
  if (options.command === 'check-workflows') process.exit(printWorkflows(checkWorkflows(options.root)))
  if (options.command === 'check-architecture') process.exit(printArchitecture(checkArchitecture(options.root)))
  if (options.command === 'check-qa') process.exit(printQa(checkQa(options.root, { runner: options.runner || '', ...(options.ci ? { write: false, retries: 1 } : {}) }), { ci: options.ci }))
  if (options.command === 'pr-check') {
    const result = await prCheck(options.root, options.base)
    printChecks(result)
    process.exit(options.strict && result.checks.some(check => check.conclusion !== 'success') ? 1 : 0)
  }
  if (options.command === 'install-ci') { const done = installCi(options.root); console.log(`Copied AgentForge's checks${done.version ? ` (${done.version})` : ''} to ${done.path}/ (${done.files} files). Commit them with the workflow.`); process.exit(0) }
  if (options.command === 'hook') return runHook(process.argv[3])
  console.log('Usage: agentforge.mjs check-specs [--root DIR] | check-baseline [--root DIR] | check-workflows [--root DIR] | check-architecture [--root DIR] | check-qa [--root DIR] [--runner node|jest|vitest] [--ci] | pr-check [--base BRANCH] [--root DIR] [--strict] | install-ci [--root DIR] | hook session-start|pre-bash')
  process.exit(2)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main()
