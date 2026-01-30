import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp, type App } from '../../src/app.js'

describe('E2E: Webhook Flow', () => {
  let app: App
  let server: FastifyInstance
  let chatCounter = 0

  beforeAll(async () => {
    process.env.MOCK_MODE = 'true'
    process.env.TRIGGER_CODE = 'test-shop'
    process.env.GREEN_API_INSTANCE_ID = 'test-instance'
    process.env.GREEN_API_TOKEN = 'test-token'

    app = createApp()
    server = app.server
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  function createWebhookPayload(text: string, chatId?: string) {
    const actualChatId = chatId ?? `user${++chatCounter}@c.us`
    return {
      typeWebhook: 'incomingMessageReceived',
      instanceData: { idInstance: 123, wid: 'bot@c.us' },
      senderData: { chatId: actualChatId, sender: actualChatId },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: text }
      },
      idMessage: `MSG-${Date.now()}-${chatCounter}`
    }
  }

  describe('trigger message "test-shop"', () => {
    it('should start session and return buttons when exact match', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(true)
      expect(body.action).toBe('flow_processed')
    })

    it('should start session when trigger case differs', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('TEST-SHOP')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(true)
      expect(body.action).toBe('flow_processed')
    })

    it('should start session when trigger has whitespace', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('  test-shop  ')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(true)
      expect(body.action).toBe('flow_processed')
    })
  })

  describe('non-trigger messages (no active session)', () => {
    it('should not handle random text without active session', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('hello world')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(false)
      expect(body.action).toBe('flow_processed')
    })

    it('should not handle partial trigger match', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop please')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(false)
      expect(body.action).toBe('flow_processed')
    })
  })

  describe('multi-turn conversation', () => {
    it('should process choice after trigger', async () => {
      const chatId = 'multi-turn-user@c.us'

      const triggerResponse = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop', chatId)
      })
      expect(triggerResponse.json().handled).toBe(true)

      const choiceResponse = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('1', chatId)
      })
      expect(choiceResponse.statusCode).toBe(200)
      const body = choiceResponse.json()
      expect(body.handled).toBe(true)
    })

    it('should handle invalid choice and re-prompt', async () => {
      const chatId = 'invalid-choice-user@c.us'

      await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop', chatId)
      })

      const invalidResponse = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('invalid option', chatId)
      })

      expect(invalidResponse.statusCode).toBe(200)
      const body = invalidResponse.json()
      expect(body.handled).toBe(true)
    })
  })

  describe('non-text messages', () => {
    it('should ignore image messages', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: {
          typeWebhook: 'incomingMessageReceived',
          instanceData: { idInstance: 123, wid: 'bot@c.us' },
          senderData: { chatId: 'image-user@c.us', sender: 'image-user@c.us' },
          messageData: {
            typeMessage: 'imageMessage',
            fileMessageData: { downloadUrl: 'https://example.com/image.jpg' }
          },
          idMessage: 'MSG-IMAGE'
        }
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(false)
      expect(body.action).toBe('ignored_non_text')
    })
  })

  describe('health check', () => {
    it('should return ok status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeDefined()
    })
  })
})
