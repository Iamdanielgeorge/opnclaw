import { writeFileSync, readdirSync, unlinkSync, statSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { request as httpsRequest } from 'https'
import { PROJECT_ROOT, TELEGRAM_BOT_TOKEN } from './config.js'
import { logger } from './logger.js'

export const UPLOADS_DIR = join(PROJECT_ROOT, 'workspace', 'uploads')

function ensureUploadsDir(): void {
  mkdirSync(UPLOADS_DIR, { recursive: true })
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    httpsRequest(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve, reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject).end()
  })
}

export async function downloadMedia(fileId: string, originalFilename?: string): Promise<string> {
  ensureUploadsDir()

  // Get file path from Telegram
  const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  const infoBuffer = await httpsGet(fileInfoUrl)
  const info = JSON.parse(infoBuffer.toString())

  if (!info.ok || !info.result?.file_path) {
    throw new Error(`Failed to get file info: ${JSON.stringify(info)}`)
  }

  const remotePath: string = info.result.file_path
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${remotePath}`
  const data = await httpsGet(downloadUrl)

  const filename = originalFilename
    ? sanitizeFilename(originalFilename)
    : sanitizeFilename(basename(remotePath))
  const localPath = join(UPLOADS_DIR, `${Date.now()}_${filename}`)

  writeFileSync(localPath, data)
  logger.debug({ localPath, size: data.length }, 'Downloaded media file')
  return localPath
}

export function buildPhotoMessage(localPath: string, caption?: string): string {
  const parts = [`[Photo attached: ${localPath}]`]
  if (caption) parts.push(caption)
  parts.push('Please analyze this image.')
  return parts.join('\n')
}

export function buildDocumentMessage(localPath: string, filename: string, caption?: string): string {
  const parts = [`[Document attached: ${localPath}] (filename: ${filename})`]
  if (caption) parts.push(caption)
  parts.push('Please review this document.')
  return parts.join('\n')
}

export function buildVideoMessage(localPath: string, caption?: string): string {
  const parts = [`[Video attached: ${localPath}]`]
  if (caption) parts.push(caption)
  parts.push(
    'Analyze this video. Use the GOOGLE_API_KEY from .env to call the Gemini API for video analysis.'
  )
  return parts.join('\n')
}

export function cleanupOldUploads(maxAgeMs = 24 * 60 * 60 * 1000): void {
  ensureUploadsDir()
  const now = Date.now()
  let cleaned = 0

  try {
    for (const file of readdirSync(UPLOADS_DIR)) {
      const fullPath = join(UPLOADS_DIR, file)
      try {
        const stat = statSync(fullPath)
        if (now - stat.mtimeMs > maxAgeMs) {
          unlinkSync(fullPath)
          cleaned++
        }
      } catch {
        // skip files we can't stat
      }
    }
  } catch {
    // uploads dir might not exist yet
  }

  if (cleaned > 0) {
    logger.info({ cleaned }, 'Cleaned up old uploads')
  }
}
