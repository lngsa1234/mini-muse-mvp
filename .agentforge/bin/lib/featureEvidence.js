// Evidence anchors. A feature anchor says where a
// feature lives (route:app/..., module:src/...); an evidence anchor says that it works: the
// build or QA result, the commit it was produced at, and a fingerprint of the code under
// the feature's anchors at that commit. "Verified" is then computed on read: the evidence
// counts only while the code under the anchors still matches the fingerprint.
//
// Fingerprints are content-based (git blob shas), not commit-based, so a squash merge or
// rebase of the verified build onto main reads as unchanged code, and any later edit under
// an anchor reads as changed. No model runs; the GitHub tree supplies the blob shas.
import { createHash } from 'node:crypto'

// Only code anchors carry evidence. Docs changing does not invalidate a test result, and
// commit:* anchors are a moving window of history, not a place in the tree.
const CODE_ANCHOR_KINDS = new Set(['route', 'module'])

function anchorId(anchor) {
  return typeof anchor === 'string' ? anchor : anchor?.id
}

// The tree paths of a feature's code anchors: "route:app/api/runs" → "app/api/runs".
export function codeAnchorPaths(anchors) {
  const paths = new Set()
  for (const anchor of Array.isArray(anchors) ? anchors : []) {
    const id = anchorId(anchor)
    if (typeof id !== 'string') continue
    const split = id.indexOf(':')
    if (split < 1 || !CODE_ANCHOR_KINDS.has(id.slice(0, split))) continue
    const path = id.slice(split + 1).replace(/^\.?\/+|\/+$/g, '')
    if (path) paths.add(path)
  }
  return [...paths].sort()
}

function under(path, file) {
  return file === path || file.startsWith(`${path}/`)
}

// The code anchors a change touched: an anchor is covered when any changed file sits
// under its path. Sorted anchor paths.
export function coveredAnchorPaths(anchors, files) {
  const changed = (Array.isArray(files) ? files : []).filter(file => typeof file === 'string')
  return codeAnchorPaths(anchors).filter(path => changed.some(file => under(path, file)))
}

// One fingerprint per anchor path: a hash of every blob (path and content sha) under it.
// A path with nothing under it fingerprints as null, so an anchor that disappears reads as
// changed rather than silently matching. treeEntries is GitHub's recursive tree list.
export function anchorFingerprints(treeEntries, paths) {
  const blobs = (Array.isArray(treeEntries) ? treeEntries : [])
    .filter(entry => entry && entry.type !== 'tree' && typeof entry.path === 'string' && typeof entry.sha === 'string')
  const result = {}
  for (const path of Array.isArray(paths) ? paths : []) {
    const lines = blobs.filter(entry => under(path, entry.path)).map(entry => `${entry.path}\0${entry.sha}`).sort()
    result[path] = lines.length ? createHash('sha1').update(lines.join('\n')).digest('hex') : null
  }
  return result
}

// Is a layer's evidence still about the code that is there now?
//   fresh     — every fingerprinted anchor matches the current tree
//   stale     — some anchor's code changed (or vanished) since the evidence was recorded
//   unknown   — the evidence has no fingerprints (recorded before evidence anchors, or the
//               feature had no code anchors), so it cannot be checked
//   unchecked — the current tree could not be read (no GitHub access); nothing is claimed
export function evidenceFreshness(layer, currentFingerprints) {
  const recorded = layer?.evidence?.fingerprints
  if (!recorded || typeof recorded !== 'object' || Object.keys(recorded).length === 0) return 'unknown'
  if (!currentFingerprints || typeof currentFingerprints !== 'object') return 'unchecked'
  for (const [path, fingerprint] of Object.entries(recorded)) {
    if (!(path in currentFingerprints)) return 'unchecked'
    if (currentFingerprints[path] !== fingerprint) return 'stale'
  }
  return 'fresh'
}

// Freshness against the default branch, falling back to the evidence's own branch: QA
// that passed on a work item's branch that isn't merged yet reads as 'unmerged' (still
// verified, not on the default branch) while that branch's code is unchanged, instead of
// reading as stale. branchFingerprints: { [branch]: fingerprints } for the branches read.
export function evidenceFreshnessWithBranch(layer, currentFingerprints, branchFingerprints = {}) {
  const freshness = evidenceFreshness(layer, currentFingerprints)
  if (freshness !== 'stale') return freshness
  const branch = layer?.evidence?.branch
  const onBranch = branch ? branchFingerprints?.[branch] : null
  return onBranch && evidenceFreshness(layer, onBranch) === 'fresh' ? 'unmerged' : 'stale'
}

// Proven layers were set by a run or a person; inferred ones are the scan's guess about
// code that existed before AgentForge, never proven through the workflow.
export function layerProvenance(layer) {
  return layer && (layer.assertedBy || layer.artifactRef) ? 'proven' : 'inferred'
}

// The paths whose current fingerprints a map read needs: every code anchor of a feature
// whose QA or build evidence carries fingerprints. Empty means no tree read is needed.
export function pathsNeedingCheck(features) {
  const paths = new Set()
  for (const feature of Array.isArray(features) ? features : []) {
    for (const layer of ['build', 'qa']) {
      for (const path of Object.keys(feature?.[layer]?.evidence?.fingerprints || {})) paths.add(path)
    }
  }
  return [...paths].sort()
}

// Turn a run's build/QA evidence ({ commitSha, branch, files }) into evidence anchors before
// it is saved: the anchors the change covered and the fingerprint of every code anchor of
// the feature at that commit. readTree(sha) returns GitHub's recursive tree entries; when it
// fails, the evidence is kept without fingerprints (it then reads as "unknown", never as
// verified). Returns a new update; the input is not changed.
export async function attachEvidenceAnchors(update, feature, { readTree, now = new Date() } = {}) {
  if (!update) return update
  const layers = ['build', 'qa'].filter(layer => update[layer]?.evidence?.commitSha)
  if (layers.length === 0) return update
  const paths = codeAnchorPaths(feature?.anchors)
  const trees = new Map()
  async function fingerprintsAt(sha) {
    if (!paths.length || typeof readTree !== 'function') return null
    if (!trees.has(sha)) trees.set(sha, readTree(sha).then(entries => anchorFingerprints(entries, paths)).catch(() => null))
    return trees.get(sha)
  }
  const next = { ...update }
  for (const layer of layers) {
    const evidence = update[layer].evidence
    // Every later step of the run repeats the same build evidence: keep what was already
    // recorded for this commit instead of reading the tree again.
    const stored = feature?.[layer]?.evidence
    if (stored?.commitSha === evidence.commitSha && stored.fingerprints) {
      next[layer] = { ...update[layer], evidence: stored }
      continue
    }
    const fingerprints = await fingerprintsAt(evidence.commitSha)
    next[layer] = {
      ...update[layer],
      evidence: {
        ...evidence,
        coveredAnchors: coveredAnchorPaths(feature?.anchors, evidence.files),
        ...(fingerprints ? { fingerprints } : {}),
        recordedAt: evidence.recordedAt || now.toISOString(),
      },
    }
  }
  return next
}
