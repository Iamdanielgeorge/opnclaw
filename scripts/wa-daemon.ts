import { Client, LocalAuth, Message } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, saveWaIncoming, getPendingWaMessages, markWaMessageSent, markWaMessageFailed } from '../src/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

console.log('WhatsApp Daemon starting...')

// Initialize database (shares the same SQLite DB)
initDatabase()

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: join(PROJECT_ROOT, 'store', 'wa-session'),
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

// QR code for first-time auth
client.on('qr', (qr: string) => {
  console.log('\nScan this QR code with WhatsApp on your phone:\n')
  qrcode.generate(qr, { small: true })
  console.log('\nOpen WhatsApp > Settings > Linked Devices > Link a Device\n')
})

client.on('ready', () => {
  console.log('WhatsApp client ready')
  // Start outbox polling
  setInterval(processOutbox, 5000)
})

client.on('authenticated', () => {
  console.log('WhatsApp authenticated')
})

client.on('auth_failure', (msg: string) => {
  console.error('WhatsApp auth failed:', msg)
  process.exit(1)
})

client.on('disconnected', (reason: string) => {
  console.log('WhatsApp disconnected:', reason)
  process.exit(1)
})

// Incoming messages
client.on('message', async (msg: Message) => {
  if (msg.fromMe) return

  const jid = msg.from
  const sender = msg.author || msg.from
  const body = msg.body || '(media)'
  const timestamp = msg.timestamp

  saveWaIncoming(msg.id.id, jid, sender, body, timestamp)
  console.log(`Incoming: ${sender} -> ${body.slice(0, 50)}`)
})

// Process outbox — send queued messages
async function processOutbox(): Promise<void> {
  const pending = getPendingWaMessages()
  for (const msg of pending) {
    try {
      await client.sendMessage(msg.jid, msg.body)
      markWaMessageSent(msg.id)
      console.log(`Sent to ${msg.jid}: ${msg.body.slice(0, 50)}`)
    } catch (err) {
      console.error(`Failed to send to ${msg.jid}:`, err)
      markWaMessageFailed(msg.id)
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down WhatsApp daemon...')
  await client.destroy()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await client.destroy()
  process.exit(0)
})

// Start
client.initialize().catch((err: Error) => {
  console.error('Failed to initialize WhatsApp client:', err)
  process.exit(1)
})
