import { loadConfig, type Config } from './config.js'
import { createLogger, type Logger } from './logger.js'
import { loadMessages, type Messages } from './messages.js'
import { createGreenApiSender, createMockSender, createFakeGreenApiSender, type GreenApiSender } from './greenapi/sender.js'
import { createWebhookHandler, type WebhookHandler } from './webhook/handler.js'
import { createInMemoryManager } from './conversation/memory.js'
import { createFlowController, type FlowController } from './conversation/flow-controller.js'
import type { FlowDefinition, MemoryManager } from './conversation/types.js'
import { createWooCommerceClient } from './woocommerce/client.js'
import type { WooCommerceClient } from './woocommerce/types.js'
import { createServer } from './server.js'
import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface AppDependencies {
  config: Config
  logger: Logger
  messages: Messages
  sender: GreenApiSender
  wooCommerce: WooCommerceClient
  memory: MemoryManager
  flowController: FlowController
  webhookHandler: WebhookHandler
}

export interface App {
  server: FastifyInstance
  dependencies: AppDependencies
}

function loadFlow(): FlowDefinition {
  const flowPath = join(__dirname, 'flows', 'inventory.json')
  const flowContent = readFileSync(flowPath, 'utf-8')
  return JSON.parse(flowContent) as FlowDefinition
}

export function createApp(): App {
  const config = loadConfig()
  const logger = createLogger('shop-update-chatbot')
  const messages = loadMessages()
  const flow = loadFlow()

  let sender: GreenApiSender
  if (config.fakeGreenApiMode) {
    sender = createFakeGreenApiSender(logger)
    logger.warn({ event: 'fake_greenapi_mode_enabled', mode: 'FAKE GreenAPI' })
  } else if (config.mockMode) {
    sender = createMockSender(logger)
    logger.warn({ event: 'mock_mode_enabled' })
  } else {
    sender = createGreenApiSender(config.greenApi, logger)
  }

  const wooCommerce = createWooCommerceClient(config.wooCommerce, logger)

  const memory = createInMemoryManager(config.sessionTimeoutMs)

  const flowController = createFlowController({
    memory,
    flow,
    messages,
    triggerCode: config.triggerCode,
    logger
  })

  const webhookHandler = createWebhookHandler({
    flowController,
    sender,
    logger
  })

  logger.info({ event: 'dependencies_loaded', messageKeys: Object.keys(messages), flowId: flow.id })

  const server = createServer(config, logger, webhookHandler)

  return {
    server,
    dependencies: { config, logger, messages, sender, wooCommerce, memory, flowController, webhookHandler }
  }
}
