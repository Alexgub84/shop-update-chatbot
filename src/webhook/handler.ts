import { WebhookError } from '../errors.js'
import type { Logger } from '../logger.js'
import type { GreenApiSender } from '../greenapi/sender.js'
import type { FlowController } from '../conversation/flow-controller.js'
import { incomingMessageSchema, type IncomingMessage } from './types.js'

export interface WebhookHandlerDeps {
  flowController: FlowController
  sender: GreenApiSender
  logger: Logger
}

export interface WebhookHandlerResult {
  handled: boolean
  action?: 'flow_processed' | 'ignored_non_text' | 'ignored_webhook_type'
}

export function createWebhookHandler(deps: WebhookHandlerDeps) {
  const { flowController, sender, logger } = deps

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

    const messageContent = payload.messageData.textMessageData?.textMessage ?? null

    logger.info({
      event: 'webhook_received',
      chatId: payload.senderData.chatId,
      messageId: payload.idMessage,
      typeWebhook: payload.typeWebhook,
      messageContent
    })

    if (payload.typeWebhook !== 'incomingMessageReceived') {
      logger.warn({ event: 'ignored_webhook_type', typeWebhook: payload.typeWebhook })
      return { handled: false, action: 'ignored_webhook_type' }
    }

    if (payload.messageData.typeMessage !== 'textMessage') {
      logger.warn({
        event: 'ignored_non_text',
        typeMessage: payload.messageData.typeMessage,
        chatId: payload.senderData.chatId
      })
      return { handled: false, action: 'ignored_non_text' }
    }

    const chatId = payload.senderData.chatId
    const result = flowController.process(chatId, messageContent ?? '')

    if (!result.handled) {
      logger.info({ event: 'flow_not_handled', chatId })
      return { handled: false, action: 'flow_processed' }
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
