import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebhookHandler } from '../../src/webhook/handler.js'
import { WebhookError } from '../../src/errors.js'
import {
  createMockSender,
  createMockLogger,
  createValidWebhookPayload,
  createImageWebhookPayload
} from '../mocks/greenapi.js'

describe('WebhookHandler', () => {
  const triggerCode = 'test-shop'
  const messages = { welcome: 'Welcome to the shop inventory update bot' }

  let mockSender: ReturnType<typeof createMockSender>
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(() => {
    mockSender = createMockSender()
    mockLogger = createMockLogger()
  })

  function createHandler() {
    return createWebhookHandler({
      triggerCode,
      messages,
      sender: mockSender,
      logger: mockLogger
    })
  }

  describe('handle', () => {
    describe('trigger matching', () => {
      it('should respond with welcome when message equals trigger code', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(result.action).toBe('trigger_matched')
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'Welcome to the shop inventory update bot'
        )
      })

      it('should match trigger case-insensitively', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('TEST-SHOP')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockSender.sendMessage).toHaveBeenCalled()
      })

      it('should match trigger with leading/trailing whitespace', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('  test-shop  ')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockSender.sendMessage).toHaveBeenCalled()
      })

      it('should not respond when message does not match trigger', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('hello world')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(result.action).toBe('ignored_non_trigger')
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
      })

      it('should not respond to partial trigger match', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop hello')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
      })
    })

    describe('non-text messages', () => {
      it('should ignore image messages and not respond', async () => {
        const handler = createHandler()
        const payload = createImageWebhookPayload()

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(result.action).toBe('ignored_non_text')
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
      })

      it('should log warning for non-text messages', async () => {
        const handler = createHandler()
        const payload = createImageWebhookPayload()

        await handler.handle(payload)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'ignored_non_text',
            typeMessage: 'imageMessage'
          })
        )
      })
    })

    describe('webhook types', () => {
      it('should ignore non-incomingMessageReceived webhooks', async () => {
        const handler = createHandler()
        const payload = {
          ...createValidWebhookPayload('test-shop'),
          typeWebhook: 'outgoingMessageReceived'
        }

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(result.action).toBe('ignored_webhook_type')
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
      })
    })

    describe('invalid payloads', () => {
      it('should throw WebhookError for missing chatId', async () => {
        const handler = createHandler()
        const payload = {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: 'test' },
          senderData: { sender: 'test' },
          messageData: { typeMessage: 'textMessage' },
          idMessage: 'ABC'
        }

        await expect(handler.handle(payload)).rejects.toThrow(WebhookError)
      })

      it('should throw WebhookError for missing idMessage', async () => {
        const handler = createHandler()
        const payload = {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: 'test' },
          senderData: { chatId: 'test@c.us', sender: 'test' },
          messageData: { typeMessage: 'textMessage' }
        }

        await expect(handler.handle(payload)).rejects.toThrow(WebhookError)
      })

      it('should include field name in WebhookError', async () => {
        const handler = createHandler()
        const payload = { invalid: 'data' }

        try {
          await handler.handle(payload)
          expect.fail('Should have thrown')
        } catch (err) {
          expect(err).toBeInstanceOf(WebhookError)
          expect((err as WebhookError).field).toBeDefined()
        }
      })

      it('should log parse error', async () => {
        const handler = createHandler()

        try {
          await handler.handle({ invalid: 'data' })
        } catch {}

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'webhook_parse_error' })
        )
      })
    })

    describe('logging', () => {
      it('should log webhook received event', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'webhook_received',
            chatId: '987654321@c.us',
            messageId: 'ABC123'
          })
        )
      })

      it('should log trigger matched event', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'trigger_matched',
            chatId: '987654321@c.us'
          })
        )
      })

      it('should log ignored non-trigger event', async () => {
        const handler = createHandler()
        const payload = createValidWebhookPayload('random message')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'ignored_non_trigger',
            chatId: '987654321@c.us'
          })
        )
      })
    })
  })

  describe('isTriggerMatch', () => {
    it('should return true for exact match', () => {
      const handler = createHandler()

      expect(handler.isTriggerMatch('test-shop')).toBe(true)
    })

    it('should return true for case-insensitive match', () => {
      const handler = createHandler()

      expect(handler.isTriggerMatch('TEST-SHOP')).toBe(true)
      expect(handler.isTriggerMatch('Test-Shop')).toBe(true)
    })

    it('should return true with whitespace trimmed', () => {
      const handler = createHandler()

      expect(handler.isTriggerMatch('  test-shop  ')).toBe(true)
      expect(handler.isTriggerMatch('\ntest-shop\t')).toBe(true)
    })

    it('should return false for non-matching text', () => {
      const handler = createHandler()

      expect(handler.isTriggerMatch('hello')).toBe(false)
      expect(handler.isTriggerMatch('test-shop extra')).toBe(false)
      expect(handler.isTriggerMatch('')).toBe(false)
    })
  })

  describe('no trigger code (respond to all messages)', () => {
    function createHandlerWithoutTrigger() {
      return createWebhookHandler({
        triggerCode: undefined,
        messages,
        sender: mockSender,
        logger: mockLogger
      })
    }

    it('should respond to any text message when no trigger code set', async () => {
      const handler = createHandlerWithoutTrigger()
      const payload = createValidWebhookPayload('any random message')

      const result = await handler.handle(payload)

      expect(result.handled).toBe(true)
      expect(result.action).toBe('trigger_matched')
      expect(mockSender.sendMessage).toHaveBeenCalled()
    })

    it('should respond to empty message when no trigger code set', async () => {
      const handler = createHandlerWithoutTrigger()
      const payload = createValidWebhookPayload('')

      const result = await handler.handle(payload)

      expect(result.handled).toBe(true)
      expect(mockSender.sendMessage).toHaveBeenCalled()
    })

    it('isTriggerMatch should return true for any text when no trigger code', () => {
      const handler = createHandlerWithoutTrigger()

      expect(handler.isTriggerMatch('anything')).toBe(true)
      expect(handler.isTriggerMatch('')).toBe(true)
      expect(handler.isTriggerMatch('test-shop')).toBe(true)
    })
  })
})
