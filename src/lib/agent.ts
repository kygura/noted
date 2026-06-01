import { db } from '@/db'
import { embedText } from '@/lib/search'
import type { Edge, Region } from '@/types'

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

async function inferEdges(noteId: string, embedding: number[], apiKey: string): Promise<void> {
  const allNotes = await db.notes
    .filter(n => n.id !== noteId && n.archivedAt === null && n.embedding !== null)
    .toArray()

  if (allNotes.length === 0) return

  const scored = allNotes
    .map(n => ({ note: n, sim: cosineSim(embedding, n.embedding!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
    .filter(s => s.sim > 0.3)

  if (scored.length === 0) return

  const existingEdges = await db.edges
    .filter(e => e.srcNoteId === noteId || e.dstNoteId === noteId)
    .toArray()
  const existingPairs = new Set(
    existingEdges.map(e => [e.srcNoteId, e.dstNoteId].sort().join(':'))
  )

  const currentNote = await db.notes.get(noteId)
  if (!currentNote) return

  const neighborsText = scored.map((s, i) =>
    `--- Neighbor ${i + 1} (id: ${s.note.id}) ---\n${s.note.contentMd.slice(0, 600)}`
  ).join('\n\n')

  const prompt = `You are analyzing relationships between notes. Given a source note and its neighbors, identify meaningful edges.

Source note (id: ${noteId}):
${currentNote.contentMd.slice(0, 800)}

Neighbors:
${neighborsText}

For each meaningful relationship, output a JSON array of objects with:
- "neighbor_id": the neighbor's id
- "type": one of "supports", "contradicts", "elaborates", "references", "relates-to"
- "rationale": one sentence explaining the relationship

Only include relationships where there is a clear conceptual connection. Output ONLY the JSON array, no other text.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
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
    if (!res.ok) return

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const proposals: Array<{ neighbor_id: string; type: string; rationale: string }> =
      JSON.parse(jsonMatch[0])

    const validTypes = new Set(['supports', 'contradicts', 'elaborates', 'references', 'relates-to'])
    const edges: Edge[] = []

    for (const p of proposals) {
      if (!validTypes.has(p.type)) continue
      const pair = [noteId, p.neighbor_id].sort().join(':')
      if (existingPairs.has(pair)) continue
      existingPairs.add(pair)

      edges.push({
        id: crypto.randomUUID(),
        srcNoteId: noteId,
        dstNoteId: p.neighbor_id,
        type: p.type as Edge['type'],
        source: 'agent',
        status: 'draft',
        rationale: p.rationale,
        createdAt: new Date().toISOString(),
      })
    }

    if (edges.length > 0) {
      await db.edges.bulkAdd(edges)
    }
  } catch (e) {
    console.error('Edge inference failed:', e)
  }
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

export async function assignRegionsInBatch(noteIds: string[], signal?: AbortSignal): Promise<void> {
  const apiKey = await getApiKey()
  if (!apiKey || noteIds.length === 0) return

  const notes = await db.notes.where('id').anyOf(noteIds).filter(n => n.archivedAt === null).toArray()
  if (notes.length === 0) return

  const noteLines = notes.map((n, i) => {
    const firstLine = n.contentMd.split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
    const label = firstLine.slice(0, 100) || n.contentMd.slice(0, 80)
    return `${i + 1}. [id: ${n.id}] "${label}"`
  }).join('\n')

  const clusterCount = Math.min(8, Math.max(3, Math.ceil(notes.length / 4)))

  const prompt = `You are organizing a collection of notes into semantic clusters.

Given these notes:
${noteLines}

Group them into ${clusterCount === 3 ? '3-5' : '3-8'} meaningful semantic clusters. Each cluster should have a short, descriptive name (2-5 words) and a brief rationale.

Return ONLY valid JSON:
{
  "clusters": [
    {"name": "Cluster Name", "rationale": "One sentence describing what notes belong here"}
  ],
  "assignments": [
    {"noteId": "<id>", "clusterName": "Cluster Name"}
  ]
}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })
    if (!res.ok) return

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const parsed: {
      clusters: Array<{ name: string; rationale: string }>
      assignments: Array<{ noteId: string; clusterName: string }>
    } = JSON.parse(jsonMatch[0])

    const existingRegions = await db.regions.toArray()
    const existingByName = new Map(existingRegions.map(r => [r.name.toLowerCase(), r]))
    const clusterNameToId = new Map<string, string>()
    const now = new Date().toISOString()
    const newRegions: Region[] = []

    for (const cluster of parsed.clusters) {
      const existing = existingByName.get(cluster.name.toLowerCase())
      if (existing) {
        clusterNameToId.set(cluster.name, existing.id)
      } else {
        const id = crypto.randomUUID()
        clusterNameToId.set(cluster.name, id)
        newRegions.push({
          id, parentRegionId: null, name: cluster.name,
          rationale: cluster.rationale, source: 'agent',
          createdAt: now, renamedAt: null,
        })
      }
    }

    if (newRegions.length > 0) await db.regions.bulkAdd(newRegions)

    for (const assignment of parsed.assignments) {
      const regionId = clusterNameToId.get(assignment.clusterName)
      if (regionId) await db.notes.update(assignment.noteId, { regionId, domain: assignment.clusterName })
    }
  } catch (e) {
    if (signal?.aborted) return
    console.error('Batch region assignment failed:', e)
  }
}
