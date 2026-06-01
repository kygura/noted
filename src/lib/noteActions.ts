import { db } from '@/db'
import type { Note } from '@/types'

function compactRegionIds(notes: Note[]): string[] {
  return [...new Set(notes.map(n => n.regionId).filter((id): id is string => id !== null))]
}

async function pruneEmptyRegions(regionIds: string[]): Promise<void> {
  for (const regionId of regionIds) {
    const remaining = await db.notes.where('regionId').equals(regionId).count()
    if (remaining === 0) await db.regions.delete(regionId)
  }
}

async function pruneAllEmptyRegions(): Promise<void> {
  const regions = await db.regions.toArray()
  await pruneEmptyRegions(regions.map(region => region.id))
}

export async function archiveNotes(noteIds: string[], archived: boolean): Promise<void> {
  if (noteIds.length === 0) return
  await db.notes.where('id').anyOf(noteIds).modify({
    archivedAt: archived ? new Date().toISOString() : null,
  })
}

export async function toggleNoteArchive(note: Note): Promise<void> {
  await archiveNotes([note.id], note.archivedAt === null)
}

export async function deleteNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return
  const ids = new Set(noteIds)

  await db.transaction('rw', [db.notes, db.edges, db.regions], async () => {
    const notes = await db.notes.where('id').anyOf(noteIds).toArray()
    const regionIds = compactRegionIds(notes)

    await db.edges.filter(e => ids.has(e.srcNoteId) || ids.has(e.dstNoteId)).delete()
    await db.notes.where('id').anyOf(noteIds).delete()
    await pruneEmptyRegions(regionIds)
    await pruneAllEmptyRegions()
  })
}

export async function deleteNote(noteId: string): Promise<void> {
  await deleteNotes([noteId])
}
