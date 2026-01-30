import { z } from 'zod'
import { WebhookError } from '../errors.js'
import type { Logger } from '../logger.js'
import type { Messages } from '../messages.js'
import type { GreenApiSender } from '../greenapi/sender.js'
import { incomingMessageSchema, type IncomingMessage } from './types.js'

export interface WebhookHandlerDeps {
  triggerCode: string
  messages: Messages
  sender: GreenApiSender
  logger: Logger
}

export interface WebhookHandlerResult {
  handled: boolean
  action?: 'trigger_matched' | 'ignored_non_trigger' | 'ignored_non_text' | 'ignored_webhook_type'
}

export function createWebhookHandler(deps: WebhookHandlerDeps) {
  const { triggerCode, messages, sender, logger } = deps

  function parsePayload(body: unknown): IncomingMessage {
    const result = incomingMessageSchema.safeParse(body)
    if (!result.success) {
      const field = result.error.errors[0]?.path.join('.') ?? 'unknown'
      logger.error({ event: 'webhook_parse_error', error: result.error.message, field })
      throw new WebhookError(`Invalid webhook payload: ${result.error.message}`, field)
    }
    return result.data
  }

  function isTriggerMatch(text: string): boolean {
    return text.trim().toLowerCase() === triggerCode.toLowerCase()
  }

  async function handle(body: unknown): Promise<WebhookHandlerResult> {
    const payload = parsePayload(body)

    logger.info({
      event: 'webhook_received',
      chatId: payload.senderData.chatId,
      messageId: payload.idMessage,
      typeWebhook: payload.typeWebhook
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

    const text = payload.messageData.textMessageData?.textMessage ?? ''

    if (!isTriggerMatch(text)) {
      logger.info({
        event: 'ignored_non_trigger',
        chatId: payload.senderData.chatId
      })
      return { handled: false, action: 'ignored_non_trigger' }
    }

    logger.info({
      event: 'trigger_matched',
      chatId: payload.senderData.chatId
    })

    await sender.sendMessage(payload.senderData.chatId, messages.welcome)

    return { handled: true, action: 'trigger_matched' }
  }

  return { handle, parsePayload, isTriggerMatch }
}

export type WebhookHandler = ReturnType<typeof createWebhookHandler>
