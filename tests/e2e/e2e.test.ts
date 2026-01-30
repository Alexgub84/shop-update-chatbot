import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../../src/app.js'

describe('E2E: Webhook Flow', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    process.env.MOCK_MODE = 'true'
    process.env.TRIGGER_CODE = 'test-shop'
    process.env.GREEN_API_INSTANCE_ID = 'test-instance'
    process.env.GREEN_API_TOKEN = 'test-token'

    const app = createApp()
    server = app.server
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  function createWebhookPayload(text: string) {
    return {
      typeWebhook: 'incomingMessageReceived',
      instanceData: { idInstance: 123, wid: 'bot@c.us' },
      senderData: { chatId: 'user123@c.us', sender: 'user123@c.us' },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: text }
      },
      idMessage: `MSG-${Date.now()}`
    }
  }

  describe('trigger message "test-shop"', () => {
    it('should respond with welcome message when exact match', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(true)
      expect(body.action).toBe('trigger_matched')
    })

    it('should respond with welcome message when case differs', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('TEST-SHOP')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(true)
      expect(body.action).toBe('trigger_matched')
    })

    it('should respond with welcome message when has whitespace', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('  test-shop  ')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(true)
      expect(body.action).toBe('trigger_matched')
    })
  })

  describe('non-trigger messages', () => {
    it('should not respond to random text', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('hello world')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(false)
      expect(body.action).toBe('ignored_non_trigger')
    })

    it('should not respond to partial trigger match', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('test-shop please')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(false)
      expect(body.action).toBe('ignored_non_trigger')
    })

    it('should not respond to empty message', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload('')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.handled).toBe(false)
      expect(body.action).toBe('ignored_non_trigger')
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
          senderData: { chatId: 'user123@c.us', sender: 'user123@c.us' },
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
