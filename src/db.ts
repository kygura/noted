import Dexie, { type EntityTable } from 'dexie'
import type { Note, Region, Edge, AppSettings } from '@/types'

const db = new Dexie('noted') as Dexie & {
  notes: EntityTable<Note, 'id'>
  regions: EntityTable<Region, 'id'>
  edges: EntityTable<Edge, 'id'>
  settings: EntityTable<AppSettings, 'id'>
}

db.version(1).stores({
  notes: 'id, regionId, kind, createdAt, updatedAt',
  regions: 'id, parentRegionId, createdAt',
  edges: 'id, srcNoteId, dstNoteId, type, status',
})

db.version(2).stores({
  notes: 'id, regionId, kind, archivedAt, createdAt, updatedAt',
  regions: 'id, parentRegionId, createdAt',
  edges: 'id, srcNoteId, dstNoteId, type, status',
  settings: 'id',
}).upgrade(tx => {
  return tx.table('notes').toCollection().modify(note => {
    if (note.archivedAt === undefined) note.archivedAt = null
    if (note.embedding === undefined) note.embedding = null
    if (note.contentHash === undefined) note.contentHash = null
  })
})

export { db }
