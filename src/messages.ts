import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MessagesError } from './errors.js'
import { logger } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export type Messages = Record<string, string>

export function loadMessages(filePath?: string): Messages {
  const path = filePath ?? join(__dirname, 'messages', 'en.json')
  
  try {
    const content = readFileSync(path, 'utf-8')
    const messages = JSON.parse(content) as Messages
    logger.info({ event: 'messages_loaded', path, count: Object.keys(messages).length })
    return messages
  } catch (err) {
    logger.error({ event: 'messages_load_failed', path, error: err })
    throw new MessagesError(`Failed to load messages from ${path}`, undefined)
  }
}

export function getMessage(messages: Messages, key: string): string {
  const message = messages[key]
  if (message === undefined) {
    logger.error({ event: 'message_key_not_found', key })
    throw new MessagesError(`Message key not found: ${key}`, key)
  }
  return message
}
