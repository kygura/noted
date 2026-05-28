export function ReviewPlaceholder() {
  return (
    <div className="fade-in" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-8)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--text-secondary)',
          fontWeight: 300,
          fontStyle: 'italic',
          marginBottom: 'var(--space-3)',
        }}>
          Nothing to review
        </p>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          maxWidth: 300,
          lineHeight: 1.6,
        }}>
          Draft edges, lint findings, and imported backlinks
          will surface here for your approval.
        </p>
      </div>
    </div>
  )
}
