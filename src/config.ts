import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readEnvFile } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = readEnvFile()

export const PROJECT_ROOT = join(__dirname, '..')
export const STORE_DIR = join(PROJECT_ROOT, 'store')

// Platform
export const TELEGRAM_BOT_TOKEN = env['TELEGRAM_BOT_TOKEN'] ?? ''
export const ALLOWED_CHAT_ID = env['ALLOWED_CHAT_ID'] ?? ''
// Support multiple chat IDs (comma-separated in .env)
export const ALLOWED_CHAT_IDS = (env['ALLOWED_CHAT_ID'] ?? '').split(',').map(id => id.trim()).filter(Boolean)

// AI Provider: 'claude' (default) or 'openai'
export const AI_PROVIDER = (env['AI_PROVIDER'] ?? 'claude').toLowerCase() as 'claude' | 'openai'

// OpenAI
export const OPENAI_API_KEY = env['OPENAI_API_KEY'] ?? ''
export const OPENAI_MODEL = env['OPENAI_MODEL'] ?? 'codex-5.4'
export const OPENAI_MAX_TOKENS = parseInt(env['OPENAI_MAX_TOKENS'] ?? '4096', 10)

// Voice
export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? ''

// Video
export const GOOGLE_API_KEY = env['GOOGLE_API_KEY'] ?? ''

// ElevenLabs (placeholder for future TTS)
export const ELEVENLABS_API_KEY = env['ELEVENLABS_API_KEY'] ?? ''
export const ELEVENLABS_VOICE_ID = env['ELEVENLABS_VOICE_ID'] ?? ''

// Dashboard
export const DASHBOARD_ENABLED = (env['DASHBOARD_ENABLED'] ?? 'true').toLowerCase() !== 'false'
export const DASHBOARD_PORT = parseInt(env['DASHBOARD_PORT'] ?? '3333', 10)

// Limits
export const MAX_MESSAGE_LENGTH = 4096
export const TYPING_REFRESH_MS = 4000
