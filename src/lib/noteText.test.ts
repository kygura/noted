import { describe, it, expect } from 'vitest'
import { getTitle, getPreview, stripMarkdown } from '@/lib/noteText'

describe('getTitle', () => {
  it('takes the first line and strips heading marks', () => {
    expect(getTitle('# Hello\nworld')).toBe('Hello')
  })
  it('returns the first line verbatim when there is no heading', () => {
    expect(getTitle('plain text\nmore')).toBe('plain text')
  })
})

describe('stripMarkdown', () => {
  it('removes emphasis and inline code markers', () => {
    expect(stripMarkdown('**bold** and `code`')).toBe('bold and code')
  })
  it('unwraps links to their text', () => {
    expect(stripMarkdown('see [the docs](https://x.y)')).toBe('see the docs')
  })
})

describe('getPreview', () => {
  it('includes body text with whitespace collapsed', () => {
    expect(getPreview('# Title\n\nSome body text here', 100)).toContain('Some body text')
  })
  it('truncates long text with an ellipsis', () => {
    const long = 'word '.repeat(200)
    const p = getPreview(long, 50)
    expect(p.length).toBeLessThanOrEqual(51)
    expect(p.endsWith('…')).toBe(true)
  })
})
