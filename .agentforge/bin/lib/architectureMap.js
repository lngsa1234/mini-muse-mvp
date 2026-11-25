// Alex's architecture map: the components of the connected
// repository and how they connect, drawn on his page. The model proposes it; code keeps
// only what holds up — every path is checked against the repository tree, ids are made
// unique, and connections must join two known components.

export const LAYERS = ['client', 'server', 'data', 'external']
export const COMPONENT_KINDS = ['feature', 'agent', 'tools', 'state', 'shell']
export const COMPONENT_KIND_NAMES = { feature: 'Feature UI', agent: 'Agent', tools: 'Tools', state: 'Client state', shell: 'App shell' }
// The same kinds inside a server: a feature is its tools, state is data access, and the
// shell is the endpoints. Which set applies follows the container the view zooms into.
export const SERVER_COMPONENT_KIND_NAMES = { feature: 'Feature tools', agent: 'Agent', tools: 'Tool plumbing', state: 'Data access', shell: 'Endpoints' }
export function componentKindNames(map) {
  const owner = (map?.components || []).find(component => component.id === map?.componentView?.container)
  return owner && owner.layer !== 'client' ? SERVER_COMPONENT_KIND_NAMES : COMPONENT_KIND_NAMES
}
export const LAYER_NAMES = { client: 'Client', server: 'Server', data: 'Data', external: 'External services' }

const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const slug = (value) => clean(value, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// treePaths: every file path in the repository. A component path is kept when it is a
// file, or a directory some file sits under.
// knownFeatures: the product's feature names; feature interactions must name one of them.
export function normalizeArchitectureMap(raw, treePaths = null, { knownFeatures = null } = {}) {
  const tree = Array.isArray(treePaths) ? treePaths : null
  const exists = (path) => !tree || tree.includes(path) || tree.some(file => file.startsWith(`${path.replace(/\/$/, '')}/`))
  const ids = new Map()
  const components = []
  for (const item of Array.isArray(raw?.components) ? raw.components : []) {
    const name = clean(item?.name, 60)
    if (!name) continue
    let id = slug(item?.id) || slug(name) || `component-${components.length + 1}`
    while (components.some(component => component.id === id)) id = `${id}-2`
    // The first component to claim an id or name keeps it, so connections resolve to it.
    for (const key of [clean(item?.id, 60), name]) if (key && !ids.has(key)) ids.set(key, id)
    const layer = LAYERS.includes(item?.layer) ? item.layer : 'server'
    const cited = (Array.isArray(item?.paths) ? item.paths : []).map(path => clean(path, 200).replace(/^\.?\//, '')).filter(Boolean)
    const paths = cited.filter(exists)
    components.push({
      id, name, layer,
      // A technology that just repeats the name ("Neon Postgres" / "Neon Postgres") adds nothing.
      tech: clean(item?.tech, 40).toLowerCase() === name.toLowerCase() ? '' : clean(item?.tech, 40),
      summary: clean(item?.summary, 300),
      paths,
      unconfirmedPaths: cited.filter(path => !exists(path)),
      // External services have no code of their own; anything else needs a real path.
      confirmed: layer === 'external' || paths.length > 0,
    })
    if (components.length === 14) break
  }
  const resolve = (ref) => ids.get(clean(ref, 60)) || (components.some(component => component.id === slug(ref)) ? slug(ref) : null)
  const seen = new Set()
  const connections = []
  for (const item of Array.isArray(raw?.connections) ? raw.connections : []) {
    const from = resolve(item?.from)
    const to = resolve(item?.to)
    if (!from || !to || from === to) continue
    const key = `${from}>${to}`
    if (seen.has(key)) continue
    seen.add(key)
    connections.push({ from, to, label: clean(item?.label, 48), technology: clean(item?.technology, 40) })
  }
  const people = []
  for (const item of Array.isArray(raw?.people) ? raw.people : []) {
    const name = clean(item?.name, 40)
    if (!name) continue
    let id = slug(item?.id) || slug(name)
    while (people.some(person => person.id === id) || components.some(component => component.id === id)) id = `${id}-person`
    people.push({ id, name, description: clean(item?.description, 80), uses: clean(item?.uses, 80) })
    if (people.length === 3) break
  }
  // C4 level 3: the components inside the container that holds the agent.
  const view = raw?.componentView || {}
  const viewIds = new Map()
  const inner = []
  for (const item of Array.isArray(view.components) ? view.components : []) {
    const name = clean(item?.name, 60)
    if (!name) continue
    let id = slug(item?.id) || slug(name)
    while (inner.some(component => component.id === id) || components.some(component => component.id === id)) id = `${id}-2`
    for (const key of [clean(item?.id, 60), name]) if (key && !viewIds.has(key)) viewIds.set(key, id)
    const cited = (Array.isArray(item?.paths) ? item.paths : []).map(path => clean(path, 200).replace(/^\.?\//, '')).filter(Boolean)
    const paths = cited.filter(exists)
    const kind = COMPONENT_KINDS.includes(item?.kind) ? item.kind : 'shell'
    // A feature component names the one feature it belongs to (its id in the feature map).
    const feature = kind === 'feature' ? clean(item?.feature, 60) : ''
    inner.push({ id, name, kind, ...(feature ? { feature } : {}), tech: clean(item?.tech, 40), summary: clean(item?.summary, 300), paths, unconfirmedPaths: cited.filter(path => !exists(path)), confirmed: paths.length > 0 })
    if (inner.length === 14) break
  }
  const resolveAny = (ref) => viewIds.get(clean(ref, 60)) || resolve(ref)
  const innerSeen = new Set()
  const innerRelationships = []
  for (const item of Array.isArray(view.relationships) ? view.relationships : []) {
    const from = resolveAny(item?.from)
    const to = resolveAny(item?.to)
    if (!from || !to || from === to || !inner.some(component => component.id === from || component.id === to)) continue
    if (innerSeen.has(`${from}>${to}`)) continue
    innerSeen.add(`${from}>${to}`)
    innerRelationships.push({ from, to, label: clean(item?.label, 48), technology: clean(item?.technology, 40) })
  }
  const container = resolve(view.container) || components.find(component => component.layer === 'client')?.id || null
  const featureNames = Array.isArray(knownFeatures) ? new Map(knownFeatures.map(name => [String(name).toLowerCase(), name])) : null
  const featureInteractions = []
  for (const item of Array.isArray(raw?.featureInteractions) ? raw.featureInteractions : []) {
    const named = clean(item?.feature, 60)
    const feature = featureNames ? featureNames.get(named.toLowerCase()) : named
    if (!feature || featureInteractions.some(entry => entry.feature === feature)) continue
    const cited = (Array.isArray(item?.paths) ? item.paths : []).map(path => clean(path, 200).replace(/^\.?\//, '')).filter(Boolean)
    featureInteractions.push({
      feature,
      trigger: clean(item?.trigger, 300),
      agentActions: clean(item?.agentActions, 400),
      tools: (Array.isArray(item?.tools) ? item.tools : []).map(tool => ({ name: clean(tool?.name, 60), effect: clean(tool?.effect, 120), needsApproval: tool?.needsApproval === true })).filter(tool => tool.name).slice(0, 12),
      uiUpdates: clean(item?.uiUpdates, 300),
      paths: cited.filter(exists),
    })
  }
  return {
    systemName: clean(raw?.systemName, 60),
    componentView: inner.length ? { container, components: inner, relationships: innerRelationships } : null,
    featureInteractions,
    people,
    summary: clean(raw?.summary, 600),
    components,
    connections,
    limitations: (Array.isArray(raw?.limitations) ? raw.limitations : []).map(item => clean(item, 300)).filter(Boolean),
  }
}

// Mermaid flowchart source: one box per component, grouped by layer, top to bottom.
const label = (text) => String(text || '').replace(/["<>{}[\]|#;]/g, ' ').replace(/\s+/g, ' ').trim()
// labels: false leaves edge labels off; tech: false leaves the technology off the boxes.
export function architectureMermaid(map, { direction = 'TB', labels = true, tech = true } = {}) {
  const lines = [`flowchart ${direction}`]
  for (const layer of LAYERS) {
    const members = (map?.components || []).filter(component => component.layer === layer)
    if (!members.length) continue
    lines.push(`  subgraph ${layer}["${LAYER_NAMES[layer]}"]`)
    for (const component of members) lines.push(`    ${component.id.replace(/-/g, '_')}["${label(component.name)}${tech && component.tech ? `<br/>${label(component.tech)}` : ''}"]`)
    lines.push('  end')
  }
  for (const connection of map?.connections || []) {
    const text = labels ? label(connection.label) : ''
    lines.push(`  ${connection.from.replace(/-/g, '_')} -->${text ? `|${text}|` : ''} ${connection.to.replace(/-/g, '_')}`)
  }
  for (const component of (map?.components || []).filter(entry => !entry.confirmed)) lines.push(`  style ${component.id.replace(/-/g, '_')} stroke-dasharray: 4 3`)
  return lines.join('\n')
}

// The simplest picture: one box per layer naming its components, and an arrow wherever a
// component in one layer talks to a component in another.
export function architectureOverviewMermaid(map, { direction = 'TB' } = {}) {
  const layerOf = Object.fromEntries((map?.components || []).map(component => [component.id, component.layer]))
  const present = LAYERS.filter(layer => (map?.components || []).some(component => component.layer === layer))
  const lines = [`flowchart ${direction}`]
  for (const layer of present) {
    const names = map.components.filter(component => component.layer === layer).map(component => label(component.name))
    lines.push(`  ${layer}["<b>${LAYER_NAMES[layer]}</b><br/>${names.join('<br/>')}"]`)
  }
  const pairs = new Set()
  for (const connection of map?.connections || []) {
    const from = layerOf[connection.from]
    const to = layerOf[connection.to]
    if (from && to && from !== to) pairs.add(`${from}>${to}`)
  }
  for (const pair of pairs) { const [from, to] = pair.split('>'); lines.push(`  ${from} --> ${to}`) }
  return lines.join('\n')
}

export function architectureMarkdown(map, { repository = '', builtAt = '' } = {}) {
  const byId = Object.fromEntries((map?.components || []).map(component => [component.id, component]))
  return [
    '# Architecture',
    '',
    [repository && `Repository: ${repository}`, builtAt && `Mapped: ${String(builtAt).slice(0, 10)}`, 'By Alex (Technical Lead)'].filter(Boolean).join(' · '),
    '',
    map?.summary || '',
    '',
    '```mermaid',
    architectureMermaid(map),
    '```',
    '',
    '## Components',
    '',
    ...LAYERS.flatMap(layer => {
      const members = (map?.components || []).filter(component => component.layer === layer)
      return members.length ? [`### ${LAYER_NAMES[layer]}`, '', ...members.map(component => `- **${component.name}**${component.tech ? ` (${component.tech})` : ''}: ${component.summary}${component.paths.length ? ` — ${component.paths.map(path => `\`${path}\``).join(', ')}` : ''}`), ''] : []
    }),
    '## Connections',
    '',
    ...(map?.connections || []).map(connection => `- ${byId[connection.from]?.name} → ${byId[connection.to]?.name}${connection.label ? `: ${connection.label}` : ''}`),
    '',
    ...(map?.limitations?.length ? ['## Not confirmed', '', ...map.limitations.map(item => `- ${item}`), ''] : []),
  ].join('\n')
}

// Layout for the detailed diagram, drawn as SVG (app/architecture-view.jsx): layers as
// columns left to right (client, server, then external services above data), components
// stacked in each, connections as curves between box edges. Ports on a box side are
// spread out so arrows don't overlap. Pure, so it can be tested.
export const LAYOUT = { pad: 28, header: 30, boxW: 196, boxH: 58, gapY: 16, colGap: 128, groupPad: 14, groupGap: 26 }
const COLUMNS = [['client'], ['server'], ['external', 'data']]

// options.columns / options.names lay out other groupings the same way — the component
// view uses kinds (feature UI | agent | tools and state) instead of layers.
// options.lanes: a connection that skips a column runs along a lane above (or below) the
// boxes, arriving on the box's top (or bottom), instead of cutting through the columns
// in between.
export function architectureLayout(map, options = {}) {
  const { columns = COLUMNS, names = LAYER_NAMES, lanes = false, ...sizes } = options
  const L = { ...LAYOUT, ...sizes }
  const components = map?.components || []
  const groups = []
  const nodes = {}
  let height = 0
  columns.forEach((layers, column) => {
    const x = L.pad + column * (L.boxW + 2 * L.groupPad + L.colGap)
    let y = L.pad
    for (const layer of layers) {
      const members = components.filter(component => component.layer === layer)
      if (!members.length) continue
      const h = L.header + members.length * L.boxH + (members.length - 1) * L.gapY + L.groupPad
      groups.push({ layer, name: names[layer] || layer, x, y, w: L.boxW + 2 * L.groupPad, h })
      members.forEach((component, index) => {
        nodes[component.id] = { ...component, column, x: x + L.groupPad, y: y + L.header + index * (L.boxH + L.gapY), w: L.boxW, h: L.boxH }
      })
      y += h + L.groupGap
    }
    height = Math.max(height, y - L.groupGap + L.pad)
  })
  const usedColumns = Math.max(1, ...Object.values(nodes).map(node => node.column + 1))
  const width = L.pad * 2 + usedColumns * (L.boxW + 2 * L.groupPad) + (usedColumns - 1) * L.colGap + 40
  // Lanes: room above and below the boxes for connections that skip columns.
  const LANE = 22
  // A line needs a lane only when it skips a column and a box in a skipped column sits
  // between its two ends; otherwise the direct curve passes through empty space.
  const blocked = (a, b) => {
    const lo = Math.min(a.y, b.y) - 6, hi = Math.max(a.y, b.y) + L.boxH + 6
    const [c1, c2] = [Math.min(a.column, b.column), Math.max(a.column, b.column)]
    return Object.values(nodes).some(node => node.column > c1 && node.column < c2 && node.y < hi && node.y + node.h > lo)
  }
  const long = (a, b) => lanes && Math.abs(b.column - a.column) > 1 && blocked(a, b)
  const laneEdges = lanes ? (map?.connections || []).filter(connection => nodes[connection.from] && nodes[connection.to] && long(nodes[connection.from], nodes[connection.to])) : []
  const mid = height / 2
  const laneOf = (a, b) => ((a.y + b.y) / 2 + L.boxH / 2 <= mid ? 'top' : 'bottom')
  const topCount = laneEdges.filter(connection => laneOf(nodes[connection.from], nodes[connection.to]) === 'top').length
  const bottomCount = laneEdges.length - topCount
  const shiftY = topCount ? LANE * topCount : 0
  if (shiftY) { for (const node of Object.values(nodes)) node.y += shiftY; for (const group of groups) group.y += shiftY }
  const innerHeight = height
  height += shiftY + (bottomCount ? LANE * bottomCount : 0)
  const laneY = { top: [], bottom: [] }
  laneEdges.forEach(connection => {
    const side = laneOf(nodes[connection.from], nodes[connection.to])
    laneY[side].push(connection)
  })
  const laneFor = (connection) => {
    for (const side of ['top', 'bottom']) {
      const index = laneY[side].indexOf(connection)
      if (index >= 0) return { side, y: side === 'top' ? shiftY - LANE * index - LANE / 2 : shiftY + innerHeight + LANE * index + LANE / 2 - L.pad / 2 }
    }
    return null
  }

  // Which side of each box an edge leaves from / arrives at.
  const sides = []
  const laned = []
  for (const connection of map?.connections || []) {
    const a = nodes[connection.from]
    const b = nodes[connection.to]
    if (!a || !b) continue
    const lane = laneFor(connection)
    if (lane) { laned.push({ connection, a, b, lane }); continue }
    const out = b.column > a.column ? 'right' : b.column < a.column ? 'left' : 'right'
    const into = b.column > a.column ? 'left' : b.column < a.column ? 'right' : 'right'
    sides.push({ connection, a, b, out, into })
  }
  // Spread ports: each box side gets its edges ordered by the other end's height.
  const ports = {}
  const claim = (node, side, otherY, key) => { (ports[`${node.id}:${side}`] ||= []).push({ otherY, key }) }
  sides.forEach((edge, index) => { claim(edge.a, edge.out, edge.b.y, `${index}:out`); claim(edge.b, edge.into, edge.a.y, `${index}:in`) })
  const portY = {}
  for (const [key, list] of Object.entries(ports)) {
    const node = nodes[key.split(':')[0]]
    list.sort((p, q) => p.otherY - q.otherY).forEach((port, index) => { portY[port.key] = node.y + (node.h * (index + 1)) / (list.length + 1) })
  }
  const edges = sides.map((edge, index) => {
    const sx = edge.out === 'right' ? edge.a.x + edge.a.w : edge.a.x
    const tx = edge.into === 'right' ? edge.b.x + edge.b.w : edge.b.x
    const sy = portY[`${index}:out`]
    const ty = portY[`${index}:in`]
    let path
    if (edge.a.column === edge.b.column) {
      const bend = sx + 46
      path = `M ${sx} ${sy} C ${bend} ${sy}, ${bend} ${ty}, ${tx} ${ty}`
    } else {
      const dx = Math.max(40, Math.abs(tx - sx) / 2)
      const sign = edge.out === 'right' ? 1 : -1
      path = `M ${sx} ${sy} C ${sx + sign * dx} ${sy}, ${tx - sign * dx} ${ty}, ${tx} ${ty}`
    }
    return { from: edge.connection.from, to: edge.connection.to, label: edge.connection.label, path }
  })
  // Lane edges leave the side of a box, drop into the gap beside its column, run along
  // the lane above (or below) every box, and come down the gap beside the other column
  // into its side, so they never cross a box. Each takes its own track in a gap.
  const gapX = (node, side) => side === 'right' ? node.x + node.w + L.groupPad + L.colGap / 2 : node.x - L.groupPad - L.colGap / 2
  const tracks = {}
  const track = (x) => { const used = tracks[Math.round(x)] = (tracks[Math.round(x)] || 0) + 1; return x + (used - 1) * 7 }
  for (const edge of laned) {
    const forward = edge.b.column > edge.a.column
    const outSide = forward ? 'right' : 'left'
    const inSide = forward ? 'left' : 'right'
    const sx = outSide === 'right' ? edge.a.x + edge.a.w : edge.a.x
    const tx = inSide === 'right' ? edge.b.x + edge.b.w : edge.b.x
    const sy = edge.a.y + edge.a.h / 2
    const ty = edge.b.y + edge.b.h / 2
    const gx1 = track(gapX(edge.a, outSide))
    const gx2 = track(gapX(edge.b, inSide))
    const ly = edge.lane.y
    const r = 10
    const dirY = (from, to) => (to > from ? 1 : -1)
    const d1 = dirY(sy, ly), d2 = dirY(ly, ty)
    const h = forward ? 1 : -1
    const path = `M ${sx} ${sy} L ${gx1 - h * r} ${sy} Q ${gx1} ${sy}, ${gx1} ${sy + d1 * r} L ${gx1} ${ly - d1 * r} Q ${gx1} ${ly}, ${gx1 + h * r} ${ly} L ${gx2 - h * r} ${ly} Q ${gx2} ${ly}, ${gx2} ${ly + d2 * r} L ${gx2} ${ty - d2 * r} Q ${gx2} ${ty}, ${gx2 + h * r} ${ty} L ${tx} ${ty}`
    edges.push({ from: edge.connection.from, to: edge.connection.to, label: edge.connection.label, path })
  }
  return { width, height, groups, nodes: Object.values(nodes), edges }
}


// C4 documents (agent-skills/vendor/c4-architecture): Level 2 containers (with the people
// and outside systems around them, so no separate Level 1 document) and Level 3
// components, in Mermaid C4 syntax, named as that skill names them.
const c4 = (text) => String(text || '').replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const alias = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '_')
const personOf = (map) => map?.people?.length ? map.people : [{ id: 'user', name: 'User', description: 'Uses the product', uses: 'Uses' }]

// The containers diagram as a Mermaid flowchart in C4 colours. Mermaid's own C4 diagram
// type places boxes in rows without routing lines, so on GitHub arrows cross boxes and
// labels pile up; a flowchart routes edges and stays readable. Top to bottom so it fits
// GitHub's page width: people, then the system's parts grouped by layer inside a dashed
// boundary, then outside systems in a row at the bottom.
const fl = (text) => String(text || '').replace(/["<>{}[\]|#;`]/g, ' ').replace(/\s+/g, ' ').trim()
const node = (id, title, kind, shape = 'box') => {
  const label = `"<b>${fl(title)}</b><br/>${fl(kind)}"`
  return shape === 'db' ? `${id}[(${label})]` : shape === 'person' ? `${id}([${label}])` : `${id}[${label}]`
}
const C4_STYLES = [
  '  classDef person fill:#08427b,stroke:#052e56,color:#ffffff',
  '  classDef container fill:#1168bd,stroke:#0b4884,color:#ffffff',
  '  classDef component fill:#85bbf0,stroke:#5d82a8,color:#0b2545',
  '  classDef agent fill:#c2185b,stroke:#880e4f,color:#ffffff',
  '  classDef external fill:#8a8a8a,stroke:#6b6b6b,color:#ffffff',
  '  classDef boundary fill:none,stroke:#888888,stroke-dasharray:6 4,color:#555555',
]
export function c4ContainersMermaid(map) {
  const system = map?.systemName || 'The system'
  const components = map?.components || []
  const lines = ['flowchart TB']
  for (const person of personOf(map)) lines.push(`  ${node(alias(`p_${person.id}`), person.name, 'Person', 'person')}`)
  lines.push(`  subgraph system["${fl(system)}"]`)
  for (const layer of ['client', 'server', 'data']) {
    const members = components.filter(component => component.layer === layer)
    if (!members.length) continue
    lines.push(`    subgraph ${layer}["${LAYER_NAMES[layer]}"]`)
    for (const component of members) lines.push(`      ${node(alias(component.id), component.name, `Container${component.tech ? `: ${component.tech}` : ''}`, layer === 'data' ? 'db' : 'box')}`)
    lines.push('    end')
  }
  lines.push('  end')
  const externals = components.filter(component => component.layer === 'external')
  if (externals.length) {
    lines.push('  subgraph external["External systems"]')
    for (const component of externals) lines.push(`    ${node(alias(component.id), component.name, 'Software system')}`)
    lines.push('  end')
  }
  const firstClient = components.find(component => component.layer === 'client') || components.find(component => component.layer !== 'external')
  if (firstClient) for (const person of personOf(map)) lines.push(`  ${alias(`p_${person.id}`)} -->|"${fl(person.uses || 'Uses')}"| ${alias(firstClient.id)}`)
  for (const connection of map?.connections || []) lines.push(`  ${alias(connection.from)} -->|"${fl(connection.label)}"| ${alias(connection.to)}`)
  // An invisible link puts the outside systems in a row below the data stores, so the
  // diagram stays narrow enough to read at GitHub's page width.
  const firstData = components.find(component => component.layer === 'data')
  if (firstData && externals.length) lines.push(`  ${alias(firstData.id)} ~~~ ${alias(externals[Math.floor(externals.length / 2)].id)}`)
  lines.push(...C4_STYLES)
  // The container drawn at level 3 opens its components page (docs/architecture/).
  const inner = map?.componentView?.components?.length ? components.find(component => component.id === map.componentView.container) : null
  if (inner) lines.push(`  click ${alias(inner.id)} "${componentsDocPath(map).split('/').pop()}" "${fl(`${inner.name}: its components`)}"`)
  const ids = (layer) => components.filter(component => component.layer === layer).map(component => alias(component.id))
  if (personOf(map).length) lines.push(`  class ${personOf(map).map(person => alias(`p_${person.id}`)).join(',')} person`)
  if ([...ids('client'), ...ids('server'), ...ids('data')].length) lines.push(`  class ${[...ids('client'), ...ids('server'), ...ids('data')].join(',')} container`)
  if (ids('external').length) lines.push(`  class ${ids('external').join(',')} external`)
  lines.push(`  class system,${['client', 'server', 'data'].filter(layer => ids(layer).length).join(',')}${externals.length ? ',external' : ''} boundary`)
  return lines.join('\n')
}

const header = (title, builtAt, repository) => ['---', `title: ${title}`, 'type: Architecture', 'owner: Alex (Technical Lead)', '---', '', `# ${title}`, '', [repository && `Repository: ${repository}`, builtAt && `Mapped: ${String(builtAt).slice(0, 10)}`, 'Mapped by Alex from the code (C4 model)'].filter(Boolean).join(' · '), '']

export function c4ContainersMarkdown(map, { repository = '', builtAt = '' } = {}) {
  const byId = Object.fromEntries((map?.components || []).map(component => [component.id, component]))
  return [
    ...header(`Containers — ${map?.systemName || 'the system'}`, builtAt, repository),
    `C4 level 2: the deployable parts and data stores, how they talk, and the people and outside systems around them${map?.componentView?.components?.length ? `. The inside of the browser app, and how each feature works with the agent, is in [Components](${componentsDocPath(map).replace('docs/architecture/', '')})` : ''}. How requests flow step by step is in [Workflows](workflows/README.md).`, '',
    map?.summary || '', '',
    '```mermaid', c4ContainersMermaid(map), '```', '',
    // The system-context view (C4 level 1) adds nothing a small product's containers view
    // doesn't already show, so its people and outside systems are listed here instead.
    '## People', '', ...personOf(map).map(person => `- **${person.name}** — ${person.description}${person.uses ? `: ${person.uses.charAt(0).toLowerCase()}${person.uses.slice(1)}` : ''}`), '',
    ...((map?.components || []).some(component => component.layer === 'external') ? ['## External systems', '', ...(map.components || []).filter(component => component.layer === 'external').map(external => `- **${external.name}**${external.tech ? ` (${external.tech})` : ''}: ${external.summary}`), ''] : []),
    '## Containers', '',
    '| Container | Layer | Technology | What it does | Code |', '|---|---|---|---|---|',
    ...(map?.components || []).map(component => `| ${component.name}${component.confirmed ? '' : ' _(code not found)_'} | ${LAYER_NAMES[component.layer]} | ${component.tech || ''} | ${String(component.summary).replace(/\|/g, '\\|')} | ${component.paths.map(path => `\`${path}\``).join(', ')} |`),
    '',
    '## Relationships', '',
    ...(map?.connections || []).map(connection => `- ${byId[connection.from]?.name} → ${byId[connection.to]?.name}: ${connection.label}${connection.technology ? ` (${connection.technology})` : ''}`),
    '',
    ...(map?.limitations?.length ? ['## Not confirmed', '', ...map.limitations.map(item => `- ${item}`), ''] : []),
  ].join('\n')
}


// The component view in the same SVG layout: kinds become the layers.
export const COMPONENT_COLUMNS = [['shell', 'feature'], ['agent'], ['tools', 'state']]
// Inside a server, the columns follow a request left to right: who calls in, the
// endpoints, the agent, its tool plumbing, the feature tools, data access, then the
// services and stores it calls out to.
export const SERVER_COMPONENT_COLUMNS = [['callers'], ['shell'], ['agent'], ['tools'], ['feature'], ['state'], ['callees']]
export function componentLayout(map) {
  const view = map?.componentView
  if (!view?.components?.length) return null
  const outside = new Map((map.components || []).map(component => [component.id, component]))
  const outsideIds = [...new Set(view.relationships.flatMap(rel => [rel.from, rel.to]).filter(id => outside.has(id)))]
  const inner = view.components.map(component => ({ ...component, layer: component.kind }))
  const names = componentKindNames(map)
  if (names !== SERVER_COMPONENT_KIND_NAMES) {
    const external = outsideIds.map(id => ({ ...outside.get(id), layer: 'outside' }))
    return architectureLayout({ components: [...inner, ...external], connections: view.relationships }, { columns: [...COMPONENT_COLUMNS, ['outside']], names: { ...names, outside: 'Other containers' }, colGap: 70, boxW: 180 })
  }
  // Clients call in from the left; everything else is called out to on the right, in
  // the order of what calls it (so each sits beside its caller).
  const callers = outsideIds.filter(id => outside.get(id).layer === 'client').map(id => ({ ...outside.get(id), layer: 'callers' }))
  const options = { columns: SERVER_COMPONENT_COLUMNS, names: { ...names, callers: 'Clients', callees: 'Services and data' }, colGap: 56, boxW: 172, lanes: true }
  const draft = architectureLayout({ components: [...inner, ...callers], connections: [] }, options)
  const yOf = Object.fromEntries(draft.nodes.map(node => [node.id, node.y]))
  const calleeY = (id) => { const ys = view.relationships.filter(rel => rel.to === id || rel.from === id).map(rel => yOf[rel.to === id ? rel.from : rel.to]).filter(y => y !== undefined); return ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : Infinity }
  const callees = outsideIds.filter(id => outside.get(id).layer !== 'client').sort((a, b) => calleeY(a) - calleeY(b)).map(id => ({ ...outside.get(id), layer: 'callees' }))
  return architectureLayout({ components: [...inner, ...callers, ...callees], connections: view.relationships }, options)
}

// C4 level 3 (c4-architecture skill: c4-components-{name}.md) with how each feature and
// the agent work together. Drawn top to bottom so the features sit side by side at a
// readable size on GitHub, and several features doing the same thing to one component
// (each registering its tools) become one arrow from the Feature UI group.
export function mergeGroupEdges(relationships, groupOf) {
  const buckets = new Map()
  for (const rel of relationships) {
    const group = groupOf(rel.from)
    const verb = String(rel.label || '').split(/\s+/)[0].toLowerCase()
    const key = group ? `${group}|${rel.to}|${verb}` : null
    if (!key) continue
    buckets.set(key, [...(buckets.get(key) || []), rel])
  }
  const merged = new Set()
  const out = []
  for (const rel of relationships) {
    const group = groupOf(rel.from)
    const verb = String(rel.label || '').split(/\s+/)[0].toLowerCase()
    const bucket = group ? buckets.get(`${group}|${rel.to}|${verb}`) : null
    if (!bucket || bucket.length < 3) { out.push(rel); continue }
    const key = `${group}|${rel.to}|${verb}`
    if (merged.has(key)) continue
    merged.add(key)
    const word = String(rel.label).split(/\s+/)[0]
    const label = bucket.some(item => /tool/i.test(item.label)) ? `Each ${word.toLowerCase().replace(/s$/, '')}s its tools` : `${word} (each feature)`
    out.push({ from: group, to: rel.to, label, group: true })
  }
  return out
}

// Inside a server: left to right like the SVG view — clients, the server's columns in
// request order, then the services and stores it calls. A fan of the same call from one
// component to three or more of one kind becomes one arrow to that kind's box.
function serverComponentsMermaid(map) {
  const view = map.componentView
  const owner = (map.components || []).find(component => component.id === view.container)
  const outside = new Map((map.components || []).map(component => [component.id, component]))
  const names = componentKindNames(map)
  const layout = componentLayout(map)
  const order = layout.nodes.filter(node => node.layer === 'callees').map(node => node.id)
  const callers = layout.nodes.filter(node => node.layer === 'callers').map(node => node.id)
  const outsideNode = (id) => { const component = outside.get(id); return node(alias(id), component.name, component.layer === 'external' ? 'Software system' : `Container${component.tech ? `: ${component.tech}` : ''}`, component.layer === 'data' ? 'db' : 'box') }
  const lines = ['flowchart LR']
  if (callers.length) lines.push('  subgraph clients["Clients"]', ...callers.map(id => `    ${outsideNode(id)}`), '  end')
  lines.push(`  subgraph app["${fl(owner?.name || 'Server')}"]`)
  const kinds = SERVER_COMPONENT_COLUMNS.flat().filter(kind => view.components.some(component => component.kind === kind))
  for (const kind of kinds) {
    lines.push(`    subgraph k_${kind}["${names[kind]}"]`)
    for (const component of view.components.filter(item => item.kind === kind)) lines.push(`      ${node(alias(component.id), component.name, `Component${component.tech ? `: ${component.tech}` : ''}`)}`)
    lines.push('    end')
  }
  lines.push('  end')
  if (order.length) lines.push('  subgraph services["Services and data"]', ...order.map(id => `    ${outsideNode(id)}`), '  end')
  const kindOf = Object.fromEntries(view.components.map(component => [component.id, component.kind]))
  const fans = new Map()
  for (const rel of view.relationships) if (kindOf[rel.to]) { const key = `${rel.from}|${kindOf[rel.to]}|${rel.label}`; fans.set(key, (fans.get(key) || 0) + 1) }
  const column = (id) => { if (callers.includes(id)) return 0; if (order.includes(id)) return 99; return SERVER_COMPONENT_COLUMNS.findIndex(group => group.includes(kindOf[id])) }
  const drawn = new Set()
  for (const rel of view.relationships) {
    const key = kindOf[rel.to] ? `${rel.from}|${kindOf[rel.to]}|${rel.label}` : null
    const to = key && fans.get(key) >= 3 ? `k_${kindOf[rel.to]}` : alias(rel.to)
    if (drawn.has(`${rel.from}>${to}|${rel.label}`)) continue
    drawn.add(`${rel.from}>${to}|${rel.label}`)
    // A call back toward the clients is dotted, so the request's left-to-right flow stays clear.
    lines.push(`  ${alias(rel.from)} ${column(rel.to) < column(rel.from) ? '-.->' : '-->'}|"${fl(rel.label)}"| ${to}`)
  }
  lines.push(...C4_STYLES)
  const agentIds = view.components.filter(component => component.kind === 'agent').map(component => alias(component.id))
  const otherIds = view.components.filter(component => component.kind !== 'agent').map(component => alias(component.id))
  if (otherIds.length) lines.push(`  class ${otherIds.join(',')} component`)
  if (agentIds.length) lines.push(`  class ${agentIds.join(',')} agent`)
  if (callers.length || order.length) lines.push(`  class ${[...callers, ...order].map(alias).join(',')} container`)
  lines.push(`  class app,${kinds.map(kind => `k_${kind}`).join(',')}${callers.length ? ',clients' : ''}${order.length ? ',services' : ''} boundary`)
  return lines.join('\n')
}

export function c4ComponentsMermaid(map) {
  const view = map?.componentView
  if (!view?.components?.length) return ''
  if (componentKindNames(map) === SERVER_COMPONENT_KIND_NAMES) return serverComponentsMermaid(map)
  const owner = (map.components || []).find(component => component.id === view.container)
  const outside = new Map((map.components || []).map(component => [component.id, component]))
  const lines = ['flowchart TB', `  subgraph app["${fl(owner?.name || 'Browser app')}"]`]
  for (const kinds of COMPONENT_COLUMNS) {
    for (const kind of kinds) {
      const members = view.components.filter(component => component.kind === kind)
      if (!members.length) continue
      lines.push(`    subgraph k_${kind}["${componentKindNames(map)[kind]}"]`)
      for (const component of members) lines.push(`      ${node(alias(component.id), component.name, `Component${component.tech ? `: ${component.tech}` : ''}`)}`)
      lines.push('    end')
    }
  }
  lines.push('  end')
  const others = [...new Set(view.relationships.flatMap(rel => [rel.from, rel.to]).filter(id => outside.has(id)))]
  if (others.length) {
    lines.push('  subgraph others["Other containers"]')
    for (const id of others) { const component = outside.get(id); lines.push(`    ${node(alias(id), component.name, component.layer === 'external' ? 'Software system' : `Container${component.tech ? `: ${component.tech}` : ''}`, component.layer === 'data' ? 'db' : 'box')}`) }
    lines.push('  end')
  }
  const kindOf = Object.fromEntries(view.components.map(component => [component.id, component.kind]))
  const edges = mergeGroupEdges(view.relationships, id => kindOf[id] === 'feature' ? 'k_feature' : null)
  // Calls back up the page (approvals answering the chat) are dotted, so the downward
  // flow of a request stays easy to follow.
  const column = (id) => { const kind = id === 'k_feature' ? 'feature' : kindOf[id]; const index = COMPONENT_COLUMNS.findIndex(kinds => kinds.includes(kind)); return index < 0 ? COMPONENT_COLUMNS.length : index }
  for (const rel of edges) lines.push(`  ${rel.group ? rel.from : alias(rel.from)} ${column(rel.to) < column(rel.from) ? '-.->' : '-->'}|"${fl(rel.label)}"| ${alias(rel.to)}`)
  lines.push(...C4_STYLES)
  const agentIds = view.components.filter(component => component.kind === 'agent').map(component => alias(component.id))
  const otherIds = view.components.filter(component => component.kind !== 'agent').map(component => alias(component.id))
  if (otherIds.length) lines.push(`  class ${otherIds.join(',')} component`)
  if (agentIds.length) lines.push(`  class ${agentIds.join(',')} agent`)
  if (others.length) lines.push(`  class ${others.map(alias).join(',')} container`)
  lines.push(`  class app,${COMPONENT_COLUMNS.flat().filter(kind => view.components.some(component => component.kind === kind)).map(kind => `k_${kind}`).join(',')}${others.length ? ',others' : ''} boundary`)
  return lines.join('\n')
}

// What a map breaks, as sentences to fix (the plugin's check-architecture):
// - the component view zooms into a container that exists;
// - every cited path exists;
// - each feature component names one feature from the feature map, no feature has two
//   components, and no component holds the code of two features (the code each feature
//   owns is its anchors in the feature map).
// features: [{ id, name, anchors: ['module:server/agent/tools/memory.js', ...] }]
export function architectureProblems(map, { features = [] } = {}) {
  const problems = []
  const view = map?.componentView
  for (const component of map?.components || []) if (component.unconfirmedPaths?.length) problems.push(`Container "${component.name}" cites files that aren’t in the repository: ${component.unconfirmedPaths.join(', ')}.`)
  if (!view?.components?.length) return problems
  if (!(map.components || []).some(component => component.id === view.container)) problems.push(`The component view zooms into "${view.container}", which isn’t one of the containers.`)
  const byId = new Map(features.map(feature => [feature.id, feature]))
  const anchorPaths = (feature) => (feature.anchors || []).map(anchor => String(typeof anchor === 'string' ? anchor : anchor?.path || '').replace(/^[a-z]+:/, '').replace(/\/$/, '')).filter(Boolean)
  const owns = (path, anchor) => path === anchor || path.startsWith(`${anchor}/`) || anchor.startsWith(`${path}/`)
  const claimed = new Map()
  for (const component of view.components) {
    if (!component.confirmed) problems.push(`Component "${component.name}" cites no file that exists${component.unconfirmedPaths?.length ? ` (${component.unconfirmedPaths.join(', ')})` : ''}.`)
    else if (component.unconfirmedPaths?.length) problems.push(`Component "${component.name}" cites files that aren’t in the repository: ${component.unconfirmedPaths.join(', ')}.`)
    if (component.kind !== 'feature') continue
    if (!component.feature) { problems.push(`Feature component "${component.name}" doesn’t say which feature it belongs to: set "feature" to its id in the feature map.`); continue }
    if (features.length && !byId.has(component.feature)) problems.push(`Feature component "${component.name}" names "${component.feature}", which isn’t in the feature map.`)
    if (claimed.has(component.feature)) problems.push(`"${component.name}" and "${claimed.get(component.feature)}" are both the "${component.feature}" feature: one component per feature.`)
    else claimed.set(component.feature, component.name)
    // Each file belongs to the feature with the most specific anchor for it (a feature
    // anchored on a whole folder doesn't own a file another feature names directly).
    const ownerOf = (path) => {
      let best = [], length = -1
      for (const feature of features) for (const anchor of anchorPaths(feature)) {
        if (!owns(path, anchor)) continue
        const size = anchor.startsWith(`${path}/`) ? path.length : anchor.length
        if (size > length) { best = [feature.id]; length = size } else if (size === length && !best.includes(feature.id)) best.push(feature.id)
      }
      return best
    }
    const mixed = component.paths.flatMap(ownerOf)
    const others = [...new Set(mixed)].filter(id => id !== component.feature)
    if (others.length) problems.push(`"${component.name}" holds code of ${others.map(id => `"${byId.get(id)?.name || id}"`).join(', ')} as well as "${byId.get(component.feature)?.name || component.feature}": split it, one component per feature.`)
  }
  return problems
}

export const componentsDocPath = (map) => {
  const owner = (map?.components || []).find(component => component.id === map?.componentView?.container)
  return `docs/architecture/c4-components-${slug(owner?.name || 'browser-app') || 'browser-app'}.md`
}

export function c4ComponentsMarkdown(map, { repository = '', builtAt = '' } = {}) {
  const view = map?.componentView
  const owner = (map?.components || []).find(component => component.id === view?.container)
  const byId = Object.fromEntries([...(map?.components || []), ...(view?.components || [])].map(component => [component.id, component]))
  const out = [
    ...header(`Inside ${owner?.name || 'the browser app'} — ${map?.systemName || 'the system'}`, builtAt, repository),
    `C4 level 3: the components inside ${owner?.name || 'the browser app'}, with the agent kept apart from each feature’s ${componentKindNames(map) === COMPONENT_KIND_NAMES ? 'UI' : 'tools'}, and how every feature works with the agent. The surrounding containers are in [Containers](c4-containers.md).`, '',
  ]
  if (view?.components?.length) {
    out.push('```mermaid', c4ComponentsMermaid(map), '```', '', '## Components', '', '| Component | Kind | What it does | Code |', '|---|---|---|---|',
      ...view.components.map(component => `| ${component.name}${component.confirmed ? '' : ' _(code not found)_'} | ${componentKindNames(map)[component.kind]} | ${String(component.summary).replace(/\|/g, '\\|')} | ${component.paths.map(path => `\`${path}\``).join(', ')} |`), '',
      '## How they talk', '', ...view.relationships.map(rel => `- ${byId[rel.from]?.name} → ${byId[rel.to]?.name}: ${rel.label}${rel.technology ? ` (${rel.technology})` : ''}`), '')
  }
  if (map?.featureInteractions?.length) {
    out.push('## How each feature works with the agent', '')
    for (const entry of map.featureInteractions) {
      out.push(`### ${entry.feature}`, '')
      if (entry.trigger) out.push(`- **Feature → agent:** ${entry.trigger}`)
      if (entry.agentActions) out.push(`- **The agent:** ${entry.agentActions}`)
      if (entry.uiUpdates) out.push(`- **Agent → feature:** ${entry.uiUpdates}`)
      if (entry.tools.length) out.push('', '| Tool | Effect | Needs approval |', '|---|---|---|', ...entry.tools.map(tool => `| \`${tool.name}\` | ${tool.effect} | ${tool.needsApproval ? 'yes' : 'no'} |`))
      if (entry.paths.length) out.push('', `Code: ${entry.paths.map(path => `\`${path}\``).join(', ')}`)
      out.push('')
    }
  }
  return out.join('\n')
}
