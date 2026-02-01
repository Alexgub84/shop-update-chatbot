import { WebhookError } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'
import type { GreenApiSender } from '../greenapi/sender.js'
import type { FlowController } from '../conversation/flow-controller.js'
import { incomingMessageSchema, extractMessageContent, type IncomingMessage, type ExtractedMessage } from './types.js'

export interface WebhookHandlerDeps {
  flowController: FlowController
  sender: GreenApiSender
  logger?: Logger
}

export interface WebhookHandlerResult {
  handled: boolean
  action?: 'flow_processed' | 'ignored_unsupported' | 'ignored_webhook_type'
}

export function createWebhookHandler(deps: WebhookHandlerDeps) {
  const { flowController, sender } = deps
  const logger = deps.logger ?? createNoopLogger()

  function parsePayload(body: unknown): IncomingMessage {
    const result = incomingMessageSchema.safeParse(body)
    if (!result.success) {
      const field = result.error.errors[0]?.path.join('.') ?? 'unknown'
      logger.error({ event: 'webhook_parse_error', error: result.error.message, field })
      throw new WebhookError(`Invalid webhook payload: ${result.error.message}`, field)
    }
    return result.data
  }

  async function handle(body: unknown): Promise<WebhookHandlerResult> {
    const payload = parsePayload(body)

    const extractedMessage = extractMessageContent(payload)

    logger.info({
      event: '>>> FIRST MSG RECEIVED <<<',
      phone: payload.senderData.chatId,
      messageId: payload.idMessage,
      typeWebhook: payload.typeWebhook,
      typeMessage: payload.messageData.typeMessage,
      extractedType: extractedMessage?.type,
      extractedContent: extractedMessage?.type === 'image' ? '[image]' : extractedMessage?.content
    })

    if (payload.typeWebhook !== 'incomingMessageReceived') {
      logger.warn({ event: 'ignored_webhook_type', typeWebhook: payload.typeWebhook })
      return { handled: false, action: 'ignored_webhook_type' }
    }

    if (extractedMessage === null) {
      logger.warn({
        event: 'ignored_unsupported',
        typeMessage: payload.messageData.typeMessage,
        chatId: payload.senderData.chatId
      })
      return { handled: false, action: 'ignored_unsupported' }
    }

    const chatId = payload.senderData.chatId
    const result = await flowController.process(chatId, extractedMessage)

    if (!result.handled) {
      logger.info({ event: 'flow_not_handled', chatId })
      return { handled: false, action: 'flow_processed' }
    }

    if (result.preMessage) {
      await sender.sendMessage(chatId, result.preMessage)
    }

    if (result.buttons) {
      await sender.sendButtons({
        chatId,
        body: result.buttons.body,
        buttons: result.buttons.options,
        header: result.buttons.header,
        footer: result.buttons.footer
      })
    } else if (result.response) {
      await sender.sendMessage(chatId, result.response)
    }

    logger.info({ event: 'flow_processed', chatId, handled: result.handled })
    return { handled: true, action: 'flow_processed' }
  }

  return { handle, parsePayload }
}

export type WebhookHandler = ReturnType<typeof createWebhookHandler>
