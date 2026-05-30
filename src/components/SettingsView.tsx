import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'

export function SettingsView() {
  const settings = useLiveQuery(() => db.settings.get('app'))
  const [localKey, setLocalKey] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)
  const [saved, setSaved] = useState(false)

  const apiKey = localKey ?? settings?.openaiApiKey ?? ''

  const handleSave = useCallback(async () => {
    await db.settings.put({ id: 'app', openaiApiKey: apiKey.trim() || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [apiKey])

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
      })
      setTestResult(res.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    }
    setTesting(false)
  }, [apiKey])

  const handleClear = useCallback(async () => {
    setLocalKey('')
    await db.settings.put({ id: 'app', openaiApiKey: null })
    setTestResult(null)
  }, [])

  const noteCount = useLiveQuery(() => db.notes.count()) ?? 0
  const embeddedCount = useLiveQuery(
    () => db.notes.filter(n => n.embedding !== null).count()
  ) ?? 0
  const edgeCount = useLiveQuery(() => db.edges.count()) ?? 0

  return (
    <div className="fade-in" style={{
      height: '100%', overflowY: 'auto', padding: 'var(--space-8)',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)',
          fontWeight: 400, color: 'var(--text-primary)',
          letterSpacing: '-0.02em', lineHeight: 1.1,
          marginBottom: 'var(--space-8)',
        }}>
          Settings
        </h2>

        {/* OpenAI API Key */}
        <section style={{
          padding: 'var(--space-6)', background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-6)',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
            fontWeight: 400, color: 'var(--text-primary)',
            marginBottom: 'var(--space-1)',
          }}>
            OpenAI API Key
          </h3>
          <p style={{
            fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
            lineHeight: 1.5, marginBottom: 'var(--space-4)',
          }}>
            Required for semantic search and automatic edge inference.
            Your key is stored locally and only sent to OpenAI's API.
          </p>

          <div style={{
            display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)',
          }}>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setLocalKey(e.target.value); setTestResult(null) }}
              placeholder="sk-..."
              style={{
                flex: 1, padding: 'var(--space-3) var(--space-4)',
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
              }}
            />
            <button onClick={handleTest} disabled={!apiKey.trim() || testing} style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              fontWeight: 500, color: 'var(--text-secondary)',
              opacity: !apiKey.trim() || testing ? 0.5 : 1,
              transition: 'opacity var(--duration-fast) ease',
            }}>
              {testing ? 'Testing...' : 'Test'}
            </button>
          </div>

          {testResult && (
            <p style={{
              fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
              color: testResult === 'success' ? 'var(--color-supports)' : 'var(--color-contradicts)',
              marginBottom: 'var(--space-3)',
            }}>
              {testResult === 'success' ? 'Connection successful' : 'Connection failed -- check your key'}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={handleSave} style={{
              padding: 'var(--space-2) var(--space-5)',
              background: 'var(--text-accent)', color: 'var(--bg-primary)',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              fontWeight: 600, transition: 'opacity var(--duration-fast) ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              {saved ? 'Saved' : 'Save key'}
            </button>
            {settings?.openaiApiKey && (
              <button onClick={handleClear} style={{
                padding: 'var(--space-2) var(--space-4)',
                fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
                transition: 'color var(--duration-fast) ease',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-contradicts)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}
              >
                Remove key
              </button>
            )}
          </div>
        </section>

        {/* Stats */}
        <section style={{
          padding: 'var(--space-6)', background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
        }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)',
            fontWeight: 400, color: 'var(--text-primary)',
            marginBottom: 'var(--space-4)',
          }}>
            Database
          </h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-4)',
          }}>
            <StatBlock label="Notes" value={noteCount} />
            <StatBlock label="Embedded" value={embeddedCount} />
            <StatBlock label="Edges" value={edgeCount} />
          </div>
        </section>
      </div>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
        color: 'var(--text-tertiary)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 'var(--space-1)',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)',
        fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1,
      }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}
