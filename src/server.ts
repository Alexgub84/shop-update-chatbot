import Fastify from 'fastify'
import type { Config } from './config.js'
import { createNoopLogger, type Logger } from './logger.js'
import type { WebhookHandler } from './webhook/handler.js'

export function createServer(config: Config, logger: Logger | undefined, webhookHandler: WebhookHandler) {
  const log = logger ?? createNoopLogger()
  const server = Fastify({
    logger: logger ? {
      level: config.logLevel,
      formatters: {
        level: (label) => ({ level: label })
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`
    } : false
  })

  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  server.post('/webhook', async (request, reply) => {
    try {
      const result = await webhookHandler.handle(request.body)
      return { ok: true, ...result }
    } catch (err) {
      log.error({ event: 'webhook_error', error: err })
      return reply.status(200).send({ ok: false, error: 'Processing failed' })
    }
  })

  return server
}
