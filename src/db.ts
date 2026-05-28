import Dexie, { type EntityTable } from 'dexie'
import type { Note, Region, Edge } from '@/types'

const db = new Dexie('noted') as Dexie & {
  notes: EntityTable<Note, 'id'>
  regions: EntityTable<Region, 'id'>
  edges: EntityTable<Edge, 'id'>
}

db.version(1).stores({
  notes: 'id, regionId, kind, createdAt, updatedAt',
  regions: 'id, parentRegionId, createdAt',
  edges: 'id, srcNoteId, dstNoteId, type, status',
})

export { db }
