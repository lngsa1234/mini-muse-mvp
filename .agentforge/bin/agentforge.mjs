#!/usr/bin/env node
// LynnCraft's checks for the Claude Code plugin. Claude writes; this script decides.
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
//   node agentforge.mjs verify [--base BRANCH] [--root DIR] [--runner …] [--ci]
//     The verdict GitHub runs on every pull request: compares the branch with BASE
//     (default: the remote default branch, else main) and runs every linked test, for
//     criteria and journeys. Exits 1 when something must be fixed before merging: a
//     criterion the branch breaks without updating its spec, or a failing or missing test.
//     Without --ci it also records the QA results in the feature map and baseline.
//
//   node agentforge.mjs pr-check [--base BRANCH] [--root DIR] [--strict]
//     The spec drift and architecture part of verify alone. Advisory: exits 0 unless
//     --strict and there are findings.
//
//   node agentforge.mjs hook session-start
//     The Claude Code session-start hook (hooks/hooks.json): reads its JSON on stdin.
//
// No network, no model, no dependencies beyond Node 18+ and git.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { checkFeatureSpec, featureSpecMarkdown, normalizeFeatureSpec, MIN_CRITERIA } from './lib/featureSpec.js'
import { architectureCheck, architectureReport, pullRequestChecks, recheckCriteria, specDriftCheck, specDriftReport, specPath, WORKFLOWS_FILE, workflowDocPath } from './lib/prChecks.js'
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
// A feature's lifecycle: built → partial → deprecated (out of use, code still there)
// → removed (code gone). Deprecated and removed features are retired: their ids stay
// claimed and their specs stay as history, but they aren't counted or shown as live.
export const FEATURE_STATUSES = ['built', 'partial', 'deprecated', 'removed']
export const isRetired = (feature) => feature?.status === 'deprecated' || feature?.status === 'removed'
// Past this many live features a flat list is hard to scan; group them with `area`.
export const AREA_THRESHOLD = 15

// The map's own rules, checked before anything hangs off it. `errors` stop the checks:
// every spec, baseline step and PR check finds a feature by its id, so an id must exist,
// be a kebab-case slug, and be used once in the whole map — removed features included,
// because a removed feature's id is never reused. `notes` are advice.
export function checkFeatureMap(features, { root = '' } = {}) {
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
    if (feature.status !== undefined && !FEATURE_STATUSES.includes(feature.status)) errors.push(`${label} has status "${feature.status}". Use ${FEATURE_STATUSES.join(', ')}.`)
  })
  const live = features.filter(feature => !isRetired(feature))
  // Anchors: drift, ownership and Verified fingerprints all match files by these paths,
  // so one that points nowhere, or that two features both claim, quietly breaks them.
  const owners = new Map()
  for (const feature of live) {
    for (const anchor of Array.isArray(feature?.anchors) ? feature.anchors : []) {
      const id = typeof anchor === 'string' ? anchor : anchor?.id
      const split = typeof id === 'string' ? id.indexOf(':') : -1
      if (split < 1) continue
      const path = id.slice(split + 1).replace(/^\.?\/+|\/+$/g, '')
      if (root && path && !existsSync(join(root, path))) notes.push(`"${feature.name}" has anchor ${id}, but ${path} doesn't exist. Fix or remove it: changes there can't be matched to the feature.`)
      if (id.slice(0, split) === 'doc') continue
      for (const [other, name] of owners) {
        if (name !== feature.name && (other === path || path.startsWith(`${other}/`) || other.startsWith(`${path}/`))) notes.push(`${path} is anchored by both "${name}" and "${feature.name}". A path belongs to one feature.`)
      }
      owners.set(path, feature.name)
    }
  }
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
  const mapCheck = checkFeatureMap(map.features, { root })
  if (mapCheck.errors.length) return { error: mapErrorMessage(mapCheck.errors), mapErrors: mapCheck.errors }
  const results = []
  for (const feature of map.features) {
    if (isRetired(feature)) {
      // Not re-checked, but its page is rewritten so it says the feature is retired.
      const document = feature.spec?.document
      if (document && existsSync(join(root, specPath(feature)))) {
        const spec = normalizeFeatureSpec(document)
        writeFileSync(join(root, specPath(feature)), featureSpecMarkdown(feature.name, { ...spec, acceptanceCriteria: spec.acceptanceCriteria.map(criterion => ({ ...criterion, verified: feature.spec.status === 'complete' })) }, { featureId: feature.id || '', writtenAt: feature.spec.checkedAt || '', featureStatus: feature.status, specStatus: feature.spec.status, qa: feature.qa }))
      }
      results.push({ name: feature.name, status: feature.status, retired: true, problems: [] })
      continue
    }
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
    writeFileSync(join(root, path), featureSpecMarkdown(feature.name, checked.spec, { featureId: feature.id || '', writtenAt: now, featureStatus: feature.status || 'built', specStatus: feature.spec.status, qa: feature.qa }))
    const moved = checked.spec.acceptanceCriteria.flatMap(criterion => criterion.evidence).filter(item => item.check?.citedLine).length
    results.push({ name: feature.name, status: feature.spec.status, problems: checked.problems, counts: checked.counts, path, moved })
  }
  results.forEach((item, index) => { item.area = typeof map.features[index]?.area === 'string' ? map.features[index].area.trim() : '' })
  writeFileSync(join(root, MAP_PATH), `${JSON.stringify(map, null, 2)}\n`)
  return { results, notes: mapCheck.notes }
}

function printSpecResults({ error, results, notes = [] }) {
  if (error) { console.log(error); return 1 }
  const live = results.filter(item => !item.retired)
  const retired = results.filter(item => item.retired)
  const done = live.filter(item => item.status === 'complete').length
  console.log(`# Feature specs: ${done} of ${live.length} complete\n`)
  const printItem = (item) => {
    if (item.moved) console.log(`- ${item.name}: ${item.moved} citation${item.moved === 1 ? '' : 's'} moved to the line where the quote is`)
    const counts = item.counts ? ` — ${item.counts.verified}/${item.counts.criteria} criteria verified` : ''
    console.log(`- **${item.name}**: ${item.status.replace(/_/g, ' ')}${counts}${item.path ? ` (${item.path})` : ''}`)
    for (const problem of item.problems) console.log(`  - ${problem}`)
  }
  for (const [area, items] of groupByArea(live)) {
    if (area !== null) console.log(`\n## ${area || 'No area'}`)
    items.forEach(printItem)
  }
  if (retired.length) console.log(`\nNot checked (retired): ${retired.map(item => `${item.name} (${item.status})`).join(', ')}.`)
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
  console.log(`- End-to-end test cases: ${coverage.testCases}, ${coverage.automated} automated${coverage.failuresUncovered.length ? `; failures with no test case in ${coverage.failuresUncovered.join(', ')}` : ''}`)
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
function runTestFile(root, runner, file, browser = null) {
  const options = { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', FORCE_COLOR: '0' }, timeout: 300_000, maxBuffer: 64 * 1024 * 1024 }
  const run = (command, args) => { try { return execFileSync(command, args, options) } catch (error) { return String(error.stdout || '') } }
  if (runner === 'node') {
    let script = ''
    try { script = JSON.parse(readText(root, 'package.json') || '{}').scripts?.test || '' } catch {}
    return parseTap(run(process.execPath, [...nodeTestFlags(script), '--test', '--test-reporter=tap', file]))
  }
  const out = join(tmpdir(), `agentforge-qa-${process.pid}-${Date.now()}.json`)
  if (runner === 'playwright') {
    const config = browser?.config ? ['-c', browser.config] : []
    try { execFileSync('npx', ['--no-install', 'playwright', 'test', ...config, file, '--reporter=json'], { ...options, env: { ...options.env, ...(browser?.env || {}), PLAYWRIGHT_JSON_OUTPUT_NAME: out } }) } catch {}
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

// ---- browser tests --------------------------------------------------------------------
// Browser tests run against localhost only. Many repos point Playwright at their live
// site by default; run from CI on every PR, that signs in with real accounts and writes
// real data. check-qa reads the target the repo's config resolves to (through a wrapper
// config, since Playwright doesn't report baseURL) and runs the tests only when every
// target is local, unless .agentforge/config.json says otherwise:
//   { "qa": { "browser": { "env": { "E2E_BASE_URL": "http://localhost:3000" } } } }
//     env set for browser tests, e.g. to point the repo's own config at a local server;
//   { "qa": { "browser": { "allowRemote": true } } }  run them against a deployed site.
// The wrapper also falls back to the installed Google Chrome when Playwright's own
// Chromium isn't downloaded.
const PLAYWRIGHT_CONFIGS = ['playwright.config.ts', 'playwright.config.mts', 'playwright.config.cts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs']
const CHROME_PATHS = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']

export function isLocalUrl(url) {
  if (!url) return true   // no baseURL: tests use their own URLs, which can't be read here
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) || host.endsWith('.localhost')
  } catch { return false }
}

export function playwrightWrapper(configPath, chromePaths = CHROME_PATHS) {
  return `// Written by LynnCraft's check-qa for one run, then removed. Sits next to the repo's
// config and imports it by relative path, so Playwright loads both the same way.
import { existsSync, writeFileSync } from 'node:fs'
import * as mod from ${JSON.stringify(`./${basename(configPath)}`)}
import { chromium } from '@playwright/test'
const base: any = (mod as any).default?.default ?? (mod as any).default ?? mod
const projects = Array.isArray(base.projects) && base.projects.length ? base.projects : [{}]
const targets = [...new Set(projects.map((project: any) => project.use?.baseURL ?? base.use?.baseURL ?? ''))]
let hasChromium = true
try { hasChromium = existsSync(chromium.executablePath()) } catch { hasChromium = false }
const chrome = !hasChromium && ${JSON.stringify(chromePaths)}.some((path: string) => existsSync(path))
if (process.env.AGENTFORGE_PW_PROBE) writeFileSync(process.env.AGENTFORGE_PW_PROBE, JSON.stringify({ targets, chrome }))
const useChrome = (use: any = {}) => chrome && (!use.browserName || use.browserName === 'chromium') && !use.channel ? { ...use, channel: 'chrome' } : use
export default chrome ? { ...base, use: useChrome(base.use), ...(Array.isArray(base.projects) ? { projects: base.projects.map((project: any) => ({ ...project, use: useChrome({ ...(base.use || {}), ...(project.use || {}) }) })) } : {}) } : base
`
}

// Decide once per check-qa run. Returns { run: true, config, env, cleanup } or
// { run: false, reason, cleanup }.
export function playwrightGate(root) {
  const settings = readConfig(root)?.qa?.browser || {}
  const env = Object.fromEntries(Object.entries(settings.env || {}).filter(([key, value]) => typeof key === 'string' && typeof value === 'string'))
  const found = PLAYWRIGHT_CONFIGS.map(name => join(root, name)).find(path => existsSync(path))
  if (!found) return { run: true, env, cleanup: () => {} }
  const wrapper = join(dirname(found), `.agentforge-playwright-${process.pid}.config.ts`)
  const probe = join(tmpdir(), `agentforge-pw-probe-${process.pid}-${Date.now()}.json`)
  const cleanup = () => { for (const path of [wrapper, probe]) try { rmSync(path) } catch {} }
  writeFileSync(wrapper, playwrightWrapper(found))
  try {
    try { execFileSync('npx', ['--no-install', 'playwright', 'test', '-c', wrapper, '--list'], { cwd: root, stdio: 'ignore', timeout: 120_000, env: { ...process.env, ...env, AGENTFORGE_PW_PROBE: probe } }) } catch {}
    const { targets = [], chrome = false } = JSON.parse(readFileSync(probe, 'utf8'))
    const remote = targets.filter(target => !isLocalUrl(target))
    if (remote.length && settings.allowRemote !== true) {
      cleanup()
      return { run: false, reason: `they target ${remote.join(', ')}, not a local server`, cleanup: () => {} }
    }
    return { run: true, config: wrapper, env, chrome, cleanup }
  } catch {
    // Couldn't read the config: run as before, through the repo's own config.
    try { rmSync(wrapper) } catch {}
    try { rmSync(probe) } catch {}
    return { run: true, env, cleanup: () => {} }
  }
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
// The stored product baseline: { stored, document } (the file may wrap the document), or null.
function loadBaselineDocument(root) {
  const text = readText(root, BASELINE_PATH)
  if (text === null) return null
  try {
    const stored = JSON.parse(text)
    const document = stored?.document || stored
    return document && typeof document === 'object' ? { stored, document } : null
  } catch { return null }
}

export function checkQa(root, { runner: wanted = '', now = new Date().toISOString(), runFile = runTestFile, write = true, retries = 0, browserGate = runFile === runTestFile ? playwrightGate : () => ({ run: true, cleanup: () => {} }) } = {}) {
  const map = loadFeatureMap(root)
  if (!map) return { error: `No ${MAP_PATH} yet. Run the feature-map skill first.`, nothingToCheck: true }
  // The product baseline's journeys name end-to-end tests too: on each test case
  // (journey.testCases[].tests), or on the journey itself in older baselines (journey.tests).
  const baseline = loadBaselineDocument(root)
  const journeys = baseline ? normalizeBaseline(baseline.document).journeys : []
  // Retired (deprecated or removed) features keep their last QA result as history; their tests aren't run.
  const linked = [
    ...map.features.filter(feature => !isRetired(feature)).flatMap(feature => (feature.spec?.document?.acceptanceCriteria || []).flatMap(criterion => Array.isArray(criterion.tests) ? criterion.tests : [])),
    ...journeys.flatMap(journey => [...journey.tests, ...journey.testCases.flatMap(testCase => testCase.tests)]),
  ]
  const unlinkedCases = (journey) => journey.testCases.map(testCase => ({ id: testCase.id, title: testCase.title, kind: testCase.kind, linked: false, qa: 'untested' }))
  if (!linked.length) return { error: 'No acceptance criterion or journey test case names a test yet. Run the verify skill to link tests.', nothingToCheck: true, journeys: journeys.map(journey => ({ id: journey.id, title: journey.title, qa: 'untested', linked: false, cases: unlinkedCases(journey) })) }
  const runner = detectRunner(root, wanted)
  if (!runner) return { error: 'Could not tell which test runner this repository uses. Pass --runner node, jest or vitest.' }
  // Run each linked file once.
  const files = [...new Set(linked.map(test => String(test.path || '').replace(/^\.?\//, '')).filter(Boolean))]
  const results = {}
  const missingFiles = []
  const flaky = []
  const notRun = new Set()
  let browser = null
  let browserSkipped = null
  try {
  for (const file of files) {
    if (!existsSync(join(root, file))) { missingFiles.push(file); results[file] = []; continue }
    const fileRun = fileRunner(root, file, runner)
    if (fileRun === 'playwright') {
      browser ||= browserGate(root)
      if (!browser.run) { notRun.add(file); results[file] = []; browserSkipped = { reason: browser.reason, files: [...(browserSkipped?.files || []), file] }; continue }
    }
    const context = fileRun === 'playwright' ? browser : null
    results[file] = runFile(root, fileRun, file, context)
    for (let attempt = 0; attempt < retries && results[file].some(test => test.status === 'failed'); attempt += 1) {
      const again = runFile(root, fileRun, file, context)
      results[file] = results[file].map(test => {
        if (test.status !== 'failed') return test
        const rerun = again.find(other => other.fullName === test.fullName && other.name === test.name)
        if (rerun?.status !== 'passed') return test
        flaky.push(`${file}: ${test.fullName || test.name}`)
        return { ...test, status: 'passed' }
      })
    }
  }
  } finally { browser?.cleanup?.() }
  const report = []
  for (const feature of map.features) {
    if (isRetired(feature)) continue
    const document = feature.spec?.document
    if (!document) continue
    const criteria = normalizeFeatureSpec(document).acceptanceCriteria
    if (!criteria.some(criterion => criterion.tests.length)) {
      if (feature.qa?.source === 'plugin') delete feature.qa
      continue
    }
    criteria.forEach((criterion, index) => {
      criterion.qa = criterionQa(criterion.tests.map(test => notRun.has(String(test.path || '').replace(/^\.?\//, '')) ? 'not_run' : testOutcome(results[test.path], test.name)))
      if (document.acceptanceCriteria[index]) document.acceptanceCriteria[index].qa = criterion.qa
    })
    const qa = featureQa(criteria)
    const featureFiles = [...new Set(criteria.flatMap(criterion => criterion.tests.map(test => test.path)))]
    const runners = [...new Set(featureFiles.map(file => existsSync(join(root, file)) ? fileRunner(root, file, runner) : runner))]
    feature.qa = { status: qa.status, source: 'plugin', runner: runners.join('+'), checkedAt: now, counts: qa.counts, gaps: qa.gaps, evidence: { ...headEvidence(root, feature), files: [...new Set(criteria.flatMap(criterion => criterion.tests.map(test => test.path)))] } }
    // The spec page shows each criterion's result.
    if (write && (feature.spec?.status === 'complete' || feature.spec?.status === 'in_progress')) {
      const path = specPath(feature)
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), featureSpecMarkdown(feature.name, { ...normalizeFeatureSpec(document), acceptanceCriteria: criteria.map(criterion => ({ ...criterion, verified: feature.spec.status === 'complete' })) }, { featureId: feature.id || '', writtenAt: feature.spec.checkedAt || now, featureStatus: feature.status || 'built', specStatus: feature.spec.status, qa: feature.qa }))
    }
    report.push({ name: feature.name, ...qa, failing: criteria.filter(criterion => criterion.qa === 'fail').map(criterion => criterion.id), uncommitted: Boolean(feature.qa.evidence.uncommitted) })
  }
  if (write) writeFileSync(join(root, MAP_PATH), `${JSON.stringify(map, null, 2)}\n`)
  // Each journey's end-to-end tests, judged the same way as a criterion's.
  const outcome = test => notRun.has(String(test.path || '').replace(/^\.?\//, '')) ? 'not_run' : testOutcome(results[test.path], test.name)
  // Each test case is judged on its own tests; the journey on all of them together.
  const journeyReport = journeys.map(journey => {
    const cases = journey.testCases.map(testCase => ({ id: testCase.id, title: testCase.title, kind: testCase.kind, linked: testCase.tests.length > 0, qa: testCase.tests.length ? criterionQa(testCase.tests.map(outcome)) : 'untested' }))
    const all = [...journey.tests, ...journey.testCases.flatMap(testCase => testCase.tests)]
    return { id: journey.id, title: journey.title, linked: all.length > 0, qa: all.length ? criterionQa(all.map(outcome)) : 'untested', cases }
  })
  if (write && baseline && journeyReport.some(item => item.linked)) {
    const raw = Array.isArray(baseline.document.journeys) ? baseline.document.journeys : []
    for (const item of journeyReport) {
      const target = raw.find(journey => String(journey?.title || '').trim() === item.title)
      if (!target || !item.linked) continue
      target.qa = item.qa
      // Match cases the way normalizeBaseline numbers them: the kept cases, in order.
      const rawCases = (Array.isArray(target.testCases) ? target.testCases : []).filter(testCase => String(testCase?.title || '').trim() || (Array.isArray(testCase?.steps) && testCase.steps.length))
      item.cases.forEach((testCase, index) => {
        if (!rawCases[index]) return
        if (testCase.linked) rawCases[index].qa = testCase.qa
        else delete rawCases[index].qa
      })
    }
    writeFileSync(join(root, BASELINE_PATH), `${JSON.stringify(baseline.stored, null, 2)}\n`)
    try { checkProductBaseline(root, { now }) } catch {}   // rewrites the baseline page with the results
  }
  const runners = [...new Set([runner, ...files.filter(file => existsSync(join(root, file))).map(file => fileRunner(root, file, runner))])]
  return { runner: runners.join('+'), files, missingFiles, flaky, report, journeys: journeyReport, browserSkipped }
}

// The QA report as markdown lines. In CI (ci: true) the check fails when a criterion's
// test fails or a linked test can't be found; criteria with no test yet are listed only.
export function qaReport(result, { ci = false } = {}) {
  // In CI, a repo with nothing to check yet passes with a note rather than failing every PR.
  if (result.error) return { lines: [ci && result.nothingToCheck ? `QA skipped: ${result.error}` : result.error], exitCode: ci && result.nothingToCheck ? 0 : 1 }
  const done = result.report.filter(item => item.status === 'complete').length
  const journeys = result.journeys || []
  const lines = [`# QA: ${done} of ${result.report.length} features fully tested (${result.runner}, ${result.files.length} test files)`, '']
  const WORD = { complete: 'every criterion passes', in_progress: 'partly tested', rejected: 'a test fails', not_started: 'no passing test' }
  for (const item of result.report) {
    lines.push(`- **${item.name}**: ${WORD[item.status]} — ${item.counts.passing}/${item.counts.criteria} criteria pass${item.counts.failing ? `, ${item.counts.failing} fail (${item.failing.join(', ')})` : ''}`)
    const gaps = item.gaps.filter(gap => gap.qa !== 'fail')
    if (gaps.length) lines.push(`  - Not covered: ${gaps.map(gap => `${gap.id}${gap.qa === 'missing' ? ' (linked test not found)' : ''}`).join(', ')}`)
    if (item.uncommitted && !ci) lines.push('  - Its code has uncommitted changes, so this result isn’t tied to a commit. Commit, then run check-qa again.')
  }
  if (journeys.length) {
    const JOURNEY_WORD = { pass: '✓ end-to-end test passes', fail: '✗ end-to-end test fails', missing: '? end-to-end test not found', untested: '— no end-to-end test yet' }
    lines.push('', `Journeys: ${journeys.filter(item => item.qa === 'pass').length} of ${journeys.length} pass their end-to-end test`)
    const CASE_WORD = { pass: '✓ passes', fail: '✗ fails', missing: '? test not found', untested: 'not run' }
    for (const item of journeys) {
      lines.push(`- **${item.id} ${item.title}**: ${item.linked ? JOURNEY_WORD[item.qa] || JOURNEY_WORD.untested : JOURNEY_WORD.untested}`)
      const cases = item.cases || []
      if (cases.length) lines.push(`  - Test cases: ${cases.map(testCase => `${testCase.id} ${testCase.linked ? CASE_WORD[testCase.qa] || CASE_WORD.untested : 'not automated'}`).join(' · ')}`)
    }
  }
  if (result.missingFiles.length) lines.push('', `Test files not found: ${result.missingFiles.join(', ')}`)
  if (result.flaky?.length) lines.push('', `Flaky (failed, then passed on retry): ${result.flaky.join('; ')}`)
  if (result.browserSkipped) lines.push('', `Browser tests not run: ${result.browserSkipped.reason} (${result.browserSkipped.files.join(', ')}). Their criteria count as untested. To run them, start the app locally and point them at it with \`{ "qa": { "browser": { "env": { "<the variable your config reads>": "http://localhost:3000" } } } }\` in .agentforge/config.json, or set \`"allowRemote": true\` there to run them against the deployed site.`)
  const failing = result.report.some(item => item.counts.failing || item.gaps.some(gap => gap.qa === 'missing')) || journeys.some(item => item.linked && (item.qa === 'fail' || item.qa === 'missing')) || result.missingFiles.length > 0
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
  // The plugin's manifest: next to scripts/, or three levels up from a skill's bundled copy.
  for (const manifest of ['../.claude-plugin/plugin.json', '../../../.claude-plugin/plugin.json']) {
    if (version) break
    try { version = JSON.parse(readFileSync(join(source, manifest), 'utf8')).version || '' } catch {}
  }
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({ private: true, type: 'module', description: `LynnCraft's checks for CI, copied from the plugin${version ? ` (${version})` : ''}. Run the setup skill again to update them; don't edit by hand.` }, null, 2)}\n`)
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
  const features = (loadFeatureMap(root)?.features || []).filter(feature => !isRetired(feature) && feature?.id)
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
  // A component page for a container the view no longer zooms into goes, if LynnCraft wrote it.
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
const liveFeatures = (root) => (loadFeatureMap(root)?.features || []).filter(feature => !isRetired(feature) && feature?.id).map(feature => ({ id: feature.id, name: feature.name || feature.id }))

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
  // Write the docs; remove workflow files this map no longer has, but only ones LynnCraft wrote.
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

// ---- verify -----------------------------------------------------------------------
// One verdict for a branch: what GitHub runs on every pull request (--ci) and what the
// verify skill runs on request. Code decides; nothing here asks a model.
//   Must fix (blocks the merge): an acceptance criterion whose cited code the branch
//     changed so it no longer holds, while its spec didn't change with it; a linked test
//     (a criterion's or a journey's) that fails or can't be found.
//   Worth a look (doesn't block): feature code changed while its spec didn't (it may be a
//     refactor), features with no complete spec, new code no feature owns, architecture
//     findings, criteria and journeys with no test yet.
export async function verify(root, { base = '', ci = false, runner = '', now, runFile } = {}) {
  let pr
  try {
    const against = base || defaultBase(root)
    const files = parseNameStatus(git(root, ['diff', '--name-status', '-M', `${against}...HEAD`]))
    const features = loadFeatureMap(root)?.features || []
    const broken = await recheckCriteria({ files, features, getText: headText(root) })
    pr = { base: against, files, spec: specDriftReport({ files, features, broken }), architecture: architectureReport({ files, record: loadDecisionRecords(root), workflows: loadWorkflows(root) }) }
  } catch (error) {
    pr = { error: `Couldn't compare this branch with ${base || 'its base branch'}${error?.message ? ` (${String(error.message).split('\n')[0]})` : ''}.` }
  }
  const qa = checkQa(root, { runner, ...(now ? { now } : {}), ...(runFile ? { runFile } : {}), ...(ci ? { write: false, retries: 1 } : {}) })
  return { pr, qa, ci }
}

export function verifyReport({ pr, qa, ci }) {
  const mustFix = []
  if (pr.error) (ci ? mustFix : []).push(pr.error)
  for (const item of pr.spec?.broken || []) {
    for (const criterion of item.criteria) mustFix.push(`**${item.name} ${criterion.id}** no longer holds: its cited code${criterion.quote ? ` \`${criterion.quote.slice(0, 80)}\`` : ''} is no longer in \`${criterion.path}\`. Fix the code, or, if the behavior changed on purpose, update \`${item.specPath}\` in this branch.`)
  }
  if (qa.error && !qa.nothingToCheck) mustFix.push(`Tests couldn't run: ${qa.error}`)
  for (const item of qa.report || []) {
    if (item.failing.length) mustFix.push(`**${item.name}**: the test for ${item.failing.join(', ')} fails.`)
    const missing = item.gaps.filter(gap => gap.qa === 'missing').map(gap => gap.id)
    if (missing.length) mustFix.push(`**${item.name}**: the linked test for ${missing.join(', ')} wasn't found.`)
  }
  for (const item of qa.journeys || []) {
    if (!item.linked) continue
    // Name the test case when the failure is in one; otherwise the journey's own test.
    const failingCases = (item.cases || []).filter(testCase => testCase.linked && testCase.qa === 'fail')
    const missingCases = (item.cases || []).filter(testCase => testCase.linked && testCase.qa === 'missing')
    for (const testCase of failingCases) mustFix.push(`**Journey ${item.id} ${item.title}**: the end-to-end test for ${testCase.id} (${testCase.title}) fails.`)
    for (const testCase of missingCases) mustFix.push(`**Journey ${item.id} ${item.title}**: the linked end-to-end test for ${testCase.id} (${testCase.title}) wasn't found.`)
    if (item.qa === 'fail' && !failingCases.length) mustFix.push(`**Journey ${item.id} ${item.title}**: its end-to-end test fails.`)
    if (item.qa === 'missing' && !missingCases.length && !failingCases.length) mustFix.push(`**Journey ${item.id} ${item.title}**: its linked end-to-end test wasn't found.`)
  }
  for (const file of qa.missingFiles || []) mustFix.push(`Test file \`${file}\` is linked but doesn't exist.`)

  const lines = ['# LynnCraft verify', '']
  lines.push(mustFix.length ? `❌ **Not ready to merge.** ${mustFix.length} ${mustFix.length === 1 ? 'thing needs' : 'things need'} fixing first.` : '✅ **Ready to merge.** The specs, the code and the tests agree.')
  if (pr.base) lines.push('', `Compared with \`${pr.base}\`: ${pr.files.length} changed file${pr.files.length === 1 ? '' : 's'}.`)
  if (mustFix.length) lines.push('', '## Must fix', ...mustFix.map(item => `- ${item}`))
  const review = []
  if (pr.spec && !pr.spec.featureMapEmpty) {
    const spec = specDriftCheck({ ...pr.spec, broken: [] })
    if (spec.conclusion !== 'success' && spec.text) review.push('### Specs (Maya)', spec.text, '')
  }
  if (pr.spec?.featureMapEmpty) review.push('### Specs (Maya)', 'This repository has no feature map yet, so there are no specs to compare with. The feature-map skill builds one.', '')
  if (pr.architecture) {
    const architecture = architectureCheck(pr.architecture)
    if (architecture.conclusion !== 'success' && architecture.text) review.push('### Architecture (Alex)', architecture.text, '')
  }
  const untested = (qa.report || []).flatMap(item => item.gaps.filter(gap => gap.qa === 'untested').map(gap => `${item.name} ${gap.id}`))
  const noJourneyTest = (qa.journeys || []).filter(item => !item.linked).map(item => `${item.id} ${item.title}`)
  const notAutomated = (qa.journeys || []).flatMap(item => (item.cases || []).filter(testCase => !testCase.linked).map(testCase => testCase.id))
  const noCases = (qa.journeys || []).filter(item => !(item.cases || []).length).map(item => item.id)
  if (untested.length || noJourneyTest.length || notAutomated.length || noCases.length) {
    review.push('### Not tested yet (QA, Priya)')
    if (untested.length) review.push(`- Criteria with no test: ${untested.slice(0, 15).join(', ')}${untested.length > 15 ? ` and ${untested.length - 15} more` : ''}`)
    if (noJourneyTest.length) review.push(`- Journeys with no end-to-end test: ${noJourneyTest.join(', ')}`)
    if (notAutomated.length) review.push(`- End-to-end test cases not automated yet: ${notAutomated.slice(0, 15).join(', ')}${notAutomated.length > 15 ? ` and ${notAutomated.length - 15} more` : ''}`)
    if (noCases.length) review.push(`- Journeys with no end-to-end test cases written: ${noCases.join(', ')} (the product-baseline skill writes them)`)
    review.push('')
  }
  if (review.length) lines.push('', '## Worth a look (doesn’t block the merge)', '', ...review)
  const tests = qaReport(qa).lines
  lines.push('', '## Test results', '', ...tests)
  return { lines: lines.join('\n').replace(/\n{3,}/g, '\n\n').split('\n'), mustFix, exitCode: mustFix.length ? 1 : 0 }
}

function printVerify(result) {
  const { lines, exitCode } = verifyReport(result)
  console.log(lines.join('\n'))
  if (result.ci && process.env.GITHUB_STEP_SUMMARY) { try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, { flag: 'a' }) } catch {} }
  return exitCode
}

// ---- hooks --------------------------------------------------------------------------
// The Claude Code session-start hook (hooks/hooks.json) calls this so Claude knows what
// LynnCraft can do in the repository. It reads the hook's JSON on stdin and never fails
// the session: any error means "say nothing". Checks don't run here: GitHub runs them on
// every pull request, and the verify skill runs them on request.

export function readConfig(root) {
  try { return JSON.parse(readText(root, '.agentforge/config.json') || '{}') } catch { return {} }
}
const hookEnabled = (root, name) => process.env.AGENTFORGE_HOOKS !== 'off' && readConfig(root)?.hooks?.[name] !== false

function repoRoot(cwd) {
  try { return git(cwd, ['rev-parse', '--show-toplevel']) } catch { return '' }
}

// Session start: one factual line for Claude about what LynnCraft can do here.
export function sessionStartContext(root) {
  if (!root || !hookEnabled(root, 'sessionStart')) return ''
  const map = (() => { try { return loadFeatureMap(root) } catch { return null } })()
  const lines = []
  const existingSpecs = (() => { try { return readdirSync(join(root, 'docs/specs')).filter(name => name.endsWith('.md')).length } catch { return 0 } })()
  if (!map) {
    if (existingSpecs) lines.push(`LynnCraft: docs/specs already holds ${existingSpecs} spec${existingSpecs === 1 ? '' : 's'}; the feature map should reuse their ids so they are kept.`)
    lines.push('LynnCraft: this repository has no feature map (.agentforge/feature-map.json) yet. The lynncraft:feature-map skill builds one from the code, and lynncraft:feature-spec then writes specs whose acceptance criteria cite the code. When the user is working on product features, offer this once.')
  } else {
    const live = map.features.filter(feature => !isRetired(feature))
    const open = live.filter(feature => feature.spec?.status !== 'complete').length
    lines.push(`LynnCraft: the feature map lists ${live.length} features${open ? `; ${open} ${open === 1 ? "has" : "have"} no complete spec (the lynncraft:feature-spec skill writes them)` : ', all with complete specs'}.`)
    if (!existsSync(join(root, BASELINE_PATH))) lines.push('There is no product baseline yet; the lynncraft:product-baseline skill writes the users, the journeys across features, and how a PRD lines up with the code.')
  }
  if (!existsSync(join(root, '.github/workflows/agentforge.yml'))) lines.push('LynnCraft is not set up on GitHub here yet: the lynncraft:setup skill adds the verify check to every pull request, so a merge waits until specs, code and tests agree. Offer to set it up once, the first time the user works on code here.')
  return lines.join(' ')
}

async function readStdin() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  try { return JSON.parse(text || '{}') } catch { return {} }
}

async function runHook(name) {
  try {
    const input = await readStdin()
    const root = repoRoot(input.cwd || process.cwd())
    if (name === 'session-start') {
      const context = sessionStartContext(root)
      if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }))
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
  if (options.command === 'verify') process.exit(printVerify(await verify(options.root, { base: options.base, ci: options.ci, runner: options.runner || '' })))
  if (options.command === 'pr-check') {
    const result = await prCheck(options.root, options.base)
    printChecks(result)
    process.exit(options.strict && result.checks.some(check => check.conclusion !== 'success') ? 1 : 0)
  }
  if (options.command === 'install-ci') { const done = installCi(options.root); console.log(`Copied LynnCraft's checks${done.version ? ` (${done.version})` : ''} to ${done.path}/ (${done.files} files). Commit them with the workflow.`); process.exit(0) }
  if (options.command === 'hook') return runHook(process.argv[3])
  console.log('Usage: agentforge.mjs check-specs [--root DIR] | check-baseline [--root DIR] | check-workflows [--root DIR] | check-architecture [--root DIR] | check-qa [--root DIR] [--runner node|jest|vitest] [--ci] | verify [--base BRANCH] [--root DIR] [--runner node|jest|vitest] [--ci] | pr-check [--base BRANCH] [--root DIR] [--strict] | install-ci [--root DIR] | hook session-start')
  process.exit(2)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main()
