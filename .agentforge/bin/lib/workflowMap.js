// Alex's workflow maps: the connected product's main runtime
// flows, step by step. The model proposes them; code keeps what holds up — a step's
// paths are checked against the repository tree (a step with none of its code found is
// marked unconfirmed), ids are made unique, and feature links must name a known feature.

export const ACTORS = ['user', 'agent', 'client', 'server', 'data', 'external']
export const ACTOR_NAMES = { user: 'User', agent: 'Agent', client: 'Client', server: 'Server', data: 'Data', external: 'External' }

const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const slug = (value) => clean(value, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// knownFeatures: [{ id: 'goals', name: 'Goals' }]; without it, feature links are kept as given.
export function normalizeWorkflowMap(raw, { treePaths = null, knownFeatures = null } = {}) {
  const tree = Array.isArray(treePaths) ? treePaths : null
  const exists = (path) => {
    const file = path.replace(/:\d+(-\d+)?$/, '')
    return !tree || tree.includes(file) || tree.some(entry => entry.startsWith(`${file.replace(/\/$/, '')}/`))
  }
  const featureIds = Array.isArray(knownFeatures) ? new Set(knownFeatures.map(feature => feature.id)) : null
  const workflows = []
  for (const item of Array.isArray(raw?.workflows) ? raw.workflows : []) {
    const name = clean(item?.name, 80)
    if (!name) continue
    let id = slug(item?.id) || slug(name) || `workflow-${workflows.length + 1}`
    while (workflows.some(workflow => workflow.id === id)) id = `${id}-2`
    const steps = (Array.isArray(item?.steps) ? item.steps : []).map(step => {
      const actor = ACTORS.includes(step?.actor) ? step.actor : 'server'
      const cited = (Array.isArray(step?.paths) ? step.paths : []).map(path => clean(path, 200).replace(/^\.?\//, '')).filter(Boolean)
      const paths = cited.filter(exists)
      const to = ACTORS.includes(step?.to) && step.to !== actor ? step.to : null
      return {
        actor,
        to,
        // The lifeline's real name (Agent loop, API server, OpenAI) when the model gives
        // one; the actor's layer name otherwise.
        actorName: clean(step?.actorName, 40),
        toName: to ? clean(step?.toName, 40) : '',
        label: clean(step?.label, 48),
        call: to ? clean(step?.call, 120) : '',
        action: clean(step?.action, 400),
        // The step waits for the user (an approval card, a review before Submit).
        approval: step?.approval === true,
        paths,
        unconfirmedPaths: cited.filter(path => !exists(path)),
        // People and outside services have no code here; anything else needs a real path.
        confirmed: actor === 'user' || actor === 'external' || paths.length > 0,
      }
    }).filter(step => step.action).slice(0, 12)
    if (steps.length < 2) continue
    // Repeated or conditional runs of steps (loop, alt, opt), kept only when they cover
    // real steps and nest cleanly, so the diagram never draws a box that cuts another.
    const blocks = []
    for (const block of Array.isArray(item?.blocks) ? item.blocks : []) {
      const kind = ['loop', 'alt', 'opt'].includes(block?.kind) ? block.kind : null
      const from = Math.round(Number(block?.fromStep)), to = Math.round(Number(block?.toStep))
      if (!kind || !(from >= 1) || !(to >= from) || to > steps.length) continue
      if (blocks.some(other => (from < other.fromStep && to >= other.fromStep && to < other.toStep) || (from > other.fromStep && from <= other.toStep && to > other.toStep))) continue
      blocks.push({ kind, label: clean(block?.label, 60), fromStep: from, toStep: to })
      if (blocks.length === 4) break
    }
    workflows.push({
      id, name, blocks,
      summary: clean(item?.summary, 400),
      trigger: clean(item?.trigger, 200),
      steps,
      errorPaths: (Array.isArray(item?.errorPaths) ? item.errorPaths : []).map(entry => clean(entry, 300)).filter(Boolean).slice(0, 6),
      features: [...new Set((Array.isArray(item?.features) ? item.features : []).map(id => clean(id, 60)).filter(id => id && (!featureIds || featureIds.has(id))))],
    })
    if (workflows.length === 8) break
  }
  return { workflows, limitations: (Array.isArray(raw?.limitations) ? raw.limitations : []).map(item => clean(item)).filter(Boolean) }
}

// A workflow as a Mermaid sequence diagram (the workflow-blueprint skill's sequence
// diagram). Every step is an arrow, a self-arrow for work within one part, so the
// diagram's numbers match the Steps table; arrow text is a few words (the detail is in
// the table), lifelines are the real parts in a fixed left-to-right order (the person,
// then the browser, the agent, storage, the server and outside services), and repeated
// or conditional steps sit in loop / alt / opt boxes.
const LIFELINE_ORDER = ['user', 'client', 'agent', 'data', 'server', 'external']
export function shortLabel(step) {
  if (step.label) return step.label
  // A bare function call (run(userMsg), save()) says less than the action sentence.
  const source = step.call && !/^[\w.$]+\(/.test(step.call) ? step.call : step.action
  const base = String(source || '').replace(/\([^)]*\)/g, '').split(/[.:;,]| and | then | with /)[0].replace(/\s+/g, ' ').trim()
  if (base.length <= 36) return base
  return `${base.slice(0, 34).replace(/\s+\S*$/, '')}…`
}
const seqText = (text) => label(text).replace(/:/g, ' -')

// A step's lifeline name, the same in the diagram and the table: the name the step gives,
// else the one name the workflow gives that actor elsewhere (so an unnamed "client" step
// joins the "Mini Muse page" lifeline instead of drawing a second one), else the layer.
export function lifelineNamer(workflow) {
  const named = new Map()
  for (const step of workflow.steps) {
    for (const [actor, name] of [[step.actor, step.actorName], [step.to, step.toName]]) {
      if (!actor || !name) continue
      if (!named.has(actor)) named.set(actor, new Set())
      named.get(actor).add(name)
    }
  }
  return (actor, name) => name || (named.get(actor)?.size === 1 ? [...named.get(actor)][0] : ACTOR_NAMES[actor])
}

export function workflowSequence(workflow) {
  const lifelines = new Map()
  const nameOf = lifelineNamer(workflow)
  const lifeline = (actor, name) => {
    const title = nameOf(actor, name)
    const key = `${actor}|${title.toLowerCase()}`
    if (!lifelines.has(key)) lifelines.set(key, { id: `${actor}${[...lifelines.values()].filter(item => item.actor === actor).length || ''}`, actor, title, first: lifelines.size })
    return lifelines.get(key).id
  }
  const arrows = workflow.steps.map(step => {
    const from = lifeline(step.actor, step.actorName)
    const to = step.to ? lifeline(step.to, step.toName) : from
    return { from, to, text: seqText(shortLabel(step)), reply: step.to && LIFELINE_ORDER.indexOf(step.to) < LIFELINE_ORDER.indexOf(step.actor) }
  })
  const lines = ['sequenceDiagram', '  autonumber']
  const ordered = [...lifelines.values()].sort((a, b) => LIFELINE_ORDER.indexOf(a.actor) - LIFELINE_ORDER.indexOf(b.actor) || a.first - b.first)
  for (const item of ordered) lines.push(`  ${item.actor === 'user' ? 'actor' : 'participant'} ${item.id} as ${seqText(item.title)}`)
  const blocks = workflow.blocks || []
  arrows.forEach((arrow, index) => {
    const number = index + 1
    for (const block of blocks.filter(item => item.fromStep === number).sort((x, y) => y.toStep - x.toStep)) lines.push(`  ${block.kind} ${seqText(block.label || (block.kind === 'loop' ? 'repeat' : 'when needed'))}`)
    lines.push(`  ${arrow.from}${arrow.reply ? '-->>' : '->>'}${arrow.to}: ${arrow.text}`)
    for (const _ of blocks.filter(item => item.toStep === number)) lines.push('  end')
  })
  return lines.join('\n')
}

// Mermaid source for one workflow, top to bottom, a box per step labelled with its actor.
const label = (text) => String(text || '').replace(/["<>{}[\]|#;]/g, ' ').replace(/\s+/g, ' ').trim()
export function workflowMermaid(workflow) {
  const lines = ['flowchart TB']
  if (workflow.trigger) lines.push(`  start(["${label(workflow.trigger)}"])`)
  workflow.steps.forEach((step, index) => lines.push(`  s${index + 1}["${index + 1}. ${ACTOR_NAMES[step.actor]}<br/>${label(step.action)}"]`))
  if (workflow.trigger) lines.push('  start --> s1')
  for (let index = 1; index < workflow.steps.length; index += 1) lines.push(`  s${index} --> s${index + 1}`)
  lines.push('  classDef user fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A', '  classDef agent fill:#EEEDFE,stroke:#534AB7,color:#26215C', '  classDef client fill:#E1F5FE,stroke:#0E7490,color:#164E63', '  classDef server fill:#E1F5EE,stroke:#0F6E56,color:#04342C', '  classDef data fill:#F3E8FF,stroke:#7E22CE,color:#3B0764', '  classDef external fill:#FAEEDA,stroke:#854F0B,color:#412402')
  workflow.steps.forEach((step, index) => lines.push(`  class s${index + 1} ${step.actor}`))
  return lines.join('\n')
}

// The words a loop / alt / opt box adds to its first row: "Repeats, up to 12 steps
// (steps 4–8):", "Only when behind pace:".
export function blockNote(block) {
  const range = block.toStep > block.fromStep ? ` (steps ${block.fromStep}–${block.toStep})` : ''
  const text = String(block.label || '').trim()
  if (block.kind === 'loop') return `Repeats${text ? `, ${text}` : ''}${range}`
  const phrase = !text ? 'When needed' : /^(only|when|if|unless)\b/i.test(text) ? text[0].toUpperCase() + text.slice(1) : `When ${text}`
  return `${phrase}${range}`
}

// A call short enough for a table row: a long argument list becomes (…).
export const shortCall = (call) => {
  const value = String(call || '').trim()
  return value.length > 40 ? value.replace(/\(([^()]{12,})\)/g, '(…)') : value
}

// A cited path as a link from docs/architecture/workflows/ to the file (and its lines,
// as GitHub anchors), shown by file name, or folder/file when the name alone is ambiguous.
const GENERIC_FILES = /^(index|route|page|layout|main|\[[^\]]+\])\.[a-z]+$/i
export function codeLink(path, siblings = []) {
  const match = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(path)
  const file = match[1]
  const parts = file.split('/')
  const base = parts[parts.length - 1] || file
  const clash = siblings.filter(other => other !== path && other.replace(/:.*$/, '').split('/').pop() === base && other.replace(/:.*$/, '') !== file).length > 0
  const shown = (GENERIC_FILES.test(base) || clash) && parts.length > 1 ? parts.slice(-2).join('/') : base
  const lines = match[2] ? `:${match[2]}${match[3] ? `-${match[3]}` : ''}` : ''
  const anchor = match[2] ? `#L${match[2]}${match[3] ? `-L${match[3]}` : ''}` : ''
  return `[${shown}${lines}](../../../${file}${anchor})`
}

// One workflow as a Markdown file for docs/.
// featureNames: { goals: 'Goals' }; a feature links to its spec in docs/specs/.
export function workflowMarkdown(workflow, { featureNames = {}, builtAt = '', repository = '' } = {}) {
  const nameOf = lifelineNamer(workflow)
  const cell = (value) => String(value || '').replace(/\|/g, '\\|')
  const notes = (number) => (workflow.blocks || []).filter(block => block.fromStep === number).map(block => `_${blockNote(block)}:_ `).join('')
  const allPaths = workflow.steps.flatMap(step => step.paths)
  const rows = workflow.steps.map((step, index) => {
    const who = `${nameOf(step.actor, step.actorName)}${step.to ? ` → ${nameOf(step.to, step.toName)}` : ''}`
    const call = step.call ? ` · \`${cell(shortCall(step.call))}\`` : ''
    const action = `${step.approval ? '✋ ' : ''}${notes(index + 1)}${cell(step.action.replace(/\.$/, ''))}${call}${step.confirmed ? '' : ' _(code not found)_'}`
    return `| ${index + 1} | ${cell(who)} | ${action} | ${step.paths.map(path => codeLink(path, allPaths)).join(', ')} |`
  })
  return [
    '---', `title: ${workflow.name}`, 'type: Workflow', 'owner: Alex (Technical Lead)', '---', '',
    `# ${workflow.name}`, '',
    [repository && `Repository: ${repository}`, builtAt && `Mapped: ${String(builtAt).slice(0, 10)}`, 'Mapped by Alex from the code'].filter(Boolean).join(' · '), '',
    workflow.summary, '',
    workflow.trigger ? `**Starts when:** ${workflow.trigger}` : null, workflow.trigger ? '' : null,
    '```mermaid', workflowSequence(workflow), '```', '',
    '## Steps', '',
    '| # | From → To | What happens | Code |', '|---|---|---|---|',
    ...rows,
    '',
    ...(workflow.steps.some(step => step.approval) ? ['✋ The step waits for the user.', ''] : []),
    ...(workflow.errorPaths?.length ? ['## When it goes wrong', '', ...workflow.errorPaths.map(entry => `- ${entry}`), ''] : []),
    ...(workflow.features?.length ? ['## Features it serves', '', ...workflow.features.map(id => `- [${featureNames[id] || id}](../../specs/${id}.md)`), ''] : []),
  ].filter(line => line !== null).join('\n')
}

export function workflowIndexMarkdown(map, { builtAt = '' } = {}) {
  return [
    '---', 'title: Workflows', 'type: Workflow', 'owner: Alex (Technical Lead)', '---', '',
    '# Workflows', '',
    `How the product works at runtime, flow by flow. Mapped by Alex from the code${builtAt ? ` on ${String(builtAt).slice(0, 10)}` : ''}; every step's code is checked against the repository.`, '',
    ...map.workflows.map(workflow => `- [${workflow.name}](${workflow.id}.md) — ${workflow.summary}`), '',
    ...(map.limitations?.length ? ['## Not confirmed', '', ...map.limitations.map(item => `- ${item}`), ''] : []),
  ].join('\n')
}
