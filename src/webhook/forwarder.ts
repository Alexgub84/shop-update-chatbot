import { createNoopLogger, type Logger } from '../logger.js'

export interface ForwardedMessage {
  payload: unknown
  timestamp: Date
}

export interface WebhookForwarder {
  forward(payload: unknown): Promise<boolean>
  getForwardedMessages(): ForwardedMessage[]
}

export interface WebhookForwarderConfig {
  url: string
}

export function createWebhookForwarder(
  config: WebhookForwarderConfig,
  logger?: Logger,
  fetchFn: typeof fetch = fetch
): WebhookForwarder {
  const log = logger ?? createNoopLogger()
  const forwardedMessages: ForwardedMessage[] = []

  async function forward(payload: unknown): Promise<boolean> {
    try {
      log.info({ event: 'forwarding_to_webhook', url: config.url })
      const response = await fetchFn(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        log.error({ event: 'forward_webhook_error', status: response.status, statusText: response.statusText })
        return false
      }

      forwardedMessages.push({ payload, timestamp: new Date() })
      log.info({ event: 'forward_webhook_success', status: response.status })
      return true
    } catch (err) {
      log.error({ event: 'forward_webhook_error', error: err })
      return false
    }
  }

  function getForwardedMessages(): ForwardedMessage[] {
    return [...forwardedMessages]
  }

  return { forward, getForwardedMessages }
}

export function createFakeWebhookForwarder(logger?: Logger): WebhookForwarder {
  const log = logger ?? createNoopLogger()
  const forwardedMessages: ForwardedMessage[] = []

  async function forward(payload: unknown): Promise<boolean> {
    log.info({
      event: 'FAKE_FORWARD_WEBHOOK',
      mode: 'FAKE Forwarder',
      payload
    })
    forwardedMessages.push({ payload, timestamp: new Date() })
    return true
  }

  function getForwardedMessages(): ForwardedMessage[] {
    return [...forwardedMessages]
  }

  return { forward, getForwardedMessages }
}

export function createMockWebhookForwarder(): WebhookForwarder & {
  setResponse(success: boolean): void
  getCallCount(): number
} {
  const forwardedMessages: ForwardedMessage[] = []
  let responseSuccess = true
  let callCount = 0

  async function forward(payload: unknown): Promise<boolean> {
    callCount++
    if (responseSuccess) {
      forwardedMessages.push({ payload, timestamp: new Date() })
    }
    return responseSuccess
  }

  function getForwardedMessages(): ForwardedMessage[] {
    return [...forwardedMessages]
  }

  function setResponse(success: boolean): void {
    responseSuccess = success
  }

  function getCallCount(): number {
    return callCount
  }

  return { forward, getForwardedMessages, setResponse, getCallCount }
}
