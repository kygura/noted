/** Strip common Markdown syntax to readable plain text. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`[^`]+`/g, m => m.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** First line of a note, with any heading marker removed. */
export function getTitle(md: string): string {
  return md.split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
}

/** A short, single-paragraph plain-text preview of a note. */
export function getPreview(md: string, maxLen = 220): string {
  const stripped = stripMarkdown(md)
  const lines = stripped.split('\n').filter(l => l.trim()).slice(0, 6)
  const text = lines.join(' ').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}
