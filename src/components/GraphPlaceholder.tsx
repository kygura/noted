export function GraphPlaceholder() {
  return (
    <div className="fade-in" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative constellation dots */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.06 }}>
        {Array.from({ length: 24 }, (_, i) => {
          const x = 10 + (i * 37) % 85
          const y = 8 + (i * 53) % 82
          const size = 2 + (i % 3)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'currentColor',
              }}
            />
          )
        })}
        {/* Connecting lines */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line x1="15" y1="20" x2="40" y2="35" stroke="currentColor" strokeWidth="0.15" />
          <line x1="40" y1="35" x2="65" y2="25" stroke="currentColor" strokeWidth="0.15" />
          <line x1="65" y1="25" x2="80" y2="50" stroke="currentColor" strokeWidth="0.15" />
          <line x1="25" y1="60" x2="50" y2="70" stroke="currentColor" strokeWidth="0.15" />
          <line x1="50" y1="70" x2="75" y2="65" stroke="currentColor" strokeWidth="0.15" />
          <line x1="40" y1="35" x2="50" y2="70" stroke="currentColor" strokeWidth="0.1" />
        </svg>
      </div>

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--text-secondary)',
          fontWeight: 300,
          fontStyle: 'italic',
          marginBottom: 'var(--space-3)',
        }}>
          The graph is empty
        </p>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
          maxWidth: 320,
          lineHeight: 1.6,
        }}>
          As you write, notes will form constellations of meaning.
          Connections emerge from the ideas themselves.
        </p>
      </div>
    </div>
  )
}
