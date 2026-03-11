import { describe, it, expect } from 'vitest'
import { formatForTelegram, splitMessage } from './bot.js'

describe('formatForTelegram', () => {
  it('converts bold markdown to HTML', () => {
    expect(formatForTelegram('**bold text**')).toContain('<b>bold text</b>')
  })

  it('converts italic markdown to HTML', () => {
    expect(formatForTelegram('*italic text*')).toContain('<i>italic text</i>')
  })

  it('converts inline code', () => {
    expect(formatForTelegram('use `npm install`')).toContain('<code>npm install</code>')
  })

  it('converts code blocks', () => {
    const result = formatForTelegram('```js\nconsole.log("hi")\n```')
    expect(result).toContain('<pre>')
    expect(result).toContain('console.log')
  })

  it('converts headings to bold', () => {
    expect(formatForTelegram('# Title')).toContain('<b>Title</b>')
    expect(formatForTelegram('### Subtitle')).toContain('<b>Subtitle</b>')
  })

  it('converts links', () => {
    expect(formatForTelegram('[Google](https://google.com)')).toContain('<a href="https://google.com">Google</a>')
  })

  it('converts strikethrough', () => {
    expect(formatForTelegram('~~deleted~~')).toContain('<s>deleted</s>')
  })

  it('converts checkboxes', () => {
    expect(formatForTelegram('- [ ] todo')).toContain('☐')
    expect(formatForTelegram('- [x] done')).toContain('☑')
  })

  it('strips horizontal rules', () => {
    expect(formatForTelegram('text\n---\nmore')).not.toContain('---')
  })

  it('escapes HTML entities in plain text', () => {
    const result = formatForTelegram('a < b & c > d')
    expect(result).toContain('&lt;')
    expect(result).toContain('&amp;')
  })

  it('preserves code block content from markdown processing', () => {
    const result = formatForTelegram('```\n**not bold**\n```')
    expect(result).toContain('**not bold**')
    expect(result).not.toContain('<b>not bold</b>')
  })
})

describe('splitMessage', () => {
  it('returns single chunk for short messages', () => {
    expect(splitMessage('hello')).toEqual(['hello'])
  })

  it('splits long messages on newlines', () => {
    const longText = Array(100).fill('This is a line of text').join('\n')
    const chunks = splitMessage(longText, 200)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200)
    }
  })

  it('handles text without newlines', () => {
    const longText = 'a'.repeat(500)
    const chunks = splitMessage(longText, 200)
    expect(chunks.length).toBeGreaterThan(1)
  })
})
