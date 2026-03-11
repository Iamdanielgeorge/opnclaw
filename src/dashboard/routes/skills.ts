import { Router } from 'express'
import { scanSkills } from '../skills-scanner.js'
import { setSkillOverride } from '../../db.js'
import { eventBus } from '../events.js'

export function skillRoutes(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const skills = scanSkills()
    res.json(skills)
  })

  // Toggle skill enabled/disabled. Path sent in body since skill paths contain slashes.
  router.put('/toggle', (req, res) => {
    const { path: skillPath, enabled } = req.body
    if (!skillPath || typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'path (string) and enabled (boolean) are required' })
      return
    }
    setSkillOverride(skillPath, enabled)
    eventBus.activity('skill_toggled', `Skill "${skillPath}" ${enabled ? 'enabled' : 'disabled'}`)
    res.json({ ok: true, path: skillPath, enabled })
  })

  return router
}
