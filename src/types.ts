export interface Note {
  id: string
  regionId: string | null
  kind: 'thought' | 'source'
  contentMd: string
  style: string | null
  intent: string | null
  completionState: string | null
  domain: string | null
  graphX: number
  graphY: number
  placementRationale: string | null
  revisionCount: number
  importSource: string | null
  archivedAt: string | null
  embedding: number[] | null
  contentHash: string | null
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  id: 'app'
  openaiApiKey: string | null
}

export interface Region {
  id: string
  parentRegionId: string | null
  name: string
  rationale: string
  source: 'agent' | 'user'
  createdAt: string
  renamedAt: string | null
}

export type EdgeType = 'supports' | 'contradicts' | 'elaborates' | 'references' | 'relates-to'
export type EdgeSource = 'user' | 'agent' | 'import'
export type EdgeStatus = 'draft' | 'approved' | 'rejected'

export interface Edge {
  id: string
  srcNoteId: string
  dstNoteId: string
  type: EdgeType
  source: EdgeSource
  status: EdgeStatus
  rationale: string
  createdAt: string
}
