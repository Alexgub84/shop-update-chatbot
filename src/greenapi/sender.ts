import { GreenApiError } from '../errors.js'
import type { Logger } from '../logger.js'

export interface GreenApiConfig {
  instanceId: string
  token: string
}

export interface SendMessageResponse {
  idMessage: string
}

export interface GreenApiSender {
  sendMessage(chatId: string, message: string): Promise<SendMessageResponse>
}

export function createGreenApiSender(
  config: GreenApiConfig,
  logger: Logger,
  fetchFn: typeof fetch = fetch
): GreenApiSender {
  const baseUrl = `https://api.green-api.com/waInstance${config.instanceId}`

  return {
    async sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
      const url = `${baseUrl}/sendMessage/${config.token}`

      logger.info({ event: 'greenapi_send_start', chatId })

      let response: Response
      try {
        response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message })
        })
      } catch (err) {
        logger.error({ event: 'greenapi_network_error', chatId, error: err })
        throw new GreenApiError('Network error sending message', undefined, { cause: err })
      }

      if (!response.ok) {
        const body = await response.text()
        logger.error({ event: 'greenapi_api_error', chatId, statusCode: response.status, body })
        throw new GreenApiError(`Green API error: ${response.status}`, response.status)
      }

      const data = await response.json() as SendMessageResponse
      logger.info({ event: 'greenapi_send_success', chatId, idMessage: data.idMessage })

      return data
    }
  }
}

export function createMockSender(logger: Logger): GreenApiSender {
  let messageCounter = 0

  return {
    async sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
      messageCounter++
      const idMessage = `mock-msg-${messageCounter}`

      logger.info({
        event: 'mock_send',
        chatId,
        message,
        idMessage
      })

      return { idMessage }
    }
  }
}
