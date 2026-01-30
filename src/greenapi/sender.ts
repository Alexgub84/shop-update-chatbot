import { GreenApiError } from '../errors.js'
import type { Logger } from '../logger.js'

export interface GreenApiConfig {
  instanceId: string
  token: string
}

export interface SendMessageResponse {
  idMessage: string
}

export interface ButtonOption {
  buttonId: string
  buttonText: string
}

export interface SendButtonsParams {
  chatId: string
  body: string
  buttons: ButtonOption[]
  header?: string
  footer?: string
}

export interface GreenApiSender {
  sendMessage(chatId: string, message: string): Promise<SendMessageResponse>
  sendButtons(params: SendButtonsParams): Promise<SendMessageResponse>
}

export function createGreenApiSender(
  config: GreenApiConfig,
  logger: Logger,
  fetchFunction: typeof fetch = fetch
): GreenApiSender {
  const baseUrl = `https://api.green-api.com/waInstance${config.instanceId}`

  async function sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
    const url = `${baseUrl}/sendMessage/${config.token}`

    logger.info({ event: 'greenapi_send_start', chatId })

    let response: Response
    try {
      response = await fetchFunction(url, {
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

  async function sendButtons(params: SendButtonsParams): Promise<SendMessageResponse> {
    const url = `${baseUrl}/sendInteractiveButtonsReply/${config.token}`

    logger.info({ event: 'greenapi_send_buttons_start', chatId: params.chatId, buttonCount: params.buttons.length })

    const payload: Record<string, unknown> = {
      chatId: params.chatId,
      body: params.body,
      buttons: params.buttons
    }
    if (params.header) payload.header = params.header
    if (params.footer) payload.footer = params.footer

    let response: Response
    try {
      response = await fetchFunction(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (err) {
      logger.error({ event: 'greenapi_network_error', chatId: params.chatId, error: err })
      throw new GreenApiError('Network error sending buttons', undefined, { cause: err })
    }

    if (!response.ok) {
      const body = await response.text()
      logger.error({ event: 'greenapi_api_error', chatId: params.chatId, statusCode: response.status, body })
      throw new GreenApiError(`Green API error: ${response.status}`, response.status)
    }

    const data = await response.json() as SendMessageResponse
    logger.info({ event: 'greenapi_send_buttons_success', chatId: params.chatId, idMessage: data.idMessage })

    return data
  }

  return { sendMessage, sendButtons }
}

export function createMockSender(logger: Logger): GreenApiSender {
  let messageCounter = 0

  async function sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
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

  async function sendButtons(params: SendButtonsParams): Promise<SendMessageResponse> {
    messageCounter++
    const idMessage = `mock-buttons-${messageCounter}`

    logger.info({
      event: 'mock_send_buttons',
      chatId: params.chatId,
      body: params.body,
      buttons: params.buttons.map(b => b.buttonText),
      idMessage
    })

    return { idMessage }
  }

  return { sendMessage, sendButtons }
}

export function createFakeGreenApiSender(logger: Logger): GreenApiSender {
  let messageCounter = 0

  async function sendMessage(chatId: string, message: string): Promise<SendMessageResponse> {
    messageCounter++
    const idMessage = `fake-greenapi-msg-${messageCounter}`

    logger.info({
      event: 'FAKE_GREENAPI_SEND_MESSAGE',
      mode: 'FAKE GreenAPI',
      chatId,
      message,
      idMessage
    })

    return { idMessage }
  }

  async function sendButtons(params: SendButtonsParams): Promise<SendMessageResponse> {
    messageCounter++
    const idMessage = `fake-greenapi-buttons-${messageCounter}`

    logger.info({
      event: 'FAKE_GREENAPI_SEND_BUTTONS',
      mode: 'FAKE GreenAPI',
      chatId: params.chatId,
      header: params.header,
      body: params.body,
      buttons: params.buttons.map(b => ({ id: b.buttonId, text: b.buttonText })),
      footer: params.footer,
      idMessage
    })

    return { idMessage }
  }

  return { sendMessage, sendButtons }
}
