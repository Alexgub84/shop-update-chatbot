import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadDotenv } from 'dotenv'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../../src/app.js'

loadDotenv()

const TEST_CHAT_ID = process.env.TEST_CHAT_ID

describe('Production Test: Real Green API', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    process.env.MOCK_MODE = 'false'

    const app = createApp()
    server = app.server
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  function createWebhookPayload(chatId: string, text: string) {
    return {
      typeWebhook: 'incomingMessageReceived',
      instanceData: { idInstance: 123, wid: 'bot@c.us' },
      senderData: { chatId, sender: chatId },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: text }
      },
      idMessage: `PROD-TEST-${Date.now()}`
    }
  }

  describe('health endpoint', () => {
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

  describe('webhook with real Green API', () => {
    it('should send real message when trigger matches', async () => {
      if (!TEST_CHAT_ID) {
        console.log('Skipping: TEST_CHAT_ID not set in .env')
        return
      }

      const triggerCode = process.env.TRIGGER_CODE || 'test-shop'

      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload(TEST_CHAT_ID, triggerCode)
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(true)
      expect(body.action).toBe('trigger_matched')
    })

    it('should ignore non-trigger message (no API call)', async () => {
      if (!TEST_CHAT_ID) {
        console.log('Skipping: TEST_CHAT_ID not set in .env')
        return
      }

      const response = await server.inject({
        method: 'POST',
        url: '/webhook',
        payload: createWebhookPayload(TEST_CHAT_ID, 'random-message-ignored')
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.ok).toBe(true)
      expect(body.handled).toBe(false)
      expect(body.action).toBe('ignored_non_trigger')
    })
  })
})
