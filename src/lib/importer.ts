import { db } from '@/db'
import type { Note, Region, Edge } from '@/types'

export interface ImportProgress {
  phase: 'scanning' | 'ingesting' | 'done' | 'restoring'
  filesFound: number
  filesIngested: number
  skipped: number
  folderMap: Map<string, number>
  hasExportJson: boolean
}

export type ProgressCallback = (progress: ImportProgress) => void

interface ExportJson {
  schema_version: string
  exported_at: string
  regions: Array<{
    id: string
    parent_region_id: string | null
    name: string
    rationale: string
    source: 'agent' | 'user'
  }>
  notes: Array<{
    id: string
    filename: string
    region_id: string
    kind: 'thought' | 'source'
    style: string
    intent: string
    completion_state: string
    domain: string
    graph_x: number
    graph_y: number
    placement_rationale: string
    revision_count: number
    created_at: string
    updated_at: string
  }>
  edges: Array<{
    id: string
    src_note_id: string
    dst_note_id: string
    type: string
    source: string
    status: string
    rationale: string
  }>
}

interface CollectedFile {
  relativePath: string
  content: string
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function getRelativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}

function stripCommonPrefix(paths: string[]): string[] {
  if (paths.length <= 1) return paths
  const parts = paths.map(p => p.split('/'))
  let common = 0
  outer:
  for (let i = 0; i < parts[0].length - 1; i++) {
    const seg = parts[0][i]
    for (let j = 1; j < parts.length; j++) {
      if (parts[j][i] !== seg) break outer
    }
    common = i + 1
  }
  return paths.map(p => p.split('/').slice(common).join('/'))
}

export async function importFiles(files: File[], onProgress: ProgressCallback): Promise<void> {
  const progress: ImportProgress = {
    phase: 'scanning',
    filesFound: 0,
    filesIngested: 0,
    skipped: 0,
    folderMap: new Map(),
    hasExportJson: false,
  }
  onProgress({ ...progress })

  const mdFiles: File[] = []
  let exportJsonFile: File | null = null

  for (const file of files) {
    const name = file.name.toLowerCase()
    if (name === 'noted-export.json') {
      exportJsonFile = file
      progress.hasExportJson = true
    } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
      if (!shouldSkipFile(getRelativePath(file))) {
        mdFiles.push(file)
      } else {
        progress.skipped++
      }
    } else {
      progress.skipped++
    }
  }

  progress.filesFound = mdFiles.length
  onProgress({ ...progress })

  if (exportJsonFile) {
    progress.phase = 'restoring'
    onProgress({ ...progress })
    await restoreFromExport(exportJsonFile, mdFiles, onProgress, progress)
    return
  }

  progress.phase = 'ingesting'
  onProgress({ ...progress })

  const rawPaths = mdFiles.map(f => getRelativePath(f))
  const stripped = stripCommonPrefix(rawPaths)

  const collected: CollectedFile[] = []
  for (let i = 0; i < mdFiles.length; i++) {
    const content = await readFileAsText(mdFiles[i])
    collected.push({ relativePath: stripped[i], content })
  }

  const BATCH = 50
  for (let i = 0; i < collected.length; i += BATCH) {
    const batch = collected.slice(i, i + BATCH)
    const notes: Note[] = batch.map(f => {
      const now = new Date().toISOString()
      const folder = f.relativePath.includes('/')
        ? f.relativePath.substring(0, f.relativePath.lastIndexOf('/'))
        : null
      if (folder) {
        progress.folderMap.set(folder, (progress.folderMap.get(folder) ?? 0) + 1)
      }
      return {
        id: crypto.randomUUID(),
        regionId: null,
        kind: 'source' as const,
        contentMd: f.content,
        style: null,
        intent: null,
        completionState: null,
        domain: null,
        graphX: Math.random() * 1000 - 500,
        graphY: Math.random() * 800 - 400,
        placementRationale: null,
        revisionCount: 0,
        importSource: f.relativePath,
        archivedAt: null,
        embedding: null,
        contentHash: null,
        createdAt: now,
        updatedAt: now,
      }
    })
    await db.notes.bulkAdd(notes)
    progress.filesIngested += batch.length
    onProgress({ ...progress })
  }

  progress.phase = 'done'
  onProgress({ ...progress })
}

async function restoreFromExport(
  jsonFile: File,
  mdFiles: File[],
  onProgress: ProgressCallback,
  progress: ImportProgress,
) {
  const raw = await readFileAsText(jsonFile)
  const data: ExportJson = JSON.parse(raw)

  const mdByName = new Map<string, File>()
  for (const f of mdFiles) {
    mdByName.set(f.name, f)
  }

  if (data.regions?.length) {
    const regions: Region[] = data.regions.map(r => ({
      id: r.id,
      parentRegionId: r.parent_region_id,
      name: r.name,
      rationale: r.rationale,
      source: r.source,
      createdAt: new Date().toISOString(),
      renamedAt: null,
    }))
    await db.regions.bulkPut(regions)
  }

  progress.filesFound = data.notes?.length ?? mdFiles.length

  if (data.notes?.length) {
    const BATCH = 50
    for (let i = 0; i < data.notes.length; i += BATCH) {
      const batch = data.notes.slice(i, i + BATCH)
      const notes: Note[] = []
      for (const n of batch) {
        const mdFile = mdByName.get(n.filename)
        const content = mdFile ? await readFileAsText(mdFile) : ''
        notes.push({
          id: n.id,
          regionId: n.region_id || null,
          kind: n.kind,
          contentMd: content,
          style: n.style || null,
          intent: n.intent || null,
          completionState: n.completion_state || null,
          domain: n.domain || null,
          graphX: n.graph_x ?? 0,
          graphY: n.graph_y ?? 0,
          placementRationale: n.placement_rationale || null,
          revisionCount: n.revision_count ?? 0,
          importSource: n.filename,
          archivedAt: null,
          embedding: null,
          contentHash: null,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        })
      }
      await db.notes.bulkPut(notes)
      progress.filesIngested += batch.length
      onProgress({ ...progress })
    }
  }

  if (data.edges?.length) {
    const edges: Edge[] = data.edges.map(e => ({
      id: e.id,
      srcNoteId: e.src_note_id,
      dstNoteId: e.dst_note_id,
      type: e.type as Edge['type'],
      source: e.source as Edge['source'],
      status: e.status as Edge['status'],
      rationale: e.rationale,
      createdAt: new Date().toISOString(),
    }))
    await db.edges.bulkPut(edges)
  }

  progress.phase = 'done'
  onProgress({ ...progress })
}

function shouldSkipFile(path: string): boolean {
  const lower = path.toLowerCase()
  const segments = lower.split('/')
  for (const seg of segments) {
    if (seg.startsWith('.') || seg === 'node_modules' || seg === '.obsidian' || seg === '.trash') {
      return true
    }
  }
  return false
}
