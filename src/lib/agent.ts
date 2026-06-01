import { db } from '@/db'
import { embedText } from '@/lib/search'
import { chooseK, clusterEmbeddings, type Cluster } from '@/lib/atlas/cluster'
import type { Edge, Note, Region } from '@/types'

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const d = Math.sqrt(magA) * Math.sqrt(magB)
  return d === 0 ? 0 : dot / d
}

async function getApiKey(): Promise<string | null> {
  const settings = await db.settings.get('app')
  return settings?.openaiApiKey ?? null
}

export async function runAgentPipeline(noteId: string): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey) return

  const note = await db.notes.get(noteId)
  if (!note) return

  const hash = simpleHash(note.contentMd)
  if (note.contentHash === hash && note.embedding) return

  try {
    const embedding = await embedText(note.contentMd, apiKey)
    await db.notes.update(noteId, { embedding, contentHash: hash })
    await inferEdges(noteId, embedding, apiKey)
    await assignNoteRegion(noteId, apiKey)
  } catch (e) {
    console.error('Agent pipeline failed:', e)
  }
}

const EDGE_NEIGHBOR_LIMIT = 5
const EDGE_MIN_SIM = 0.3
const EDGE_VALID_TYPES = new Set(['supports', 'contradicts', 'elaborates', 'references', 'relates-to'])
// One LLM call per note, so we run several at once to hide network latency.
const EDGE_CONCURRENCY = 5

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

/**
 * Propose agent edges for a single note: find its nearest neighbours in
 * `corpus` (computed locally), ask the model which are meaningful, and return
 * the new Edge rows. This is a pure proposal step — it does not write.
 *
 * `seenPairs` (sorted "a:b" keys) is read *and* mutated to dedupe both against
 * existing edges and against edges proposed earlier in the same batch. The
 * check-and-insert runs synchronously after the network await, so concurrent
 * callers can safely share one set without racing.
 */
async function proposeEdges(
  note: Note,
  corpus: Note[],
  apiKey: string,
  seenPairs: Set<string>,
  signal?: AbortSignal,
): Promise<Edge[]> {
  if (!note.embedding) return []

  const scored = corpus
    .filter(n => n.id !== note.id && n.embedding)
    .map(n => ({ note: n, sim: cosineSim(note.embedding!, n.embedding!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, EDGE_NEIGHBOR_LIMIT)
    .filter(s => s.sim > EDGE_MIN_SIM)

  if (scored.length === 0) return []

  const neighborsText = scored.map((s, i) =>
    `--- Neighbor ${i + 1} (id: ${s.note.id}) ---\n${s.note.contentMd.slice(0, 600)}`
  ).join('\n\n')

  const prompt = `You are analyzing relationships between notes. Given a source note and its neighbors, identify meaningful edges.

Source note (id: ${note.id}):
${note.contentMd.slice(0, 800)}

Neighbors:
${neighborsText}

For each meaningful relationship, output a JSON array of objects with:
- "neighbor_id": the neighbor's id
- "type": one of "supports", "contradicts", "elaborates", "references", "relates-to"
- "rationale": one sentence explaining the relationship

Only include relationships where there is a clear conceptual connection. Output ONLY the JSON array, no other text.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  })
  if (!res.ok) return []

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const proposals: Array<{ neighbor_id: string; type: string; rationale: string }> =
    JSON.parse(jsonMatch[0])

  const edges: Edge[] = []
  for (const p of proposals) {
    if (!EDGE_VALID_TYPES.has(p.type)) continue
    const pair = pairKey(note.id, p.neighbor_id)
    if (seenPairs.has(pair)) continue
    seenPairs.add(pair)

    edges.push({
      id: crypto.randomUUID(),
      srcNoteId: note.id,
      dstNoteId: p.neighbor_id,
      type: p.type as Edge['type'],
      source: 'agent',
      status: 'draft',
      rationale: p.rationale,
      createdAt: new Date().toISOString(),
    })
  }
  return edges
}

async function inferEdges(noteId: string, embedding: number[], apiKey: string): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note) return

  const corpus = await db.notes
    .filter(n => n.id !== noteId && n.archivedAt === null && n.embedding !== null)
    .toArray()
  if (corpus.length === 0) return

  const existingEdges = await db.edges
    .filter(e => e.srcNoteId === noteId || e.dstNoteId === noteId)
    .toArray()
  const seenPairs = new Set(existingEdges.map(e => pairKey(e.srcNoteId, e.dstNoteId)))

  try {
    const edges = await proposeEdges({ ...note, embedding }, corpus, apiKey, seenPairs)
    if (edges.length > 0) await db.edges.bulkAdd(edges)
  } catch (e) {
    console.error('Edge inference failed:', e)
  }
}

/**
 * Infer agent edges for many notes at once, used by the batch pipeline after
 * import. Loads the embedded corpus and existing edges a single time, then
 * runs EDGE_CONCURRENCY proposals in parallel to hide per-call latency. A
 * shared `seenPairs` set dedupes across the whole run (e.g. A→B and B→A when
 * both notes are in the batch). Marks each note's `contentHash` once processed
 * so edges are never re-inferred for unchanged content.
 */
export async function inferEdgesInBatch(
  noteIds: string[],
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey || noteIds.length === 0) return

  const corpus = await db.notes.filter(n => n.archivedAt === null && n.embedding !== null).toArray()
  const targetIds = new Set(noteIds)
  const targets = corpus.filter(n => targetIds.has(n.id))
  if (targets.length === 0) return

  const existingEdges = await db.edges.toArray()
  const seenPairs = new Set(existingEdges.map(e => pairKey(e.srcNoteId, e.dstNoteId)))

  let done = 0
  let cursor = 0
  const runWorker = async (): Promise<void> => {
    while (cursor < targets.length) {
      if (signal?.aborted) return
      const note = targets[cursor++]
      try {
        const edges = await proposeEdges(note, corpus, apiKey, seenPairs, signal)
        if (edges.length > 0) await db.edges.bulkAdd(edges)
      } catch (e) {
        if (signal?.aborted) return
        console.error('Edge inference failed for', note.id, e)
      }
      // Mark content as agent-processed so we don't re-infer on the next mount.
      await db.notes.update(note.id, { contentHash: simpleHash(note.contentMd) })
      done++
      onProgress?.(done, targets.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EDGE_CONCURRENCY, targets.length) }, runWorker),
  )
}

async function assignNoteRegion(noteId: string, apiKey: string): Promise<void> {
  const note = await db.notes.get(noteId)
  if (!note || note.regionId) return

  const existingRegions = await db.regions.toArray()
  const firstLine = note.contentMd.split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
  const preview = note.contentMd.replace(/#{1,6}\s/g, '').slice(0, 400)

  const regionsText = existingRegions.length > 0
    ? existingRegions.map(r => `- "${r.name}": ${r.rationale}`).join('\n')
    : 'None yet.'

  const prompt = `You are assigning a note to a semantic cluster.

Existing clusters:
${regionsText}

Note to assign:
Title/first line: "${firstLine}"
Content preview: ${preview}

Either assign to one of the existing clusters or suggest a new one if none fits well.
Return ONLY valid JSON: {"action": "existing", "name": "<cluster name>"} or {"action": "new", "name": "<2-5 word name>", "rationale": "<one sentence>"}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200,
      }),
    })
    if (!res.ok) return

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const parsed: { action: 'existing'; name: string } | { action: 'new'; name: string; rationale: string } =
      JSON.parse(jsonMatch[0])

    const now = new Date().toISOString()

    if (parsed.action === 'existing') {
      const region = (await db.regions.toArray()).find(
        r => r.name.toLowerCase() === parsed.name.toLowerCase()
      )
      if (region) await db.notes.update(noteId, { regionId: region.id, domain: region.name })
    } else {
      const id = crypto.randomUUID()
      const newRegion: Region = {
        id, parentRegionId: null, name: parsed.name,
        rationale: parsed.rationale, source: 'agent',
        createdAt: now, renamedAt: null,
      }
      await db.regions.add(newRegion)
      await db.notes.update(noteId, { regionId: id, domain: parsed.name })
    }
  } catch (e) {
    console.error('Region assignment failed:', e)
  }
}

export async function regenerateEmbedding(noteId: string): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey) return
  const note = await db.notes.get(noteId)
  if (!note) return
  try {
    const embedding = await embedText(note.contentMd, apiKey)
    const hash = simpleHash(note.contentMd)
    await db.notes.update(noteId, { embedding, contentHash: hash })
  } catch (e) {
    console.error('Embedding regeneration failed:', e)
  }
}

export async function regenerateEmbeddings(
  noteIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey || noteIds.length === 0) return
  const notes = await db.notes.where('id').anyOf(noteIds).toArray()
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]
    try {
      const embedding = await embedText(n.contentMd, apiKey)
      const hash = simpleHash(n.contentMd)
      await db.notes.update(n.id, { embedding, contentHash: hash })
    } catch (e) {
      console.error('Embedding regeneration failed for', n.id, e)
    }
    onProgress?.(i + 1, notes.length)
  }
}

export async function reclusterNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return
  await db.notes.where('id').anyOf(noteIds).modify({ regionId: null })
  await assignRegionsInBatch(noteIds)
  const updated = await db.notes.where('id').anyOf(noteIds).toArray()
  const regionMap = new Map((await db.regions.toArray()).map(r => [r.id, r.name]))
  for (const n of updated) {
    if (n.regionId) {
      const name = regionMap.get(n.regionId) ?? null
      if (name && n.domain !== name) await db.notes.update(n.id, { domain: name })
    }
  }
}

export async function removeRegion(regionId: string): Promise<void> {
  await db.transaction('rw', [db.notes, db.regions], async () => {
    await db.notes.where('regionId').equals(regionId).modify({ regionId: null, domain: null })
    await db.regions.delete(regionId)
  })
}

// A cluster whose centroid is at least this cosine-similar to an existing
// region's centroid is folded into that region instead of spawning a new one,
// so incremental imports reuse territories rather than multiplying them.
const REGION_REUSE_SIM = 0.82

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'notes', 'note', 'untitled', 'have', 'what', 'when', 'where', 'which', 'some',
])

function noteTitle(note: Note): string {
  const firstLine = note.contentMd.split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
  return firstLine.slice(0, 100) || note.contentMd.slice(0, 80)
}

/** Mean embedding per region, from its currently-assigned, embedded notes. */
function computeRegionCentroids(notes: Note[]): Map<string, number[]> {
  const acc = new Map<string, { sum: number[]; count: number }>()
  for (const n of notes) {
    if (!n.regionId || !n.embedding) continue
    let e = acc.get(n.regionId)
    if (!e) { e = { sum: new Array(n.embedding.length).fill(0), count: 0 }; acc.set(n.regionId, e) }
    for (let i = 0; i < n.embedding.length && i < e.sum.length; i++) e.sum[i] += n.embedding[i]
    e.count++
  }
  const out = new Map<string, number[]>()
  for (const [rid, e] of acc) out.set(rid, e.sum.map(x => x / e.count))
  return out
}

/** Best-matching existing region for a cluster centroid (or null). */
function nearestRegion(
  centroid: number[],
  centroids: Map<string, number[]>,
): { regionId: string; sim: number } | null {
  let best: { regionId: string; sim: number } | null = null
  for (const [regionId, c] of centroids) {
    const sim = cosineSim(centroid, c)
    if (!best || sim > best.sim) best = { regionId, sim }
  }
  return best
}

/** Last-resort name when the model is unavailable: the cluster's commonest title word. */
function fallbackClusterName(cluster: Cluster, noteById: Map<string, Note>, index: number): string {
  const counts = new Map<string, number>()
  for (const id of cluster.ids) {
    const note = noteById.get(id)
    if (!note) continue
    for (const word of noteTitle(note).toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length < 4 || STOPWORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  let bestWord = ''
  let bestCount = 0
  for (const [word, count] of counts) {
    if (count > bestCount) { bestCount = count; bestWord = word }
  }
  return bestWord && bestCount >= 2
    ? bestWord[0].toUpperCase() + bestWord.slice(1)
    : `Region ${index + 1}`
}

/**
 * Name the new clusters with a single bounded LLM call (a few representative
 * titles per cluster, ~k names back — no per-note output, so nothing truncates).
 * Any cluster the model doesn't name falls back to a locally-derived label, so
 * territories always form even if the call fails or there's no API key.
 */
async function nameClusters(
  clusters: Cluster[],
  noteById: Map<string, Note>,
  apiKey: string | null,
  signal?: AbortSignal,
): Promise<Map<Cluster, { name: string; rationale: string }>> {
  const out = new Map<Cluster, { name: string; rationale: string }>()
  if (clusters.length === 0) return out

  if (apiKey && !signal?.aborted) {
    const blocks = clusters.map((cl, i) => {
      const titles = cl.ids.slice(0, 8).map(id => `- ${noteTitle(noteById.get(id)!)}`).join('\n')
      return `Cluster ${i + 1} (${cl.ids.length} notes):\n${titles}`
    }).join('\n\n')

    const prompt = `You are naming semantic clusters of notes. For each cluster below, give a short descriptive name (2-5 words) and a one-sentence rationale.

${blocks}

Return ONLY valid JSON with exactly ${clusters.length} entries, in the same order as the clusters:
{"names": [{"name": "Cluster Name", "rationale": "One sentence."}]}`

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 80 * clusters.length + 200,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content?.trim() ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed: { names?: Array<{ name?: string; rationale?: string }> } = JSON.parse(jsonMatch[0])
          clusters.forEach((cl, i) => {
            const named = parsed.names?.[i]
            if (named?.name?.trim()) {
              out.set(cl, { name: named.name.trim(), rationale: named.rationale?.trim() || 'Grouped by semantic similarity.' })
            }
          })
        }
      }
    } catch (e) {
      if (!signal?.aborted) console.error('Cluster naming failed:', e)
    }
  }

  clusters.forEach((cl, i) => {
    if (!out.has(cl)) out.set(cl, { name: fallbackClusterName(cl, noteById, i), rationale: 'Grouped by semantic similarity.' })
  })
  return out
}

/**
 * Carve the given notes into territories. Clustering happens locally on the
 * embeddings (bounded k, deterministic), so it scales to thousands of notes and
 * can't truncate; the LLM is only asked to name the handful of clusters. Notes
 * are assigned in one bulk write. Clusters near an existing region are folded
 * into it so re-imports don't fragment the map.
 */
export async function assignRegionsInBatch(noteIds: string[], signal?: AbortSignal): Promise<void> {
  if (noteIds.length === 0) return
  const apiKey = await getApiKey()

  const targets = await db.notes.where('id').anyOf(noteIds)
    .filter(n => n.archivedAt === null && n.embedding !== null).toArray()
  if (targets.length === 0) return

  const clusters = clusterEmbeddings(
    targets.map(n => ({ id: n.id, embedding: n.embedding! })),
    chooseK(targets.length),
  )
  if (clusters.length === 0 || signal?.aborted) return

  const noteById = new Map(targets.map(n => [n.id, n]))
  const existingRegions = await db.regions.toArray()
  const assignedNotes = await db.notes
    .filter(n => n.archivedAt === null && n.embedding !== null && n.regionId !== null)
    .toArray()
  const regionCentroids = computeRegionCentroids(assignedNotes)
  if (signal?.aborted) return

  // Split clusters into "reuse an existing region" vs "needs a fresh region".
  const clusterRegionId = new Map<Cluster, string>()
  const freshClusters: Cluster[] = []
  for (const cluster of clusters) {
    const match = nearestRegion(cluster.centroid, regionCentroids)
    if (match && match.sim >= REGION_REUSE_SIM) clusterRegionId.set(cluster, match.regionId)
    else freshClusters.push(cluster)
  }

  const names = await nameClusters(freshClusters, noteById, apiKey, signal)
  if (signal?.aborted) return

  const now = new Date().toISOString()
  const existingByName = new Map(existingRegions.map(r => [r.name.toLowerCase(), r]))
  const regionNameById = new Map(existingRegions.map(r => [r.id, r.name]))
  const newRegions: Region[] = []

  for (const cluster of freshClusters) {
    const { name, rationale } = names.get(cluster)!
    const existing = existingByName.get(name.toLowerCase())
    if (existing) {
      clusterRegionId.set(cluster, existing.id)
    } else {
      const id = crypto.randomUUID()
      const region: Region = { id, parentRegionId: null, name, rationale, source: 'agent', createdAt: now, renamedAt: null }
      newRegions.push(region)
      existingByName.set(name.toLowerCase(), region)
      regionNameById.set(id, name)
      clusterRegionId.set(cluster, id)
    }
  }

  if (newRegions.length > 0) await db.regions.bulkAdd(newRegions)

  const updates = clusters.flatMap(cluster => {
    const regionId = clusterRegionId.get(cluster)
    if (!regionId) return []
    const domain = regionNameById.get(regionId) ?? null
    return cluster.ids.map(id => ({ key: id, changes: { regionId, domain } }))
  })
  if (updates.length > 0) await db.notes.bulkUpdate(updates)
}
