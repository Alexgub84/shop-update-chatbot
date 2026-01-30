import pino from 'pino'

export type Logger = pino.Logger

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level: (label) => ({ level: label })
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['*.token', '*.apiKey', '*.secret', '*.password'],
      censor: '[REDACTED]'
    }
  })
}

export const logger = createLogger('shop-update-chatbot')
