// QA from the repository's own tests (the plugin's check-qa). Each acceptance criterion
// names the tests that check it ({ path, name }); the runner's results decide whether the
// criterion passes, and the criteria decide the feature's QA layer. No model judges it.

// Unescape a TAP test name (node:test escapes # and \).
const tapName = (value) => String(value).replace(/\\([#\\])/g, '$1').trim()

// node:test's TAP output → [{ name, fullName, status }]. Subtests are indented four spaces
// per level and announced by "# Subtest: name"; fullName joins the levels with " > ".
export function parseTap(output) {
  const results = []
  const stack = []
  for (const raw of String(output || '').split('\n')) {
    const indent = (raw.match(/^ */)[0].length) / 4
    const line = raw.trim()
    const subtest = /^# Subtest: (.*)$/.exec(line)
    if (subtest) { stack.length = indent; stack[indent] = tapName(subtest[1]); continue }
    const result = /^(not ok|ok) \d+ - (.*?)(?:\s+#\s*(SKIP|TODO)\b.*)?$/i.exec(line)
    if (!result) continue
    const name = tapName(result[2])
    const parents = stack.slice(0, indent).filter(Boolean)
    stack.length = indent
    results.push({ name, fullName: [...parents, name].join(' > '), status: result[3] ? 'skipped' : result[1] === 'ok' ? 'passed' : 'failed' })
  }
  return results
}

// Jest's (and Vitest's jest-compatible) --json report → { [file]: [{ name, fullName, status }] }.
export function parseJestJson(report, root = '') {
  const out = {}
  for (const file of Array.isArray(report?.testResults) ? report.testResults : []) {
    const path = String(file.name || file.testFilePath || '').replace(`${root.replace(/\/$/, '')}/`, '')
    out[path] = (file.assertionResults || []).map(test => ({
      name: String(test.title || '').trim(),
      fullName: [...(test.ancestorTitles || []), test.title].filter(Boolean).join(' > '),
      status: test.status === 'passed' ? 'passed' : test.status === 'failed' ? 'failed' : 'skipped',
    }))
  }
  return out
}

// Playwright's JSON report -> { [path]: [{ name, fullName, status }] }. Paths are
// relative to the repo root; describe titles join the full name like Jest's.
export function parsePlaywrightJson(report, root = '') {
  const out = {}
  const base = String(report?.config?.rootDir || '').replace(/\/$/, '')
  const rel = file => String(file || '').replace(`${root.replace(/\/$/, '')}/`, '')
  const walk = (suite, parents, file) => {
    const here = suite.file || file
    for (const spec of suite.specs || []) {
      const path = rel(spec.file && base && !String(spec.file).startsWith('/') ? `${base}/${spec.file}` : spec.file || here)
      const statuses = (spec.tests || []).map(test => test.status)
      const status = !statuses.length || statuses.every(s => s === 'skipped') ? 'skipped' : statuses.some(s => s === 'unexpected') ? 'failed' : 'passed'
      ;(out[path] ||= []).push({ name: String(spec.title || '').trim(), fullName: [...parents, spec.title].filter(Boolean).join(' > '), status })
    }
    for (const child of suite.suites || []) walk(child, [...parents, child.title], here) // nested suites are describe blocks
  }
  for (const suite of Array.isArray(report?.suites) ? report.suites : []) walk(suite, [], suite.file)
  return out
}

// One linked test's result: its name matches a test's own name or its full name
// ("describe > test"). Several matches pass only if all pass.
export function testOutcome(results, name) {
  const wanted = String(name || '').trim()
  const found = (results || []).filter(test => test.name === wanted || test.fullName === wanted)
  if (!found.length) return 'missing'
  if (found.some(test => test.status === 'failed')) return 'fail'
  if (found.some(test => test.status === 'skipped')) return 'missing'
  return 'pass'
}

// A criterion's QA from its linked tests' outcomes: any failure fails it; a linked test
// that wasn't found (or was skipped) makes it missing; no tests, untested.
// A browser test check-qa chose not to run (it targets a deployed site) is 'not_run':
// the criterion reads as untested, never as passing, and never fails CI.
export function criterionQa(outcomes) {
  if (!outcomes.length) return 'untested'
  if (outcomes.includes('fail')) return 'fail'
  if (outcomes.includes('missing')) return 'missing'
  if (outcomes.includes('not_run')) return 'untested'
  return 'pass'
}

// The feature's QA layer from its criteria: failing tests reject it; all criteria passing
// completes it; some passing is in progress; none tested is not started.
export function featureQa(criteria) {
  const counts = { criteria: criteria.length, passing: 0, failing: 0, missing: 0, untested: 0 }
  for (const criterion of criteria) counts[{ pass: 'passing', fail: 'failing', missing: 'missing', untested: 'untested' }[criterion.qa] || 'untested'] += 1
  const status = counts.failing ? 'rejected' : counts.criteria && counts.passing === counts.criteria ? 'complete' : counts.passing ? 'in_progress' : 'not_started'
  return {
    status,
    counts,
    gaps: criteria.filter(criterion => criterion.qa !== 'pass').map(criterion => ({ id: criterion.id, qa: criterion.qa || 'untested' })),
  }
}
