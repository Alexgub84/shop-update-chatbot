import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'

const IMAGE_NAME = 'shop-update-chatbot-test'
const PRODUCTION_CONTAINER = 'shop-update-chatbot-production-test'
const FAKE_GREENAPI_CONTAINER = 'shop-update-chatbot-fake-greenapi-test'
const PRODUCTION_PORT = 3098
const FAKE_GREENAPI_PORT = 3099

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

function logStep(testName: string, step: string): void {
  console.log(`\n[${testName}] STEP: ${step}`)
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

function createWebhookPayload(text: string, chatId: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: 'bot@c.us' },
    senderData: { chatId, sender: chatId },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: text }
    },
    idMessage: `MSG-${Date.now()}`
  }
}

function createButtonResponsePayload(buttonId: string, chatId: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: 'bot@c.us' },
    senderData: { chatId, sender: chatId },
    messageData: {
      typeMessage: 'interactiveButtonsResponse',
      interactiveButtonsResponse: {
        selectedButtonId: buttonId,
        selectedButtonText: 'Button Text'
      }
    },
    idMessage: `MSG-BTN-${Date.now()}`
  }
}

describe('Docker: Production Health (docker-test:production-health)', () => {
  const TEST_NAME = 'PRODUCTION-HEALTH'

  beforeAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing any existing test container')
    execSilent(`docker rm -f ${PRODUCTION_CONTAINER}`)
  }, 10000)

  afterAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing test container')
    execSilent(`docker rm -f ${PRODUCTION_CONTAINER}`)
  }, 10000)

  it('builds production image successfully', () => {
    logStep(TEST_NAME, 'Building Docker production image')
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
    logStep(TEST_NAME, 'Docker image built successfully')
  }, 120000)

  it('starts container and health check passes', async () => {
    logStep(TEST_NAME, 'Starting container with MOCK_MODE=true')
    exec(`docker run -d \
      --name ${PRODUCTION_CONTAINER} \
      -p ${PRODUCTION_PORT}:${PRODUCTION_PORT} \
      -e PORT=${PRODUCTION_PORT} \
      -e MOCK_MODE=true \
      -e TRIGGER_CODE=test-shop \
      -e GREEN_API_INSTANCE_ID=test-instance \
      -e GREEN_API_TOKEN=test-token \
      -e WOOCOMMERCE_STORE_URL=https://test-store.com \
      -e WOOCOMMERCE_CONSUMER_KEY=ck_test_key \
      -e WOOCOMMERCE_CONSUMER_SECRET=cs_test_secret \
      -e LOG_LEVEL=info \
      ${IMAGE_NAME}`)

    logStep(TEST_NAME, 'Waiting for container to become healthy')
    const healthy = await waitForHealthy(`http://localhost:${PRODUCTION_PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${PRODUCTION_CONTAINER}`)
      console.error('Container logs:', logs)
    }
    
    logStep(TEST_NAME, healthy ? 'Container is healthy' : 'Container health check FAILED')
    expect(healthy).toBe(true)
  }, 30000)

  it('health endpoint returns correct response', async () => {
    logStep(TEST_NAME, 'Testing /health endpoint response')
    const response = await fetch(`http://localhost:${PRODUCTION_PORT}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
    logStep(TEST_NAME, 'Health endpoint returned status: ok')
  }, 5000)

  it('webhook endpoint accepts POST requests', async () => {
    logStep(TEST_NAME, 'Testing /webhook endpoint accepts POST')
    const response = await fetch(`http://localhost:${PRODUCTION_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('test-shop', 'production-test@c.us'))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('ok', true)
    logStep(TEST_NAME, 'Webhook endpoint accepted POST request successfully')
  }, 5000)
})

describe('Docker: FAKE GreenAPI WhatsApp Flow - List Click (docker-test:fake-greenapi-whatsapp-flow-list-click)', () => {
  const TEST_NAME = 'FAKE-GREENAPI-FLOW'
  const CHAT_ID = 'fake-greenapi-test-user@c.us'
  const TRIGGER_MESSAGE = 'test-shop'

  beforeAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing any existing test container')
    execSilent(`docker rm -f ${FAKE_GREENAPI_CONTAINER}`)
  }, 10000)

  afterAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing test container')
    execSilent(`docker rm -f ${FAKE_GREENAPI_CONTAINER}`)
  }, 10000)

  it('builds image for FAKE GreenAPI test', () => {
    logStep(TEST_NAME, 'FAKE GreenAPI: Building Docker image')
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
    logStep(TEST_NAME, 'FAKE GreenAPI: Docker image built successfully')
  }, 120000)

  it('starts container with FAKE_GREENAPI_MODE enabled', async () => {
    logStep(TEST_NAME, 'FAKE GreenAPI: Starting container with FAKE_GREENAPI_MODE=true')
    exec(`docker run -d \
      --name ${FAKE_GREENAPI_CONTAINER} \
      -p ${FAKE_GREENAPI_PORT}:${FAKE_GREENAPI_PORT} \
      -e PORT=${FAKE_GREENAPI_PORT} \
      -e FAKE_GREENAPI_MODE=true \
      -e "TRIGGER_CODE=${TRIGGER_MESSAGE}" \
      -e GREEN_API_INSTANCE_ID=fake-instance \
      -e GREEN_API_TOKEN=fake-token \
      -e WOOCOMMERCE_STORE_URL=https://test-store.com \
      -e WOOCOMMERCE_CONSUMER_KEY=ck_test_key \
      -e WOOCOMMERCE_CONSUMER_SECRET=cs_test_secret \
      -e LOG_LEVEL=info \
      ${IMAGE_NAME}`)

    logStep(TEST_NAME, 'FAKE GreenAPI: Waiting for container to become healthy')
    const healthy = await waitForHealthy(`http://localhost:${FAKE_GREENAPI_PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${FAKE_GREENAPI_CONTAINER}`)
      console.error('Container logs:', logs)
    }
    
    logStep(TEST_NAME, healthy ? 'FAKE GreenAPI: Container is healthy' : 'FAKE GreenAPI: Container health check FAILED')
    expect(healthy).toBe(true)

    const logs = exec(`docker logs ${FAKE_GREENAPI_CONTAINER}`)
    expect(logs).toContain('FAKE GreenAPI')
    logStep(TEST_NAME, 'FAKE GreenAPI: Verified FAKE GreenAPI mode is enabled in logs')
  }, 30000)

  it('Step 1: Send trigger message "test-shop" - receives interactive buttons', async () => {
    logStep(TEST_NAME, `FAKE GreenAPI: Sending trigger message "${TRIGGER_MESSAGE}"`)
    
    const response = await fetch(`http://localhost:${FAKE_GREENAPI_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(TRIGGER_MESSAGE, CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'FAKE GreenAPI: Trigger message processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    logStep(TEST_NAME, 'FAKE GreenAPI: Checking container logs for button response')
    const logs = exec(`docker logs ${FAKE_GREENAPI_CONTAINER}`)
    
    expect(logs).toContain('FAKE_GREENAPI_SEND_BUTTONS')
    expect(logs).toContain('List Products')
    expect(logs).toContain('Add New Product')
    logStep(TEST_NAME, 'FAKE GreenAPI: Verified interactive buttons were sent (List Products, Add New Product)')
  }, 10000)

  it('Step 2: Click "List" button via text input - verify flow continues with action', async () => {
    logStep(TEST_NAME, 'FAKE GreenAPI: Simulating click on "List" button (sending text "list")')
    
    const response = await fetch(`http://localhost:${FAKE_GREENAPI_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('list', CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'FAKE GreenAPI: "List" text input processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    logStep(TEST_NAME, 'FAKE GreenAPI: Checking container logs for flow continuation')
    const logs = exec(`docker logs ${FAKE_GREENAPI_CONTAINER}`)
    
    expect(logs).toContain('choice_selected')
    expect(logs).toContain('action_triggered')
    expect(logs).toContain('listProducts')
    logStep(TEST_NAME, 'FAKE GreenAPI: Verified flow continued - listProducts action was triggered')
  }, 10000)

  it('Step 3: Re-trigger flow and click "Add" via actual button response payload', async () => {
    const BUTTON_TEST_CHAT_ID = 'button-response-test@c.us'
    
    logStep(TEST_NAME, 'FAKE GreenAPI: Re-triggering flow for button response test')
    const triggerResponse = await fetch(`http://localhost:${FAKE_GREENAPI_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('test-shop', BUTTON_TEST_CHAT_ID))
    })
    expect(triggerResponse.status).toBe(200)
    
    await new Promise(resolve => setTimeout(resolve, 300))

    logStep(TEST_NAME, 'FAKE GreenAPI: Sending actual interactiveButtonsResponse payload (buttonId: "add")')
    const buttonResponse = await fetch(`http://localhost:${FAKE_GREENAPI_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createButtonResponsePayload('add', BUTTON_TEST_CHAT_ID))
    })
    const body = await buttonResponse.json()

    expect(buttonResponse.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'FAKE GreenAPI: Button response payload processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    logStep(TEST_NAME, 'FAKE GreenAPI: Checking logs for interactiveButtonsResponse handling')
    const logs = exec(`docker logs ${FAKE_GREENAPI_CONTAINER}`)
    
    expect(logs).toContain('interactiveButtonsResponse')
    expect(logs).toContain('choice_selected')
    logStep(TEST_NAME, 'FAKE GreenAPI: Verified interactiveButtonsResponse was handled correctly')
    logStep(TEST_NAME, 'FAKE GreenAPI: WhatsApp flow test completed successfully!')
  }, 15000)
})
