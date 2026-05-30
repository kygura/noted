import { useCallback, useRef, useState } from 'react'
import { importFiles, type ImportProgress } from '@/lib/importer'
import { exportAll, downloadBlob, type ExportProgress } from '@/lib/exporter'

interface ImportExportViewProps {
  onDone?: () => void
}

export function ImportExportView({ onDone }: ImportExportViewProps) {
  const [mode, setMode] = useState<'idle' | 'importing' | 'exporting'>('idle')
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setMode('importing')
    setError(null)
    setImportProgress(null)
    try {
      await importFiles(files, setImportProgress)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const items = e.dataTransfer.items
    if (!items) return
    const filePromises: Promise<File[]>[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        filePromises.push(readEntryRecursive(entry))
      } else {
        const file = item.getAsFile()
        if (file) filePromises.push(Promise.resolve([file]))
      }
    }
    Promise.all(filePromises).then(results => {
      handleFiles(results.flat())
    })
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) handleFiles(Array.from(files))
  }, [handleFiles])

  const handleExport = useCallback(async () => {
    setMode('exporting')
    setError(null)
    setExportProgress(null)
    try {
      const blob = await exportAll(setExportProgress)
      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `noted-export-${date}.zip`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }, [])

  const handleReset = useCallback(() => {
    setMode('idle')
    setImportProgress(null)
    setExportProgress(null)
    setError(null)
  }, [])

  return (
    <div className="fade-in" style={{
      height: '100%',
      overflowY: 'auto',
      padding: 'var(--space-8)',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
            Import & Export
          </h2>
          <p style={{
            marginTop: 'var(--space-2)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)',
            lineHeight: 1.6,
          }}>
            Bring in your Obsidian vaults, markdown folders, or previous Noted exports.
          </p>
        </div>

        {mode === 'idle' && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? 'var(--text-accent)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-16) var(--space-8)',
                textAlign: 'center',
                background: dragOver ? 'var(--selection-bg)' : 'var(--bg-surface)',
                transition: 'all var(--duration-normal) var(--ease-out)',
                cursor: 'pointer',
                marginBottom: 'var(--space-4)',
              }}
              onClick={() => folderInputRef.current?.click()}
            >
              <div style={{
                marginBottom: 'var(--space-4)',
                opacity: 0.2,
              }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 38V14a2 2 0 0 1 2-2h12l4 4h20a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                  <line x1="24" y1="22" x2="24" y2="34" />
                  <polyline points="18 28 24 22 30 28" />
                </svg>
              </div>
              <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-xl)',
                color: dragOver ? 'var(--text-accent)' : 'var(--text-secondary)',
                fontWeight: 400,
                marginBottom: 'var(--space-2)',
                transition: 'color var(--duration-fast) ease',
              }}>
                {dragOver ? 'Drop to import' : 'Drop a folder or files here'}
              </p>
              <p style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-tertiary)',
                lineHeight: 1.5,
              }}>
                Supports nested folders, Obsidian vaults, and <code style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  background: 'var(--bg-elevated)',
                  padding: '0.1em 0.35em',
                  borderRadius: 'var(--radius-sm)',
                }}>noted-export.json</code> restores
              </p>
            </div>

            {/* Picker buttons */}
            <div style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-8)',
            }}>
              <button
                onClick={() => folderInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  transition: 'all var(--duration-fast) ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                Choose folder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  transition: 'all var(--duration-fast) ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                Choose files
              </button>
            </div>

            {/* Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              margin: 'var(--space-4) 0 var(--space-8)',
            }}>
              <div style={{ flex: 1, borderTop: '1px solid var(--border-subtle)' }} />
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>or</span>
              <div style={{ flex: 1, borderTop: '1px solid var(--border-subtle)' }} />
            </div>

            {/* Export section */}
            <div style={{
              padding: 'var(--space-6)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-xl)',
                    fontWeight: 400,
                    color: 'var(--text-primary)',
                    marginBottom: 'var(--space-1)',
                  }}>
                    Export everything
                  </h3>
                  <p style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-tertiary)',
                    lineHeight: 1.5,
                  }}>
                    Download all notes as markdown files with metadata sidecar.
                  </p>
                </div>
                <button
                  onClick={handleExport}
                  style={{
                    padding: 'var(--space-3) var(--space-5)',
                    background: 'var(--text-accent)',
                    color: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    transition: 'opacity var(--duration-fast) ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                >
                  Export .zip
                </button>
              </div>
            </div>
          </>
        )}

        {/* Import progress */}
        {mode === 'importing' && importProgress && (
          <ImportProgressCard
            progress={importProgress}
            error={error}
            onDone={() => { handleReset(); onDone?.() }}
          />
        )}

        {/* Export progress */}
        {mode === 'exporting' && exportProgress && (
          <ExportProgressCard
            progress={exportProgress}
            error={error}
            onDone={handleReset}
          />
        )}

        {/* Error without progress */}
        {error && !importProgress && !exportProgress && (
          <div style={{
            padding: 'var(--space-5)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--color-contradicts)',
            borderRadius: 'var(--radius-lg)',
            marginTop: 'var(--space-4)',
          }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-contradicts)' }}>{error}</p>
            <button
              onClick={handleReset}
              style={{
                marginTop: 'var(--space-3)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-accent)',
                textDecoration: 'underline',
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.json"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  )
}

function ImportProgressCard({ progress, error, onDone }: {
  progress: ImportProgress
  error: string | null
  onDone: () => void
}) {
  const isDone = progress.phase === 'done'
  const pct = progress.filesFound > 0
    ? Math.round((progress.filesIngested / progress.filesFound) * 100)
    : 0

  const folders = Array.from(progress.folderMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  return (
    <div className="fade-in" style={{
      padding: 'var(--space-6)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-4)',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 400,
          color: 'var(--text-primary)',
        }}>
          {progress.hasExportJson ? 'Restoring from export' : 'Importing'}
        </h3>
        {isDone && (
          <span style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-supports)',
            fontWeight: 500,
          }}>
            complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4,
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{
          height: '100%',
          width: `${isDone ? 100 : pct}%`,
          background: isDone ? 'var(--color-supports)' : 'var(--text-accent)',
          borderRadius: 'var(--radius-full)',
          transition: 'width var(--duration-normal) var(--ease-out)',
        }} />
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}>
        <StatBlock label="Found" value={progress.filesFound} />
        <StatBlock label="Ingested" value={progress.filesIngested} />
        <StatBlock label="Skipped" value={progress.skipped} />
      </div>

      {/* Folder breakdown */}
      {folders.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 'var(--space-2)',
          }}>
            Folders
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}>
            {folders.map(([folder, count]) => (
              <span key={folder} style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                padding: '0.2em 0.6em',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-mono)',
              }}>
                {folder} <span style={{ opacity: 0.5 }}>({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-contradicts)',
          marginBottom: 'var(--space-3)',
        }}>
          {error}
        </p>
      )}

      {isDone && (
        <button
          onClick={onDone}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            background: 'var(--text-accent)',
            color: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            transition: 'opacity var(--duration-fast) ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          View notes
        </button>
      )}
    </div>
  )
}

function ExportProgressCard({ progress, error, onDone }: {
  progress: ExportProgress
  error: string | null
  onDone: () => void
}) {
  const isDone = progress.phase === 'done'
  const pct = progress.total > 0
    ? Math.round((progress.packed / progress.total) * 100)
    : 0

  return (
    <div className="fade-in" style={{
      padding: 'var(--space-6)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-4)',
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 400,
          color: 'var(--text-primary)',
        }}>
          Exporting
        </h3>
        {isDone && (
          <span style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-supports)',
            fontWeight: 500,
          }}>
            downloaded
          </span>
        )}
      </div>

      <div style={{
        height: 4,
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{
          height: '100%',
          width: `${isDone ? 100 : pct}%`,
          background: isDone ? 'var(--color-supports)' : 'var(--text-accent)',
          borderRadius: 'var(--radius-full)',
          transition: 'width var(--duration-normal) var(--ease-out)',
        }} />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}>
        <StatBlock label="Total" value={progress.total} />
        <StatBlock label="Packed" value={progress.packed} />
      </div>

      {error && (
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-contradicts)',
          marginBottom: 'var(--space-3)',
        }}>
          {error}
        </p>
      )}

      {isDone && (
        <button
          onClick={onDone}
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)',
            textDecoration: 'underline',
          }}
        >
          Done
        </button>
      )}
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 'var(--space-1)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-2xl)',
        fontWeight: 400,
        color: 'var(--text-primary)',
        lineHeight: 1,
      }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

async function readEntryRecursive(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(
        f => {
          Object.defineProperty(f, 'webkitRelativePath', {
            value: entry.fullPath.replace(/^\//, ''),
            writable: false,
          })
          resolve([f])
        },
        reject,
      )
    })
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const results: FileSystemEntry[] = []
      function readBatch() {
        dirReader.readEntries(batch => {
          if (batch.length === 0) {
            resolve(results)
          } else {
            results.push(...batch)
            readBatch()
          }
        }, reject)
      }
      readBatch()
    })
    const nested = await Promise.all(entries.map(e => readEntryRecursive(e)))
    return nested.flat()
  }
  return []
}
