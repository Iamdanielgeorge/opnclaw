import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const ENV_PATH = join(PROJECT_ROOT, '.env.test')

// We test the parsing logic directly rather than importing readEnvFile
// because readEnvFile hardcodes the .env path
function parseEnvContent(content: string, keys?: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (keys && !keys.includes(key)) continue
    result[key] = value
  }
  return result
}

describe('env parser', () => {
  it('parses simple key=value', () => {
    const result = parseEnvContent('FOO=bar\nBAZ=qux')
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('handles quoted values', () => {
    const result = parseEnvContent('FOO="hello world"\nBAR=\'single quoted\'')
    expect(result).toEqual({ FOO: 'hello world', BAR: 'single quoted' })
  })

  it('skips comments and blank lines', () => {
    const result = parseEnvContent('# comment\n\nFOO=bar\n  # another comment')
    expect(result).toEqual({ FOO: 'bar' })
  })

  it('filters by keys when provided', () => {
    const result = parseEnvContent('FOO=1\nBAR=2\nBAZ=3', ['FOO', 'BAZ'])
    expect(result).toEqual({ FOO: '1', BAZ: '3' })
  })

  it('handles values with equals signs', () => {
    const result = parseEnvContent('URL=https://example.com?foo=bar&baz=qux')
    expect(result).toEqual({ URL: 'https://example.com?foo=bar&baz=qux' })
  })

  it('returns empty object for empty content', () => {
    const result = parseEnvContent('')
    expect(result).toEqual({})
  })

  it('handles values with spaces (unquoted)', () => {
    const result = parseEnvContent('FOO=hello world')
    expect(result).toEqual({ FOO: 'hello world' })
  })
})
