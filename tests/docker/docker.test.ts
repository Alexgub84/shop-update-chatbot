import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createMockWooCommerceServer, createSampleProduct, type MockWooCommerceServer } from '../integration/woocommerce-server.js'

const IMAGE_NAME = 'shop-update-chatbot-test'
const PROD_ENV_CONTAINER = 'shop-update-chatbot-prod-env-test'
const PROD_ENV_PORT = 3095
const PRODUCTION_CONTAINER = 'shop-update-chatbot-production-test'
const FAKE_GREENAPI_CONTAINER = 'shop-update-chatbot-fake-greenapi-test'
const WOOCOMMERCE_CONTAINER = 'shop-update-chatbot-woocommerce-test'
const PRODUCTION_PORT = 3098
const FAKE_GREENAPI_PORT = 3099
const WOOCOMMERCE_APP_PORT = 3097
const WOOCOMMERCE_MOCK_PORT = 3096

function exec(command: string): string {
  return execSync(command + ' 2>&1', { encoding: 'utf-8', stdio: 'pipe' })
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

describe('Docker: FAKE GreenAPI WhatsApp Flow - Add Product (docker-test:fake-greenapi-add-product)', () => {
  const TEST_NAME = 'FAKE-GREENAPI-ADD-PRODUCT'
  const CHAT_ID = 'add-product-test-user@c.us'
  const TRIGGER_MESSAGE = 'test-shop'
  const ADD_PRODUCT_CONTAINER = 'shop-update-chatbot-add-product-test'
  const ADD_PRODUCT_PORT = 3094
  const ADD_PRODUCT_MOCK_PORT = 3095

  let mockWooServer: MockWooCommerceServer

  beforeAll(async () => {
    logStep(TEST_NAME, 'Cleanup: Removing any existing test container')
    execSilent(`docker rm -f ${ADD_PRODUCT_CONTAINER}`)
    
    logStep(TEST_NAME, 'Starting mock WooCommerce server on host')
    mockWooServer = createMockWooCommerceServer(ADD_PRODUCT_MOCK_PORT)
    mockWooServer.setAuthCredentials('ck_add_product_test', 'cs_add_product_test')
    await mockWooServer.start()
    logStep(TEST_NAME, `Mock WooCommerce server running on port ${ADD_PRODUCT_MOCK_PORT}`)
  }, 10000)

  afterAll(async () => {
    logStep(TEST_NAME, 'Cleanup: Removing test container')
    execSilent(`docker rm -f ${ADD_PRODUCT_CONTAINER}`)
    logStep(TEST_NAME, 'Cleanup: Stopping mock WooCommerce server')
    await mockWooServer.stop()
  }, 10000)

  it('builds image for Add Product test', () => {
    logStep(TEST_NAME, 'Building Docker image')
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
    logStep(TEST_NAME, 'Docker image built successfully')
  }, 120000)

  it('starts container with FAKE_GREENAPI_MODE enabled', async () => {
    logStep(TEST_NAME, 'Starting container with FAKE_GREENAPI_MODE=true')
    exec(`docker run -d \
      --name ${ADD_PRODUCT_CONTAINER} \
      -p ${ADD_PRODUCT_PORT}:${ADD_PRODUCT_PORT} \
      -e PORT=${ADD_PRODUCT_PORT} \
      -e FAKE_GREENAPI_MODE=true \
      -e "TRIGGER_CODE=${TRIGGER_MESSAGE}" \
      -e GREEN_API_INSTANCE_ID=add-product-instance \
      -e GREEN_API_TOKEN=add-product-token \
      -e WOOCOMMERCE_STORE_URL=http://host.docker.internal:${ADD_PRODUCT_MOCK_PORT} \
      -e WOOCOMMERCE_CONSUMER_KEY=ck_add_product_test \
      -e WOOCOMMERCE_CONSUMER_SECRET=cs_add_product_test \
      -e LOG_LEVEL=info \
      ${IMAGE_NAME}`)

    logStep(TEST_NAME, 'Waiting for container to become healthy')
    const healthy = await waitForHealthy(`http://localhost:${ADD_PRODUCT_PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
      console.error('Container logs:', logs)
    }
    
    logStep(TEST_NAME, healthy ? 'Container is healthy' : 'Container health check FAILED')
    expect(healthy).toBe(true)
  }, 30000)

  it('Step 1: Send trigger message - receives interactive buttons', async () => {
    logStep(TEST_NAME, `Sending trigger message "${TRIGGER_MESSAGE}"`)
    
    const response = await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(TRIGGER_MESSAGE, CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'Trigger message processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    const logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    expect(logs).toContain('FAKE_GREENAPI_SEND_BUTTONS')
    expect(logs).toContain('Add New Product')
    logStep(TEST_NAME, 'Verified interactive buttons were sent')
  }, 10000)

  it('Step 2: Click "Add" button - receives product input prompt', async () => {
    logStep(TEST_NAME, 'Sending "add" to start add product flow')
    
    const response = await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('add', CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, '"Add" command processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    const logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    expect(logs).toContain('choice_selected')
    expect(logs).toContain('FAKE_GREENAPI_SEND_MESSAGE')
    expect(logs).toContain('Name:')
    expect(logs).toContain('Price:')
    expect(logs).toContain('Stock:')
    expect(logs).toContain('stop')
    logStep(TEST_NAME, 'Verified product input prompt was sent')
  }, 10000)

  it('Step 3: Send valid product details - receives confirmation with SKU', async () => {
    logStep(TEST_NAME, 'Sending valid product details')
    
    const productInput = 'Name: Test Docker Product\nPrice: 49.99\nStock: 25\nDescription: A product added via Docker test'
    
    const response = await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(productInput, CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'Product details processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    const logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    
    expect(logs).toContain('input_received')
    expect(logs).toContain('product_data_updated')
    expect(logs).toContain('add_product_processing')
    logStep(TEST_NAME, 'Verified product data was processed')

    expect(logs).toContain('Test Docker Product')
    expect(logs).toContain('49.99')
    expect(logs).toContain('25')
    logStep(TEST_NAME, 'Verified product details in logs')

    expect(logs).toContain('FAKE_GREENAPI_SEND_MESSAGE')
    expect(logs).toContain('added successfully')
    logStep(TEST_NAME, 'Verified confirmation message was sent')

    expect(logs).toContain('FAKE_GREENAPI_SEND_BUTTONS')
    logStep(TEST_NAME, 'Verified buttons were sent again after product added')
    
    logStep(TEST_NAME, 'Add Product flow test completed successfully!')
  }, 10000)

  it('Step 4: Test partial input then complete - remembers values', async () => {
    const PARTIAL_CHAT_ID = 'partial-input-test@c.us'
    
    logStep(TEST_NAME, 'Starting new session for partial input test')
    await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(TRIGGER_MESSAGE, PARTIAL_CHAT_ID))
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    logStep(TEST_NAME, 'Clicking Add button')
    await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('add', PARTIAL_CHAT_ID))
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    logStep(TEST_NAME, 'Sending partial input (only Name)')
    await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('Name: Partial Product', PARTIAL_CHAT_ID))
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    let logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    expect(logs).toContain('Partial Product')
    expect(logs).toContain('missing fields')
    logStep(TEST_NAME, 'Verified partial input stored and missing fields requested')

    logStep(TEST_NAME, 'Sending remaining fields (Price and Stock)')
    const response = await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('Price: 99.99\nStock: 50', PARTIAL_CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 500))

    logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    expect(logs).toContain('add_product_processing')
    expect(logs).toContain('Partial Product')
    expect(logs).toContain('99.99')
    expect(logs).toContain('50')
    expect(logs).toContain('added successfully')
    logStep(TEST_NAME, 'Verified product completed with remembered values')

    const buttonMatches = logs.match(/FAKE_GREENAPI_SEND_BUTTONS/g)
    expect(buttonMatches).not.toBeNull()
    expect(buttonMatches!.length).toBeGreaterThanOrEqual(3)
    logStep(TEST_NAME, 'Verified menu buttons sent again after product added')
    logStep(TEST_NAME, 'Partial input test completed successfully!')
  }, 20000)

  it('Step 5: Test stop command cancels flow', async () => {
    const STOP_CHAT_ID = 'stop-test@c.us'
    
    logStep(TEST_NAME, 'Starting new session for stop command test')
    await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(TRIGGER_MESSAGE, STOP_CHAT_ID))
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    logStep(TEST_NAME, 'Clicking Add button')
    await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('add', STOP_CHAT_ID))
    })
    await new Promise(resolve => setTimeout(resolve, 300))

    logStep(TEST_NAME, 'Sending stop command')
    const response = await fetch(`http://localhost:${ADD_PRODUCT_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('stop', STOP_CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 500))

    const logs = exec(`docker logs ${ADD_PRODUCT_CONTAINER}`)
    expect(logs).toContain('input_cancelled')
    expect(logs).toContain('cancelled')
    expect(logs).toContain('FAKE_GREENAPI_SEND_BUTTONS')
    logStep(TEST_NAME, 'Verified stop command cancelled flow and returned to menu')
    logStep(TEST_NAME, 'Stop command test completed successfully!')
  }, 15000)
})

describe('Docker: WooCommerce Integration - List Products (docker-test:woocommerce-integration)', () => {
  const TEST_NAME = 'WOOCOMMERCE-INTEGRATION'
  const CHAT_ID = 'woocommerce-test-user@c.us'
  const TRIGGER_MESSAGE = 'test-shop'
  let mockWooServer: MockWooCommerceServer

  beforeAll(async () => {
    logStep(TEST_NAME, 'Cleanup: Removing any existing test container')
    execSilent(`docker rm -f ${WOOCOMMERCE_CONTAINER}`)

    logStep(TEST_NAME, 'Starting mock WooCommerce server on host')
    mockWooServer = createMockWooCommerceServer(WOOCOMMERCE_MOCK_PORT)
    await mockWooServer.start()
    mockWooServer.setAuthCredentials('ck_docker_test', 'cs_docker_test')
    mockWooServer.setProducts([
      createSampleProduct({ id: 1, name: 'Docker Test Product 1', price: '19.99', stock_status: 'instock', sku: 'DTP-001' }),
      createSampleProduct({ id: 2, name: 'Docker Test Product 2', price: '29.99', stock_status: 'outofstock', sku: 'DTP-002' }),
      createSampleProduct({ id: 3, name: 'Docker Test Product 3', price: '39.99', stock_status: 'instock', sku: 'DTP-003' })
    ])
    logStep(TEST_NAME, `Mock WooCommerce server started on port ${mockWooServer.port}`)
  }, 30000)

  afterAll(async () => {
    logStep(TEST_NAME, 'Cleanup: Removing test container')
    execSilent(`docker rm -f ${WOOCOMMERCE_CONTAINER}`)
    logStep(TEST_NAME, 'Cleanup: Stopping mock WooCommerce server')
    await mockWooServer.stop()
  }, 10000)

  it('builds image for WooCommerce integration test', () => {
    logStep(TEST_NAME, 'Building Docker image')
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
    logStep(TEST_NAME, 'Docker image built successfully')
  }, 120000)

  it('starts container with WooCommerce pointing to host mock server', async () => {
    logStep(TEST_NAME, 'Starting container with WooCommerce URL pointing to host.docker.internal')
    exec(`docker run -d \
      --name ${WOOCOMMERCE_CONTAINER} \
      -p ${WOOCOMMERCE_APP_PORT}:${WOOCOMMERCE_APP_PORT} \
      -e PORT=${WOOCOMMERCE_APP_PORT} \
      -e FAKE_GREENAPI_MODE=true \
      -e "TRIGGER_CODE=${TRIGGER_MESSAGE}" \
      -e GREEN_API_INSTANCE_ID=woo-test-instance \
      -e GREEN_API_TOKEN=woo-test-token \
      -e WOOCOMMERCE_STORE_URL=http://host.docker.internal:${WOOCOMMERCE_MOCK_PORT} \
      -e WOOCOMMERCE_CONSUMER_KEY=ck_docker_test \
      -e WOOCOMMERCE_CONSUMER_SECRET=cs_docker_test \
      -e LOG_LEVEL=info \
      ${IMAGE_NAME}`)

    logStep(TEST_NAME, 'Waiting for container to become healthy')
    const healthy = await waitForHealthy(`http://localhost:${WOOCOMMERCE_APP_PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${WOOCOMMERCE_CONTAINER}`)
      console.error('Container logs:', logs)
    }
    
    logStep(TEST_NAME, healthy ? 'Container is healthy' : 'Container health check FAILED')
    expect(healthy).toBe(true)
  }, 30000)

  it('Step 1: Send trigger message - receives interactive buttons', async () => {
    logStep(TEST_NAME, `Sending trigger message "${TRIGGER_MESSAGE}"`)
    
    const response = await fetch(`http://localhost:${WOOCOMMERCE_APP_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload(TRIGGER_MESSAGE, CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, 'Trigger message processed successfully')

    await new Promise(resolve => setTimeout(resolve, 500))

    logStep(TEST_NAME, 'Checking container logs for button response')
    const logs = exec(`docker logs ${WOOCOMMERCE_CONTAINER}`)
    
    expect(logs).toContain('FAKE_GREENAPI_SEND_BUTTONS')
    expect(logs).toContain('List Products')
    logStep(TEST_NAME, 'Verified interactive buttons were sent')
  }, 10000)

  it('Step 2: Click "List" - fetches products from mock WooCommerce server', async () => {
    logStep(TEST_NAME, 'Sending "list" to trigger listProducts action')
    
    const response = await fetch(`http://localhost:${WOOCOMMERCE_APP_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('list', CHAT_ID))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.handled).toBe(true)
    logStep(TEST_NAME, '"List" command processed successfully')

    await new Promise(resolve => setTimeout(resolve, 1000))

    logStep(TEST_NAME, 'Checking container logs for WooCommerce product fetch')
    const logs = exec(`docker logs ${WOOCOMMERCE_CONTAINER}`)
    
    expect(logs).toContain('action_triggered')
    expect(logs).toContain('listProducts')
    expect(logs).toContain('woocommerce_get_products_start')
    expect(logs).toContain('woocommerce_get_products_success')
    expect(logs).toContain('list_products_fetched')
    expect(logs).toContain('"count":3')
    logStep(TEST_NAME, 'Verified WooCommerce products were fetched (3 products)')

    logStep(TEST_NAME, 'Checking mock server received the request')
    const requestLog = mockWooServer.getRequestLog()
    expect(requestLog.length).toBeGreaterThan(0)
    const productRequest = requestLog.find(r => r.url.includes('/wp-json/wc/v3/products'))
    expect(productRequest).toBeDefined()
    expect(productRequest?.headers.authorization).toContain('Basic')
    logStep(TEST_NAME, 'Verified mock server received authenticated product request')

    logStep(TEST_NAME, 'Checking response contains product names')
    expect(logs).toContain('Docker Test Product 1')
    expect(logs).toContain('Docker Test Product 2')
    expect(logs).toContain('Docker Test Product 3')
    logStep(TEST_NAME, 'WooCommerce integration test completed successfully!')
  }, 15000)
})

describe('Docker: Production Env Health (docker-test:prod-env-health)', () => {
  const TEST_NAME = 'PROD-ENV-HEALTH'
  const ENV_FILE_PATH = '.env'

  beforeAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing any existing test container')
    execSilent(`docker rm -f ${PROD_ENV_CONTAINER}`)

    if (!existsSync(ENV_FILE_PATH)) {
      throw new Error('.env file not found - this test requires real environment variables')
    }
    logStep(TEST_NAME, 'Verified .env file exists')
  }, 10000)

  afterAll(() => {
    logStep(TEST_NAME, 'Cleanup: Removing test container')
    execSilent(`docker rm -f ${PROD_ENV_CONTAINER}`)
  }, 10000)

  it('builds production image with real env vars', () => {
    logStep(TEST_NAME, 'Building Docker production image')
    expect(() => {
      execSync(`docker build -t ${IMAGE_NAME} .`, { stdio: 'inherit' })
    }).not.toThrow()
    logStep(TEST_NAME, 'Docker image built successfully')
  }, 120000)

  it('starts container with real .env and health check passes', async () => {
    logStep(TEST_NAME, 'Starting container with real .env file (MOCK_MODE=true for safety)')
    exec(`docker run -d \
      --name ${PROD_ENV_CONTAINER} \
      --env-file ${ENV_FILE_PATH} \
      -p ${PROD_ENV_PORT}:${PROD_ENV_PORT} \
      -e PORT=${PROD_ENV_PORT} \
      -e MOCK_MODE=true \
      ${IMAGE_NAME}`)

    logStep(TEST_NAME, 'Waiting for container to become healthy')
    const healthy = await waitForHealthy(`http://localhost:${PROD_ENV_PORT}/health`, 15000)
    
    if (!healthy) {
      const logs = exec(`docker logs ${PROD_ENV_CONTAINER}`)
      console.error('Container logs:', logs)
    }
    
    logStep(TEST_NAME, healthy ? 'Container is healthy with real env vars' : 'Container health check FAILED')
    expect(healthy).toBe(true)
  }, 30000)

  it('health endpoint returns correct response', async () => {
    logStep(TEST_NAME, 'Testing /health endpoint response')
    const response = await fetch(`http://localhost:${PROD_ENV_PORT}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('status', 'ok')
    expect(body).toHaveProperty('timestamp')
    logStep(TEST_NAME, 'Health endpoint returned status: ok')
  }, 5000)

  it('webhook endpoint accepts trigger message', async () => {
    logStep(TEST_NAME, 'Testing /webhook endpoint with trigger message')
    const response = await fetch(`http://localhost:${PROD_ENV_PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createWebhookPayload('test-shop', 'prod-env-test@c.us'))
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('ok', true)
    expect(body).toHaveProperty('handled', true)
    logStep(TEST_NAME, 'Webhook accepted trigger and responded correctly (MOCK_MODE - no actual API call)')
    logStep(TEST_NAME, 'Production env health test completed successfully!')
  }, 5000)
})
