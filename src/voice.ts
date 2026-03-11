import { readFileSync, renameSync } from 'fs'
import { request } from 'https'
import { basename, dirname, join } from 'path'
import { GROQ_API_KEY } from './config.js'
import { logger } from './logger.js'

export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  return {
    stt: !!GROQ_API_KEY,
    tts: false,
  }
}

export async function transcribeAudio(filePath: string): Promise<string> {
  // Rename .oga to .ogg (Groq requirement — same format, different extension)
  if (filePath.endsWith('.oga')) {
    const newPath = filePath.replace(/\.oga$/, '.ogg')
    renameSync(filePath, newPath)
    filePath = newPath
  }

  const fileBuffer = readFileSync(filePath)
  const fileName = basename(filePath)
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)

  const parts: Buffer[] = []

  // file field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: audio/ogg\r\n\r\n`
  ))
  parts.push(fileBuffer)
  parts.push(Buffer.from('\r\n'))

  // model field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`
  ))

  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'api.groq.com',
        path: '/openai/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          try {
            const json = JSON.parse(raw)
            if (json.text) {
              resolve(json.text)
            } else {
              logger.error({ response: raw }, 'Groq STT: no text in response')
              reject(new Error('No transcript returned'))
            }
          } catch {
            logger.error({ response: raw }, 'Groq STT: invalid JSON')
            reject(new Error('Invalid response from Groq'))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
