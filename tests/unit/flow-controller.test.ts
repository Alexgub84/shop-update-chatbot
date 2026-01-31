import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFlowController, type MessageInput } from '../../src/conversation/flow-controller.js'
import type { FlowDefinition, MemoryManager, Session } from '../../src/conversation/types.js'
import type { WooCommerceClient, WooProduct } from '../../src/woocommerce/types.js'

function textMsg(content: string): MessageInput {
  return { type: 'text', content }
}

function imageMsg(url: string, mimeType?: string): MessageInput {
  return { type: 'image', content: url, mimeType }
}

describe('FlowController', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any

  function createMockWooCommerce(products: WooProduct[] = []): WooCommerceClient {
    return {
      getProducts: vi.fn().mockResolvedValue(products),
      getProductBySku: vi.fn().mockResolvedValue(null),
      createProduct: vi.fn().mockImplementation(async (input) => {
        const slug = input.name.toLowerCase().replace(/\s+/g, '-')
        return {
          id: 123,
          name: input.name,
          slug,
          permalink: `https://test-store.com/product/${slug}/`,
          price: input.regular_price,
          regular_price: input.regular_price,
          sale_price: '',
          stock_status: 'instock',
          stock_quantity: input.stock_quantity,
          status: 'publish',
          description: input.description || '',
          short_description: '',
          sku: input.sku || 'test-sku'
        }
      })
    }
  }

  const testFlow: FlowDefinition = {
    id: 'test',
    initialStep: 'awaiting_trigger',
    sessionTimeoutMs: 300000,
    steps: {
      awaiting_trigger: {
        type: 'trigger',
        onMatch: { nextStep: 'awaiting_intent', messageKey: 'welcome' },
        onNoMatch: { handled: false }
      },
      awaiting_intent: {
        type: 'choice',
        responseType: 'text',
        messageKey: 'intent_prompt',
        options: [
          { id: 'list', label: 'List Products', aliases: ['1', 'list'] },
          { id: 'add', label: 'Add New Product', aliases: ['2', 'add'] }
        ],
        transitions: {
          list: { nextStep: 'list_products' },
          add: { nextStep: 'add_product' }
        },
        onInvalid: { messageKey: 'invalid_choice', nextStep: 'awaiting_intent' }
      },
      list_products: {
        type: 'action',
        action: 'listProducts',
        nextStep: 'awaiting_intent'
      },
      add_product: {
        type: 'input',
        messageKey: 'add_product_prompt',
        contextKey: 'productInput',
        nextStep: 'awaiting_product_image'
      },
      awaiting_product_image: {
        type: 'imageInput',
        messageKey: 'add_product_image_prompt',
        contextKey: 'productImage',
        nextStep: 'process_add_product',
        optional: true,
        skipKeyword: 'skip'
      },
      process_add_product: {
        type: 'action',
        action: 'addProduct',
        nextStep: 'awaiting_intent'
      }
    }
  }

  const testMessages = {
    welcome: 'Welcome!',
    intent_prompt: 'Choose: 1 or 2',
    invalid_choice: 'Invalid choice',
    add_product_prompt: 'Let\'s add a new product!\n\nProvide details:\nName:\nPrice:\nStock:\n\nThen you can add an image.',
    add_product_received: 'Product "{name}" added successfully!',
    add_product_missing_fields: 'Please provide the missing fields:\n\n{missing_fields}',
    add_product_current_values: 'Current values:\n{current_values}',
    add_product_cancelled: 'Product creation cancelled.',
    add_product_image_prompt: 'Now send a product image. Send "skip" to continue without.',
    add_product_image_received: 'Image received!',
    add_product_image_skipped: 'No image added.',
    add_product_image_invalid: 'Please send an image or type "skip".',
    validation_error_name: 'Name must not be empty',
    validation_error_price: 'Price must be a valid number (e.g., 29.99)',
    validation_error_stock: 'Stock must be a whole number (e.g., 10)'
  }

  function createMockMemory(): MemoryManager & { sessions: Map<string, Session> } {
    const sessions = new Map<string, Session>()
    return {
      sessions,
      get: vi.fn((chatId: string) => sessions.get(chatId)),
      set: vi.fn((chatId: string, session: Session) => {
        sessions.set(chatId, session)
      }),
      delete: vi.fn((chatId: string) => {
        sessions.delete(chatId)
      }),
      cleanup: vi.fn(),
      createSession: vi.fn((chatId: string, initialStep: string) => ({
        chatId,
        currentStep: initialStep,
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 300000
      }))
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trigger step', () => {
    it('should create session on trigger match and return buttons', async () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'start',
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('start'))

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('Welcome!')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
      expect(result.buttons?.options).toHaveLength(2)
      expect(result.buttons?.options[0].buttonText).toBe('List Products')
      expect(result.buttons?.options[1].buttonText).toBe('Add New Product')
      expect(memory.createSession).toHaveBeenCalledWith('chat123', 'awaiting_intent')
      expect(memory.set).toHaveBeenCalled()
    })

    it('should match trigger case-insensitively', async () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'START',
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('  start  '))

      expect(result.handled).toBe(true)
    })

    it('should not handle when trigger does not match', async () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'start',
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('hello'))

      expect(result.handled).toBe(false)
      expect(memory.createSession).not.toHaveBeenCalled()
    })

    it('should match any message when no trigger code set', async () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('anything'))

      expect(result.handled).toBe(true)
    })
  })

  describe('choice step', () => {
    it('should show not configured when wooCommerce not provided', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('list'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toBe('[WooCommerce not configured]')
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
    })

    it('should fetch products when wooCommerce is configured', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const mockProducts: WooProduct[] = [
        { id: 1, name: 'Product A', slug: 'a', permalink: 'https://test-store.com/product/a/', price: '10.00', regular_price: '10.00', sale_price: '', stock_status: 'instock', stock_quantity: 5, status: 'publish', description: '', short_description: '', sku: 'A' },
        { id: 2, name: 'Product B', slug: 'b', permalink: 'https://test-store.com/product/b/', price: '20.00', regular_price: '20.00', sale_price: '', stock_status: 'outofstock', stock_quantity: 0, status: 'publish', description: '', short_description: '', sku: 'B' }
      ]
      const wooCommerce = createMockWooCommerce(mockProducts)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger,
        wooCommerce
      })

      const result = await controller.process('chat123', textMsg('list'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toContain('Products (2)')
      expect(result.preMessage).toContain('Product A')
      expect(result.preMessage).toContain('Product B')
      expect(result.buttons).toBeDefined()
      expect(wooCommerce.getProducts).toHaveBeenCalledWith(20)
    })

    it('should transition on valid alias', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('1'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toBe('[WooCommerce not configured]')
      expect(result.buttons).toBeDefined()
    })

    it('should match alias case-insensitively', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('LIST'))

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
    })

    it('should return buttons with invalid message on unrecognized input', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('invalid'))

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('Invalid choice')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
    })

    it('should stay on same step after invalid input', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      await controller.process('chat123', textMsg('invalid'))

      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
    })
  })

  describe('action step', () => {
    it('should execute action and return to next step', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      await controller.process('chat123', textMsg('1'))

      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
    })

    it('should transition to input step when add is selected', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('2'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('add a new product')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('add_product')
    })

    it('should process product input and transition to image step', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger,
        wooCommerce: createMockWooCommerce()
      })

      const result = await controller.process('chat123', textMsg('Name: Test Product\nPrice: 19.99\nStock: 5'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('send a product image')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_product_image')
    })

    it('should reject invalid price and ask again', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('Name: Test Product\nPrice: abc\nStock: 5'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('Price must be a valid number')
      expect(result.response).toContain('Name: Test Product')
      expect(result.response).toContain('Stock: 5')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('add_product')
    })

    it('should reject invalid stock and ask again', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('Name: Test Product\nPrice: 19.99\nStock: -5'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('Stock must be a whole number')
      expect(result.response).toContain('Name: Test Product')
      expect(result.response).toContain('Price: 19.99')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('add_product')
    })

    it('should ask for missing fields when partial input provided', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('Name: Test Product'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('Name: Test Product')
      expect(result.response).toContain('Price: 29.99')
      expect(result.response).toContain('Stock: 10')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('add_product')
    })

    it('should remember values across multiple inputs', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      session.context.productData = { name: 'Existing Product', price: 10.00 }
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger,
        wooCommerce: createMockWooCommerce()
      })

      const result = await controller.process('chat123', textMsg('Stock: 15'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('send a product image')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_product_image')
    })

    it('should cancel add product when stop is sent', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      session.context.productData = { name: 'Partial Product', price: 10.00 }
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('stop'))

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('Product creation cancelled.')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
      expect(updatedSession?.context.productData).toBeUndefined()
    })

    it('should cancel with STOP (case insensitive)', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'add_product')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('  STOP  '))

      expect(result.handled).toBe(true)
      expect(result.buttons?.header).toBe('Product creation cancelled.')
    })
  })

  describe('session handling', () => {
    it('should use existing session for returning user', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'start',
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('1'))

      expect(result.handled).toBe(true)
      expect(memory.createSession).toHaveBeenCalledTimes(1)
    })

    it('should delete session on invalid step', async () => {
      const memory = createMockMemory()
      const session: Session = {
        chatId: 'chat123',
        currentStep: 'nonexistent_step',
        context: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 300000
      }
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('anything'))

      expect(result.handled).toBe(false)
      expect(memory.delete).toHaveBeenCalledWith('chat123')
    })
  })

  describe('image input step', () => {
    const testFlowWithImage: FlowDefinition = {
      ...testFlow,
      steps: {
        ...testFlow.steps,
        add_product: {
          type: 'input',
          messageKey: 'add_product_prompt',
          contextKey: 'productInput',
          nextStep: 'awaiting_product_image'
        },
        awaiting_product_image: {
          type: 'imageInput',
          messageKey: 'add_product_image_prompt',
          contextKey: 'productImage',
          nextStep: 'process_add_product',
          optional: true,
          skipKeyword: 'skip'
        }
      }
    }

    const testMessagesWithImage = {
      ...testMessages,
      add_product_image_prompt: 'Now send a product image. Send "skip" to continue without.',
      add_product_image_received: 'Image received!',
      add_product_image_skipped: 'No image added.',
      add_product_image_invalid: 'Please send an image or type "skip".',
      add_product_error: 'Failed to add product.',
      error_image_upload: 'Could not upload the product image. The image URL may be invalid.'
    }

    it('should accept image and create product with image', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_product_image')
      session.context.productData = { name: 'Test Product', price: 19.99, stock: 5 }
      memory.sessions.set('chat123', session)

      const mockWoo = createMockWooCommerce()
      const controller = createFlowController({
        memory,
        flow: testFlowWithImage,
        messages: testMessagesWithImage,
        logger: mockLogger,
        wooCommerce: mockWoo
      })

      const result = await controller.process('chat123', imageMsg('https://example.com/image.jpg', 'image/jpeg'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toContain('Image received!')
      expect(result.preMessage).toContain('added successfully')
      expect(mockWoo.createProduct).toHaveBeenCalledWith(expect.objectContaining({
        images: [{ src: 'https://example.com/image.jpg', name: 'Test Product' }]
      }))
    })

    it('should skip image when skip keyword is sent', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_product_image')
      session.context.productData = { name: 'Test Product', price: 19.99, stock: 5 }
      memory.sessions.set('chat123', session)

      const mockWoo = createMockWooCommerce()
      const controller = createFlowController({
        memory,
        flow: testFlowWithImage,
        messages: testMessagesWithImage,
        logger: mockLogger,
        wooCommerce: mockWoo
      })

      const result = await controller.process('chat123', textMsg('skip'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toContain('added successfully')
      expect(mockWoo.createProduct).toHaveBeenCalledWith(expect.not.objectContaining({
        images: expect.anything()
      }))
    })

    it('should cancel when stop is sent during image input', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_product_image')
      session.context.productData = { name: 'Test Product', price: 19.99, stock: 5 }
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlowWithImage,
        messages: testMessagesWithImage,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('stop'))

      expect(result.handled).toBe(true)
      expect(result.buttons?.header).toBe('Product creation cancelled.')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
      expect(updatedSession?.context.productData).toBeUndefined()
    })

    it('should reject invalid text and ask for image again', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_product_image')
      session.context.productData = { name: 'Test Product', price: 19.99, stock: 5 }
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlowWithImage,
        messages: testMessagesWithImage,
        logger: mockLogger
      })

      const result = await controller.process('chat123', textMsg('hello'))

      expect(result.handled).toBe(true)
      expect(result.response).toContain('Please send an image')
      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_product_image')
    })

    it('should show error message when image upload fails', async () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_product_image')
      session.context.productData = { name: 'Test Product', price: 19.99, stock: 5 }
      memory.sessions.set('chat123', session)

      const { WooCommerceError } = await import('../../src/errors.js')
      const mockWooWithError: WooCommerceClient = {
        getProducts: vi.fn(),
        getProductBySku: vi.fn(),
        createProduct: vi.fn().mockRejectedValue(
          new WooCommerceError('Error getting remote image', 400, 'image_upload_error')
        )
      }

      const controller = createFlowController({
        memory,
        flow: testFlowWithImage,
        messages: testMessagesWithImage,
        logger: mockLogger,
        wooCommerce: mockWooWithError
      })

      const result = await controller.process('chat123', imageMsg('https://bad-url.com/image.jpg'))

      expect(result.handled).toBe(true)
      expect(result.preMessage).toContain('Image received!')
      expect(result.preMessage).toContain('Failed to add product')
      expect(result.preMessage).toContain('Could not upload the product image')
    })
  })
})
