import JSZip from 'jszip'
import { db } from '@/db'

export interface ExportProgress {
  phase: 'gathering' | 'packing' | 'done'
  total: number
  packed: number
}

export type ExportProgressCallback = (progress: ExportProgress) => void

export async function exportAll(onProgress: ExportProgressCallback): Promise<Blob> {
  const progress: ExportProgress = { phase: 'gathering', total: 0, packed: 0 }
  onProgress({ ...progress })

  const notes = await db.notes.toArray()
  const regions = await db.regions.toArray()
  const edges = await db.edges.filter(e => e.status !== 'rejected').toArray()

  progress.total = notes.length
  progress.phase = 'packing'
  onProgress({ ...progress })

  const zip = new JSZip()

  const exportJson = {
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    embedding_model: 'text-embedding-3-small',
    regions: regions.map(r => ({
      id: r.id,
      parent_region_id: r.parentRegionId,
      name: r.name,
      rationale: r.rationale,
      source: r.source,
    })),
    notes: notes.map(n => ({
      id: n.id,
      filename: filenameForNote(n.importSource, n.id),
      region_id: n.regionId,
      kind: n.kind,
      style: n.style ?? '',
      intent: n.intent ?? '',
      completion_state: n.completionState ?? '',
      domain: n.domain ?? '',
      graph_x: n.graphX,
      graph_y: n.graphY,
      placement_rationale: n.placementRationale ?? '',
      revision_count: n.revisionCount,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    })),
    edges: edges.map(e => ({
      id: e.id,
      src_note_id: e.srcNoteId,
      dst_note_id: e.dstNoteId,
      type: e.type,
      source: e.source,
      status: e.status,
      rationale: e.rationale,
    })),
  }

  zip.file('noted-export.json', JSON.stringify(exportJson, null, 2))

  for (const note of notes) {
    const filename = filenameForNote(note.importSource, note.id)
    zip.file(filename, note.contentMd)
    progress.packed++
    if (progress.packed % 20 === 0) {
      onProgress({ ...progress })
    }
  }

  onProgress({ ...progress })

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })

  progress.phase = 'done'
  onProgress({ ...progress })

  return blob
}

function filenameForNote(importSource: string | null, id: string): string {
  if (importSource) {
    return importSource.endsWith('.md') ? importSource : importSource + '.md'
  }
  return `${id}.md`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
