import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'

const IMAGE_NAME = 'shop-update-chatbot-test'
const CONTAINER_NAME = 'shop-update-chatbot-docker-test'
const PORT = 3099

function exec(command: string): string {
  return execSync(command, { encoding: 'utf-8', stdio: 'pipe' })
}

function execSilent(command: string): boolean {
  try {
    execSync(command, { encoding: 'utf-8', stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

async function waitForHealthy(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // Container not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

describe('Docker', () => {
  beforeAll(() => {
    execSilent(`docker rm -f ${CONTAINER_NAME}`)
  }, 10000)

  afterAll(() => {
    execSilent(`docker rm -f ${CONTAINER_NAME}`)
  }, 10000)

  it('builds image successfully', () => {
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
  }, 120000)

  it('starts container and health check passes', async () => {
    exec(`docker run -d \
      --name ${CONTAINER_NAME} \
      -p ${PORT}:${PORT} \
      -e PORT=${PORT} \
      -e MOCK_MODE=true \
      -e TRIGGER_CODE=test-shop \
      -e GREEN_API_INSTANCE_ID=test-instance \
      -e GREEN_API_TOKEN=test-token \
      -e LOG_LEVEL=info \
      ${IMAGE_NAME}`)

    const healthy = await waitForHealthy(`http://localhost:${PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${CONTAINER_NAME}`)
      console.error('Container logs:', logs)
    }
    
    expect(healthy).toBe(true)
  }, 30000)

  it('health endpoint returns correct response', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
  }, 5000)

  it('webhook endpoint accepts POST requests', async () => {
    const response = await fetch(`http://localhost:${PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typeWebhook: 'incomingMessageReceived',
        instanceData: { idInstance: 123, wid: '1234567890@c.us' },
        senderData: { chatId: '1234567890@c.us', chatName: 'Test', sender: '1234567890@c.us' },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'test-shop' } },
        idMessage: 'MSG-123'
      })
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('ok', true)
  }, 5000)
})
