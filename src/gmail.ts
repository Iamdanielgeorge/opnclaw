/**
 * Gmail Service
 * Send and receive emails via Gmail SMTP/IMAP
 */

import nodemailer from 'nodemailer'
import { logger } from './logger.js'

const GMAIL_ADDRESS = process.env.GMAIL_ADDRESS || ''
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || ''

// SMTP transporter for sending
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_ADDRESS,
    pass: GMAIL_APP_PASSWORD,
  },
})

export interface Email {
  from: string
  to: string
  subject: string
  body: string
  date?: Date
  messageId?: string
}

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: GMAIL_ADDRESS,
      to,
      subject,
      text: body,
    })
    logger.info({ to, subject }, 'Email sent')
    return true
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email')
    return false
  }
}

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    await transporter.verify()
    logger.info('Gmail SMTP connection verified')
    return true
  } catch (err) {
    logger.error({ err }, 'Gmail SMTP connection failed')
    return false
  }
}
