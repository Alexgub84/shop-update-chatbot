import { pino, Logger } from 'pino'

export type { Logger }

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level: (label: string) => ({ level: label })
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['*.token', '*.apiKey', '*.secret', '*.password'],
      censor: '[REDACTED]'
    }
  })
}

export const logger = createLogger('shop-update-chatbot')
