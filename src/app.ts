import { loadConfig, type Config } from './config.js'
import { createLogger, type Logger } from './logger.js'
import { loadMessages, type Messages } from './messages.js'
import { createGreenApiSender, createMockSender, type GreenApiSender } from './greenapi/sender.js'
import { createWebhookHandler, type WebhookHandler } from './webhook/handler.js'
import { createServer } from './server.js'
import type { FastifyInstance } from 'fastify'

export interface AppDependencies {
  config: Config
  logger: Logger
  messages: Messages
  sender: GreenApiSender
  webhookHandler: WebhookHandler
}

export interface App {
  server: FastifyInstance
  dependencies: AppDependencies
}

export function createApp(): App {
  const config = loadConfig()
  const logger = createLogger('shop-update-chatbot')
  const messages = loadMessages()

  const sender = config.mockMode
    ? createMockSender(logger)
    : createGreenApiSender(config.greenApi, logger)

  if (config.mockMode) {
    logger.warn({ event: 'mock_mode_enabled' })
  }

  const webhookHandler = createWebhookHandler({
    triggerCode: config.triggerCode,
    messages,
    sender,
    logger
  })

  logger.info({ event: 'dependencies_loaded', messageKeys: Object.keys(messages) })

  const server = createServer(config, logger, webhookHandler)

  return {
    server,
    dependencies: { config, logger, messages, sender, webhookHandler }
  }
}
