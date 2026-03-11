import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { PROJECT_ROOT } from '../config.js'
import { getSkillOverrides } from '../db.js'

export interface SkillInfo {
  path: string
  name: string
  description: string
  source: 'user' | 'project'
  enabled: boolean
}

function parseSkillFile(filePath: string): { name: string; description: string } {
  const content = readFileSync(filePath, 'utf-8')
  let name = ''
  let description = ''

  // Try frontmatter-style parsing (name: / description: lines)
  const nameMatch = content.match(/^name:\s*(.+)$/m)
  const descMatch = content.match(/^description:\s*(.+)$/m)

  if (nameMatch) name = nameMatch[1].trim()
  if (descMatch) description = descMatch[1].trim()

  // Fallback: use filename without extension
  if (!name) {
    const parts = filePath.replace(/\\/g, '/').split('/')
    name = parts[parts.length - 1].replace(/\.md$/, '')
  }

  // Fallback: first non-empty, non-frontmatter line
  if (!description) {
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('name:') && !trimmed.startsWith('description:') && !trimmed.startsWith('#')) {
        description = trimmed.slice(0, 120)
        break
      }
    }
  }

  return { name, description }
}

function scanDirectory(dir: string, source: 'user' | 'project'): Array<{ path: string; name: string; description: string; source: 'user' | 'project' }> {
  if (!existsSync(dir)) return []

  const results: Array<{ path: string; name: string; description: string; source: 'user' | 'project' }> = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const parsed = parseSkillFile(fullPath)
        results.push({ path: fullPath, ...parsed, source })
      } else if (entry.isDirectory()) {
        // Check for SKILL.md inside subdirectory
        const skillFile = join(fullPath, 'SKILL.md')
        if (existsSync(skillFile)) {
          const parsed = parseSkillFile(skillFile)
          results.push({ path: skillFile, ...parsed, source })
        }
      }
    }
  } catch {
    // ignore
  }

  return results
}

export function scanSkills(): SkillInfo[] {
  const userSkillsDir = join(homedir(), '.claude', 'skills')
  const projectSkillsDir = resolve(PROJECT_ROOT, '.claude', 'skills')

  const userSkills = scanDirectory(userSkillsDir, 'user')
  const projectSkills = scanDirectory(projectSkillsDir, 'project')

  const all = [...userSkills, ...projectSkills]
  const overrides = getSkillOverrides()
  const overrideMap = new Map(overrides.map(o => [o.skill_path, o.enabled === 1]))

  return all.map(s => ({
    ...s,
    enabled: overrideMap.get(s.path) ?? true,
  }))
}
