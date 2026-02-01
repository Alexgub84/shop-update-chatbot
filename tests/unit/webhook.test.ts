import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebhookHandler } from '../../src/webhook/handler.js'
import { WebhookError } from '../../src/errors.js'
import type { FlowController } from '../../src/conversation/flow-controller.js'
import type { FlowResult } from '../../src/conversation/types.js'
import {
  createMockSender,
  createMockLogger,
  createValidWebhookPayload,
  createImageWebhookPayload,
  createButtonsResponsePayload,
  createInteractiveButtonsResponsePayload,
  createTemplateButtonReplyPayload
} from '../mocks/greenapi.js'

describe('WebhookHandler', () => {
  let mockSender: ReturnType<typeof createMockSender>
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockFlowController: FlowController

  beforeEach(() => {
    mockSender = createMockSender()
    mockLogger = createMockLogger()
    mockFlowController = {
      process: vi.fn()
    }
  })

  function createHandler() {
    return createWebhookHandler({
      flowController: mockFlowController,
      sender: mockSender,
      logger: mockLogger
    })
  }

  describe('handle', () => {
    describe('flow processing', () => {
      it('should call flowController.process with chatId and message', async () => {
        const flowResult: FlowResult = { handled: true, response: 'Welcome!' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        await handler.handle(payload)

        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          { type: 'text', content: 'test-shop' }
        )
      })

      it('should send text message when flow returns response', async () => {
        const flowResult: FlowResult = { handled: true, response: 'Welcome!' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(result.action).toBe('flow_processed')
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'Welcome!'
        )
      })

      it('should send buttons when flow returns buttons', async () => {
        const flowResult: FlowResult = {
          handled: true,
          buttons: {
            body: 'Choose an option',
            options: [
              { buttonId: '1', buttonText: 'Option 1' },
              { buttonId: '2', buttonText: 'Option 2' }
            ],
            header: 'Welcome!'
          }
        }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockSender.sendButtons).toHaveBeenCalledWith({
          chatId: '987654321@c.us',
          body: 'Choose an option',
          buttons: [
            { buttonId: '1', buttonText: 'Option 1' },
            { buttonId: '2', buttonText: 'Option 2' }
          ],
          header: 'Welcome!',
          footer: undefined
        })
      })

      it('should not send any message when flow returns handled=false', async () => {
        const flowResult: FlowResult = { handled: false }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('random message')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
        expect(mockSender.sendButtons).not.toHaveBeenCalled()
      })

      it('should not send message when flow returns no response or buttons', async () => {
        const flowResult: FlowResult = { handled: true }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test')

        await handler.handle(payload)

        expect(mockSender.sendMessage).not.toHaveBeenCalled()
        expect(mockSender.sendButtons).not.toHaveBeenCalled()
      })
    })

    describe('image message handling', () => {
      it('should process image messages and pass to flow controller', async () => {
        const flowResult: FlowResult = { handled: true, response: 'Image received!' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createImageWebhookPayload()

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(result.action).toBe('flow_processed')
        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          {
            type: 'image',
            content: 'https://example.com/image.jpg',
            mimeType: 'image/jpeg'
          }
        )
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'Image received!'
        )
      })
    })

    describe('unsupported message types', () => {
      it('should ignore unknown message types and not call flow', async () => {
        const handler = createHandler()
        const payload = {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: '123456789@c.us' },
          senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
          messageData: { typeMessage: 'audioMessage' },
          idMessage: 'ABC123'
        }

        const result = await handler.handle(payload)

        expect(result.handled).toBe(false)
        expect(result.action).toBe('ignored_unsupported')
        expect(mockFlowController.process).not.toHaveBeenCalled()
        expect(mockSender.sendMessage).not.toHaveBeenCalled()
      })

      it('should log warning for unsupported message types', async () => {
        const handler = createHandler()
        const payload = {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: '123456789@c.us' },
          senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
          messageData: { typeMessage: 'audioMessage' },
          idMessage: 'ABC123'
        }

        await handler.handle(payload)

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'ignored_unsupported',
            typeMessage: 'audioMessage'
          })
        )
      })
    })

    describe('button responses', () => {
      it('should process buttonsResponseMessage and extract selectedButtonId', async () => {
        const flowResult: FlowResult = { handled: true, response: 'You selected list' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createButtonsResponsePayload('list')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          { type: 'text', content: 'list' }
        )
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'You selected list'
        )
      })

      it('should process interactiveButtonsResponse and extract selectedButtonId', async () => {
        const flowResult: FlowResult = { handled: true, response: 'You selected add' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createInteractiveButtonsResponsePayload('add')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          { type: 'text', content: 'add' }
        )
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'You selected add'
        )
      })

      it('should process templateButtonsReplyMessage and extract selectedId', async () => {
        const flowResult: FlowResult = { handled: true, response: 'You selected list' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createTemplateButtonReplyPayload('list', 'List Products')

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          { type: 'text', content: 'list' }
        )
        expect(mockSender.sendMessage).toHaveBeenCalledWith(
          '987654321@c.us',
          'You selected list'
        )
      })

      it('should fall back to button text when button ID is missing', async () => {
        const flowResult: FlowResult = { handled: true, response: 'You selected list' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: '123456789@c.us' },
          senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
          messageData: {
            typeMessage: 'templateButtonsReplyMessage',
            templateButtonReplyMessage: {
              selectedDisplayText: 'List Products'
            }
          },
          idMessage: 'ABC123'
        }

        const result = await handler.handle(payload)

        expect(result.handled).toBe(true)
        expect(mockFlowController.process).toHaveBeenCalledWith(
          '987654321@c.us',
          { type: 'text', content: 'List Products' }
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
        expect(mockFlowController.process).not.toHaveBeenCalled()
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
        const flowResult: FlowResult = { handled: true, response: 'OK' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: '>>> FIRST MSG RECEIVED <<<',
            phone: '987654321@c.us',
            messageId: 'ABC123'
          })
        )
      })

      it('should log flow processed event', async () => {
        const flowResult: FlowResult = { handled: true, response: 'OK' }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('test-shop')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'flow_processed',
            chatId: '987654321@c.us',
            handled: true
          })
        )
      })

      it('should log flow not handled event', async () => {
        const flowResult: FlowResult = { handled: false }
        vi.mocked(mockFlowController.process).mockReturnValue(flowResult)

        const handler = createHandler()
        const payload = createValidWebhookPayload('random')

        await handler.handle(payload)

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'flow_not_handled',
            chatId: '987654321@c.us'
          })
        )
      })
    })
  })
})
