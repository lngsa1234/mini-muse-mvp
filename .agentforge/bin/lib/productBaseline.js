// The product baseline: one document, in
// one shape, that says what the product is today. Maya writes it from the feature map
// and the code, and from the customer's PRD when there is one — whatever shape that PRD
// is in. It holds what no single feature spec can: who the product is for, the journeys
// that run across several features, and, with a PRD, what the PRD asks for against what
// is built. The model writes; this module decides whether the baseline holds together.
//
// Pure, with no imports, so the Claude Code plugin can bundle it unchanged
// (plugins/lynncraft/scripts/lib, kept identical by a test).

export const PRIORITIES = Object.freeze(['P1', 'P2', 'P3'])
export const ALIGNMENT = Object.freeze(['built', 'partial', 'not_built'])
export const MAX_JOURNEYS = 8
const ACTORS = ['user', 'agent', 'system']

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const strings = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : [])
// The end-to-end tests that check a journey ({ path, name }), and what verify found when
// it ran them: pass | fail | missing (a linked test wasn't found) | untested.
export const JOURNEY_QA = Object.freeze(['pass', 'fail', 'missing', 'untested'])
const testRefs = (value) => (Array.isArray(value) ? value : [])
  .map(test => ({ path: text(test?.path).replace(/^\.?\//, ''), name: text(test?.name) }))
  .filter(test => test.path && test.name)
// A journey's end-to-end test cases: what QA will walk through the real app to prove the
// journey works — the main path, alternative starts, and each way it can go wrong. Each
// case says what must be true first (given), what the tester or test does (steps), and
// what must be seen (expected). Each case links the automated tests that perform it
// ({ path, name }); verify runs them and sets the case's qa.
export const TEST_CASE_KINDS = Object.freeze(['main', 'alternative', 'failure'])
const testCases = (value) => (Array.isArray(value) ? value : [])
  .map(item => ({
    title: text(item?.title),
    kind: TEST_CASE_KINDS.includes(item?.kind) ? item.kind : 'main',
    given: text(item?.given),
    steps: strings(item?.steps),
    expected: strings(Array.isArray(item?.expected) ? item.expected : [item?.expected]),
    tests: testRefs(item?.tests),
    ...(JOURNEY_QA.includes(item?.qa) ? { qa: item.qa } : {}),
  }))
  .filter(item => item.title || item.steps.length)
const slugify = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// A feature's short id: "owner/repo::goals" and "goals" are both "goals".
export const featureKey = (id) => String(id || '').split('::').pop().trim()

// Coerce the model's baseline. Journeys and PRD requirements get stable ids (J1…, PRD-01…).
export function normalizeBaseline(result) {
  const journeys = (Array.isArray(result?.journeys) ? result.journeys : [])
    .map(item => ({
      title: text(item?.title),
      user: text(item?.user),
      goal: text(item?.goal),
      trigger: text(item?.trigger),
      priority: PRIORITIES.includes(item?.priority) ? item.priority : 'P2',
      steps: (Array.isArray(item?.steps) ? item.steps : [])
        .map(step => ({ actor: ACTORS.includes(step?.actor) ? step.actor : 'system', action: text(step?.action), ...(text(step?.short) ? { short: text(step.short) } : {}), feature: featureKey(step?.feature), approval: step?.approval === true }))
        .filter(step => step.action),
      outcome: text(item?.outcome),
      failures: strings(item?.failures),
      testCases: testCases(item?.testCases),
      tests: testRefs(item?.tests),
      ...(JOURNEY_QA.includes(item?.qa) ? { qa: item.qa } : {}),
    }))
    .filter(item => item.title || item.steps.length)
    .slice(0, MAX_JOURNEYS)
    .map((item, index) => ({ id: `J${index + 1}`, ...item, testCases: item.testCases.map((testCase, caseIndex) => ({ id: `J${index + 1}-T${caseIndex + 1}`, ...testCase })) }))
  const prdRequirements = (Array.isArray(result?.prd?.requirements) ? result.prd.requirements : [])
    .map(item => ({ requirement: text(item?.requirement), source: text(item?.source), status: ALIGNMENT.includes(item?.status) ? item.status : 'not_built', features: [...new Set((Array.isArray(item?.features) ? item.features : []).map(featureKey).filter(Boolean))], note: text(item?.note) }))
    .filter(item => item.requirement)
    .map((item, index) => ({ id: `PRD-${String(index + 1).padStart(2, '0')}`, ...item }))
  return {
    product: {
      name: text(result?.product?.name),
      summary: text(result?.product?.summary),
      users: (Array.isArray(result?.product?.users) ? result.product.users : []).map(user => ({ name: text(user?.name), needs: text(user?.needs) })).filter(user => user.name),
    },
    prd: result?.prd && (text(result.prd.path) || prdRequirements.length) ? { path: text(result.prd.path), requirements: prdRequirements } : null,
    journeys,
    openQuestions: strings(result?.openQuestions),
  }
}

// Check the baseline against the feature map. Problems block it from being complete:
// an empty summary or user list; a journey with fewer than three steps, a step naming a
// feature the map doesn't have, a journey through only one feature (that is the
// feature's own scenario), or an approval on a step that isn't the agent's; a PRD
// requirement called built or partial with no feature, or citing one the map doesn't
// have; a journey with no main-path end-to-end test case, or a test case with no steps or
// no expected result. Coverage — features in no journey, built features the PRD never mentions — is
// reported, not a problem: not every feature is on a journey.
export function checkBaseline(baseline, features) {
  const live = (Array.isArray(features) ? features : []).filter(feature => feature?.status !== 'removed' && feature?.status !== 'deprecated')
  const known = new Map(live.map(feature => [featureKey(feature.id) || slugify(feature.name), feature]))
  const problems = []
  if (!baseline.product.summary) problems.push('The product summary is empty: say in two or three sentences what the product is and who it is for.')
  if (!baseline.product.users.length) problems.push('No users are named: list who uses the product and what each needs from it.')
  if (live.length >= 2 && baseline.journeys.length === 0) problems.push('No journeys: write the end-to-end journeys a user takes through the product, each across several features.')
  for (const journey of baseline.journeys) {
    const issues = []
    if (!journey.title) issues.push('has no title')
    if (!journey.goal) issues.push('has no user goal')
    if (journey.steps.length < 3) issues.push('needs at least three steps')
    const unknown = [...new Set(journey.steps.map(step => step.feature).filter(key => key && !known.has(key)))]
    if (unknown.length) issues.push(`names ${unknown.length === 1 ? 'a feature' : 'features'} not in the feature map (${unknown.join(', ')})`)
    const touched = new Set(journey.steps.map(step => step.feature).filter(key => known.has(key)))
    if (journey.steps.length >= 3 && !unknown.length && touched.size < 2) issues.push('runs through only one feature; make it a scenario in that feature’s spec')
    if (journey.steps.some(step => step.approval && step.actor !== 'agent')) issues.push('marks a step that is not the agent’s as needing approval')
    if (!journey.testCases.length) issues.push('has no end-to-end test cases (write at least its main path)')
    else if (!journey.testCases.some(testCase => testCase.kind === 'main')) issues.push('has no main-path test case')
    if (issues.length) problems.push(`${journey.id} ${issues.join(', ')}.`)
    for (const testCase of journey.testCases) {
      const caseIssues = []
      if (!testCase.title) caseIssues.push('has no title')
      if (testCase.steps.length < 2) caseIssues.push('needs at least two steps')
      if (!testCase.expected.length) caseIssues.push('says nothing about the expected result')
      if (caseIssues.length) problems.push(`${testCase.id} ${caseIssues.join(', ')}.`)
    }
  }
  for (const item of baseline.prd?.requirements || []) {
    const unknown = item.features.filter(key => !known.has(key))
    if (unknown.length) problems.push(`${item.id} cites ${unknown.length === 1 ? 'a feature' : 'features'} not in the feature map (${unknown.join(', ')}).`)
    else if (item.status !== 'not_built' && item.features.length === 0) problems.push(`${item.id} is marked ${item.status.replace('_', ' ')} but names no feature that builds it.`)
  }
  const onJourney = new Set(baseline.journeys.flatMap(journey => journey.steps.map(step => step.feature)))
  const inPrd = new Set((baseline.prd?.requirements || []).flatMap(item => item.features))
  const coverage = {
    features: live.length,
    onJourney: [...known.keys()].filter(key => onJourney.has(key)).length,
    notOnJourney: [...known.entries()].filter(([key]) => !onJourney.has(key)).map(([, feature]) => feature.name),
    prdRequirements: baseline.prd?.requirements.length || 0,
    prdBuilt: (baseline.prd?.requirements || []).filter(item => item.status === 'built').length,
    testCases: baseline.journeys.reduce((sum, journey) => sum + journey.testCases.length, 0),
    automated: baseline.journeys.reduce((sum, journey) => sum + journey.testCases.filter(testCase => testCase.tests.length).length, 0),
    // Ways a journey can go wrong that no failure test case covers yet.
    failuresUncovered: baseline.journeys.filter(journey => journey.failures.length > journey.testCases.filter(testCase => testCase.kind === 'failure').length).map(journey => journey.id),
    notInPrd: baseline.prd ? [...known.entries()].filter(([key, feature]) => !inPrd.has(key) && feature.status !== 'partial').map(([, feature]) => feature.name) : [],
  }
  return { passed: problems.length === 0, problems, coverage }
}

// The doc viewer's heading anchors (repoDocs.headingSlug), so the journey table links land.
const anchor = (text) => String(text).toLowerCase().replace(/[`*_~[\]()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const cell = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

const QA_WORDS = { pass: '✓ passes', fail: '✗ fails', missing: '? test not found' }
const testNames = (tests) => tests.map(test => `\`${test.path}\` › ${test.name}`).join('; ')

// A journey's end-to-end test, as the baseline page shows it: the journey's own linked
// tests (older baselines), or a count of its test cases and how many are automated.
export function journeyTestCell(journey) {
  const tests = Array.isArray(journey?.tests) ? journey.tests : []
  const cases = Array.isArray(journey?.testCases) ? journey.testCases : []
  // The journey's own result, else the worst of its automated cases' results.
  const caseResults = cases.filter(testCase => testCase.tests?.length).map(testCase => testCase.qa)
  const combined = journey?.qa || ['fail', 'missing'].find(qa => caseResults.includes(qa)) || (caseResults.length && caseResults.every(qa => qa === 'pass') ? 'pass' : '')
  const word = QA_WORDS[combined] || 'not run yet'
  if (cases.length) {
    const automated = cases.filter(testCase => testCase.tests?.length).length
    const summary = `${cases.length} test case${cases.length === 1 ? '' : 's'}, ${automated} automated`
    return automated || tests.length ? `${summary} — ${word}` : summary
  }
  if (!tests.length) return 'none yet'
  return `${QA_WORDS[journey.qa] || 'linked, not run yet'} (${testNames(tests)})`
}

// One test case's automated test, as the baseline page shows it.
export function testCaseCell(testCase) {
  if (!testCase?.tests?.length) return 'not automated yet'
  return `${QA_WORDS[testCase.qa] || 'not run yet'} (${testNames(testCase.tests)})`
}

// Mermaid diagrams for the journeys. Labels lose the characters Mermaid would read as
// syntax; long actions are cut so a node stays readable on a phone.
const label = (value, max = 60) => {
  const clean = String(value || '').replace(/;/g, ',').replace(/["`<>{}\[\]|#]/g, '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max).replace(/[\s,(]+$/, '')}…`
}
// One journey as swimlanes: a lane per actor (the journey's user, the product's agent,
// the system), steps numbered in order and flowing between lanes. An agent step that
// waits for approval gets the user's ✋ approval as its own step in the user's lane, just
// before it. Each step shows its feature underneath; the flow ends in the outcome.
export function journeyDiagram(journey, nameOf = (key) => key, { userLane = '', agentLane = '' } = {}) {
  const lanes = { user: label(userLane || journey.user || 'User', 30), agent: label(agentLane || 'Agent', 30), system: 'System' }
  // The step's short label (2–5 words) when it has one; otherwise its action without tool
  // names, kept whole rather than cut mid-sentence.
  const short = (step) => (step.short ? label(step.short, 40) : label(String(step.action || '').replace(/\s*\([a-z_]+(?:,\s*[a-z_]+)*\)/g, ''), 90))
  const nodes = []
  for (const step of journey.steps) {
    if (step.approval && step.actor === 'agent') nodes.push({ actor: 'user', text: '✋ Approves', approval: true })
    nodes.push({ actor: step.actor, text: short(step), feature: step.feature })
  }
  const lines = ['flowchart LR']
  for (const actor of ['user', 'agent', 'system']) {
    const inLane = nodes.map((node, index) => ({ ...node, id: `s${index + 1}`, n: index + 1 })).filter(node => node.actor === actor)
    if (!inLane.length) continue
    lines.push(`  subgraph ${actor}_lane["${lanes[actor]}"]`, '    direction LR')
    for (const node of inLane) {
      const text = `${node.n}. ${node.text}${node.feature ? `<br/><i>${label(nameOf(node.feature), 30)}</i>` : ''}`
      lines.push(node.approval ? `    ${node.id}(["${text}"])` : `    ${node.id}["${text}"]`)
    }
    lines.push('  end')
  }
  nodes.forEach((node, index) => { if (index > 0) lines.push(`  s${index} --> s${index + 1}`) })
  if (journey.outcome && nodes.length) lines.push(`  done(["✅ ${label(journey.outcome, 90)}"])`, `  s${nodes.length} --> done`)
  lines.push(
    '  classDef approval fill:#fff4e0,stroke:#d18a1f,color:#5c3a00',
    '  classDef outcome fill:#e6f6ea,stroke:#2f9e4f,color:#14401f',
  )
  // Style only the lanes drawn: styling a missing one makes Mermaid draw it as a node.
  const LANE_STYLE = { user: 'fill:#fdf2fb,stroke:#d58ad0', agent: 'fill:#effaf7,stroke:#6cc9b4', system: 'fill:#f5f5f5,stroke:#aaa' }
  for (const actor of Object.keys(LANE_STYLE)) if (nodes.some(node => node.actor === actor)) lines.push(`  style ${actor}_lane ${LANE_STYLE[actor]}`)
  const approvals = nodes.map((node, index) => (node.approval ? `s${index + 1}` : '')).filter(Boolean)
  if (approvals.length) lines.push(`  class ${approvals.join(',')} approval`)
  if (journey.outcome && nodes.length) lines.push('  class done outcome')
  return lines.join('\n')
}


// The baseline as Markdown (docs/product/baseline.md). Feature names link to their specs
// when the spec exists (`specExists(path)`).
export function baselineMarkdown(baseline, features, { checked = null, writtenAt = '', specPath = (feature) => `docs/specs/${slugify(featureKey(feature.id) || feature.name)}.md`, specExists = () => true } = {}) {
  const byKey = new Map((Array.isArray(features) ? features : []).map(feature => [featureKey(feature.id) || slugify(feature.name), feature]))
  const link = (key) => {
    const feature = byKey.get(key)
    // Link a feature only to a spec that exists; otherwise name it.
    if (!feature) return key
    return specExists(specPath(feature)) ? `[${feature.name}](../${specPath(feature).replace(/^docs\//, '')})` : feature.name
  }
  const name = baseline.product.name || 'Product'
  const nameOf = (key) => byKey.get(key)?.name || key
  const live = [...byKey.values()].filter(feature => feature.status !== 'removed' && feature.status !== 'deprecated')
  const actorName = (journey, actor) => (actor === 'user' ? journey.user || 'User' : actor === 'agent' ? name : 'System')
  const SPEC_WORDS = { complete: '✓ Checked against the code', in_progress: 'In progress', not_checked: 'Written, not checked yet', not_started: 'Not written yet' }
  const specWords = (feature) => SPEC_WORDS[feature.spec?.status] || SPEC_WORDS.not_started
  const out = ['---', `title: ${name} — product baseline`, 'type: Product baseline', 'owner: Product Manager (Maya)', `status: ${checked ? (checked.passed ? 'Checked' : 'Needs review') : 'Draft'}`, '---', '', `# ${name}: product baseline`, '']
  out.push(`_What the product is today, written by Maya from the code${baseline.prd ? ` and the PRD (\`${baseline.prd.path || 'provided'}\`)` : ''}${writtenAt ? ` on ${writtenAt.slice(0, 10)}` : ''}. Each feature's detail is in its spec._`, '')

  // At a glance: the counts a reader wants before anything else.
  const specCount = (status) => live.filter(feature => (feature.spec?.status || 'not_started') === status).length
  const byPriority = (priority) => baseline.journeys.filter(journey => journey.priority === priority).length
  const glance = [
    `**${baseline.product.users.length}** user${baseline.product.users.length === 1 ? '' : 's'}`,
    `**${baseline.journeys.length}** journeys${baseline.journeys.length ? ` (${['P1', 'P2', 'P3'].map(priority => byPriority(priority) && `${byPriority(priority)} ${priority}`).filter(Boolean).join(', ')})` : ''}`,
    `**${live.length}** features`,
    `specs: **${specCount('complete')}** checked against the code, ${specCount('in_progress') + specCount('not_checked')} in progress, ${specCount('not_started')} not written`,
  ]
  const caseCount = baseline.journeys.reduce((sum, journey) => sum + journey.testCases.length, 0)
  if (caseCount) glance.push(`end-to-end test cases: **${caseCount}**, ${baseline.journeys.reduce((sum, journey) => sum + journey.testCases.filter(testCase => testCase.tests.length).length, 0)} automated`)
  if (baseline.prd?.requirements.length) glance.push(`PRD: **${baseline.prd.requirements.filter(item => item.status === 'built').length}** of ${baseline.prd.requirements.length} requirements built`)
  out.push(`**At a glance:** ${glance.join(' · ')}`, '')

  if (baseline.product.summary) out.push('## Summary', '', baseline.product.summary, '')
  if (baseline.product.users.length) out.push('## Users', '', ...baseline.product.users.map(user => `- **${user.name}**${user.needs ? ` — ${user.needs}` : ''}`), '')

  if (baseline.journeys.length) {
    out.push('## Journeys', '', 'What users set out to do, end to end. Each journey runs through several features; tap a diagram to zoom in.', '')
    out.push('| Journey | Priority | Features it runs through |', '|---|---|---|')
    for (const journey of baseline.journeys) out.push(`| [${journey.id} ${cell(journey.title)}](#${anchor(`${journey.id} ${journey.title}`)}) | ${journey.priority} | ${[...new Set(journey.steps.map(step => step.feature).filter(Boolean))].map(link).join(', ')} |`)
    out.push('')
    for (const journey of baseline.journeys) {
      out.push(`### ${journey.id} ${journey.title}`, '')
      out.push(...[
        `- **Priority:** ${journey.priority}`,
        journey.user && `- **Who:** ${journey.user}`,
        journey.goal && `- **Goal:** ${journey.goal}`,
        journey.trigger && `- **Starts when:** ${journey.trigger}`,
        `- **End-to-end tests:** ${journeyTestCell(journey)}`,
      ].filter(Boolean), '')
      if (journey.steps.length) out.push('```mermaid', journeyDiagram(journey, nameOf, { agentLane: name }), '```', '')
      if (journey.steps.length) {
        // The steps in full, as a table: the diagram shows the shape, this the detail.
        out.push('| # | Who | Step | Feature |', '|---|---|---|---|')
        // Numbered as in the diagram: the user's approval is its own step before the
        // agent step it unlocks.
        let number = 0
        for (const step of journey.steps) {
          const action = step.approval ? step.action.replace(/\s*,?\s*(?:after|once) the user approves\.?$/i, '') : step.action
          if (step.approval && step.actor === 'agent') out.push(`| ${++number} | ${actorName(journey, 'user')} | ✋ Approves: ${cell(action.charAt(0).toLowerCase() + action.slice(1))} | ${step.feature ? link(step.feature) : ''} |`)
          out.push(`| ${++number} | ${actorName(journey, step.actor)} | ${cell(action)} | ${step.feature ? link(step.feature) : ''} |`)
        }
        out.push('')
      }
      if (journey.outcome) out.push(`**Done when:** ${journey.outcome}`, '')
      if (journey.failures.length) out.push('**When it goes wrong:**', '', ...journey.failures.map(item => `- ${item}`), '')
      if (journey.testCases.length) {
        const KIND = { main: 'Main path', alternative: 'Alternative', failure: 'Failure' }
        out.push(`**End-to-end test cases**`, '', '| ID | Test case | Type | Automated test |', '|---|---|---|---|')
        for (const testCase of journey.testCases) out.push(`| ${testCase.id} | ${cell(testCase.title)} | ${KIND[testCase.kind]} | ${cell(testCaseCell(testCase))} |`)
        out.push('')
        for (const testCase of journey.testCases) {
          out.push(`**${testCase.id} ${testCase.title}**`, '')
          if (testCase.given) out.push(`_Given_ ${testCase.given}`, '')
          out.push(...testCase.steps.map((step, index) => `${index + 1}. ${step}`), '')
          if (testCase.expected.length) out.push('_Expect:_', '', ...testCase.expected.map(item => `- ${item}`), '')
        }
      }
    }
  }

  if (live.length) {
    const showBuilt = live.some(feature => feature.status && feature.status !== 'built')
    // With areas (the feature map's optional grouping), an Area column in area order —
    // first appearance, features with no area last; without, the flat table as before.
    const areaOf = (feature) => (typeof feature.area === 'string' ? feature.area.trim() : '')
    const areas = [...new Set(live.map(areaOf))]
    const grouped = areas.some(Boolean)
    const ordered = grouped ? [...areas.filter(Boolean), ''].flatMap(area => live.filter(feature => areaOf(feature) === area)) : live
    const head = [...(grouped ? ['Area'] : []), 'Feature', ...(showBuilt ? ['Built'] : []), 'Spec']
    out.push('## Features', '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`)
    let lastArea = null
    for (const feature of ordered) {
      const key = featureKey(feature.id) || slugify(feature.name)
      const area = areaOf(feature)
      // Name each area once, on its first row.
      const areaCell = area === lastArea ? '' : area ? `**${cell(area)}**` : '_No area_'
      lastArea = area
      const row = [...(grouped ? [areaCell] : []), link(key), ...(showBuilt ? [cell(feature.status === 'partial' ? 'Partly' : 'Yes')] : []), specWords(feature)]
      out.push(`| ${row.join(' | ')} |`)
    }
    out.push('')
  }

  if (baseline.prd?.requirements.length) {
    const words = { built: 'Built', partial: 'Partly built', not_built: 'Not built' }
    out.push('## PRD against the code', '', '| ID | PRD asks for | Where in the PRD | Status | Features |', '|---|---|---|---|---|')
    for (const item of baseline.prd.requirements) out.push(`| ${item.id} | ${cell(item.requirement)}${item.note ? ` _(${cell(item.note)})_` : ''} | ${cell(item.source)} | ${words[item.status]} | ${item.features.map(link).join(', ')} |`)
    out.push('')
    if (checked?.coverage.notInPrd.length) out.push('**Built but not in the PRD:** ' + checked.coverage.notInPrd.join(', '), '')
  }

  // Gaps in one place: features no journey uses, and what still needs a decision.
  const notOnJourney = checked?.coverage.notOnJourney || []
  const failuresUncovered = checked?.coverage.failuresUncovered || []
  if (notOnJourney.length || failuresUncovered.length || baseline.openQuestions.length) {
    out.push('## Gaps and open questions', '')
    if (notOnJourney.length) out.push(`**Features on no journey:** ${notOnJourney.join(', ')}. Supporting features, or journeys still to write.`, '')
    if (failuresUncovered.length) out.push(`**Failures with no test case:** ${failuresUncovered.join(', ')} list more ways to go wrong than they have failure test cases.`, '')
    if (baseline.openQuestions.length) out.push(...baseline.openQuestions.map(item => `- ${item}`), '')
  }
  if (checked && !checked.passed) out.push('## Needs review', '', ...checked.problems.map(item => `- ${item}`), '')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}
