import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGreenApiSender, type SendButtonsParams } from '../../src/greenapi/sender.js'
import { GreenApiError } from '../../src/errors.js'

describe('GreenApiSender', () => {
  const config = { instanceId: 'test123', token: 'token456' }
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ idMessage: 'msg123' })
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)
      const result = await sender.sendMessage('123@c.us', 'Hello')

      expect(result.idMessage).toBe('msg123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.green-api.com/waInstancetest123/sendMessage/token456',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: '123@c.us', message: 'Hello' })
        }
      )
    })

    it('should log success event', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ idMessage: 'msg123' })
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)
      await sender.sendMessage('123@c.us', 'Hello')

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'greenapi_send_start',
        chatId: '123@c.us'
      })
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'greenapi_send_success',
        chatId: '123@c.us',
        idMessage: 'msg123'
      })
    })

    it('should throw GreenApiError on network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      await expect(sender.sendMessage('123@c.us', 'Hello'))
        .rejects.toThrow(GreenApiError)
      await expect(sender.sendMessage('123@c.us', 'Hello'))
        .rejects.toThrow(/Network error/)
    })

    it('should log network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      try {
        await sender.sendMessage('123@c.us', 'Hello')
      } catch {}

      expect(mockLogger.error).toHaveBeenCalledWith({
        event: 'greenapi_network_error',
        chatId: '123@c.us',
        error: networkError
      })
    })

    it('should throw GreenApiError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      await expect(sender.sendMessage('123@c.us', 'Hello'))
        .rejects.toThrow(GreenApiError)
      await expect(sender.sendMessage('123@c.us', 'Hello'))
        .rejects.toThrow(/Green API error: 401/)
    })

    it('should include status code in GreenApiError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal error'
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      try {
        await sender.sendMessage('123@c.us', 'Hello')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(GreenApiError)
        expect((err as GreenApiError).statusCode).toBe(500)
      }
    })

    it('should log API error with status and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      try {
        await sender.sendMessage('123@c.us', 'Hello')
      } catch {}

      expect(mockLogger.error).toHaveBeenCalledWith({
        event: 'greenapi_api_error',
        chatId: '123@c.us',
        statusCode: 403,
        body: 'Forbidden'
      })
    })
  })

  describe('sendButtons', () => {
    const buttonParams: SendButtonsParams = {
      chatId: '123@c.us',
      body: 'Choose an option',
      buttons: [
        { buttonId: '1', buttonText: 'Option 1' },
        { buttonId: '2', buttonText: 'Option 2' }
      ]
    }

    it('should send buttons successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ idMessage: 'btn123' })
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)
      const result = await sender.sendButtons(buttonParams)

      expect(result.idMessage).toBe('btn123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.green-api.com/waInstancetest123/sendInteractiveButtonsReply/token456',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: '123@c.us',
            body: 'Choose an option',
            buttons: [
              { buttonId: '1', buttonText: 'Option 1' },
              { buttonId: '2', buttonText: 'Option 2' }
            ]
          })
        }
      )
    })

    it('should include optional header and footer', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ idMessage: 'btn123' })
      })

      const paramsWithExtras: SendButtonsParams = {
        ...buttonParams,
        header: 'Header Text',
        footer: 'Footer Text'
      }

      const sender = createGreenApiSender(config, mockLogger, mockFetch)
      await sender.sendButtons(paramsWithExtras)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.header).toBe('Header Text')
      expect(callBody.footer).toBe('Footer Text')
    })

    it('should log success event', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ idMessage: 'btn123' })
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)
      await sender.sendButtons(buttonParams)

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'greenapi_send_buttons_start',
        chatId: '123@c.us',
        buttonCount: 2
      })
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'greenapi_send_buttons_success',
        chatId: '123@c.us',
        idMessage: 'btn123'
      })
    })

    it('should throw GreenApiError on network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      await expect(sender.sendButtons(buttonParams))
        .rejects.toThrow(GreenApiError)
      await expect(sender.sendButtons(buttonParams))
        .rejects.toThrow(/Network error/)
    })

    it('should throw GreenApiError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      })

      const sender = createGreenApiSender(config, mockLogger, mockFetch)

      await expect(sender.sendButtons(buttonParams))
        .rejects.toThrow(GreenApiError)
      await expect(sender.sendButtons(buttonParams))
        .rejects.toThrow(/Green API error: 403/)
    })
  })
})
