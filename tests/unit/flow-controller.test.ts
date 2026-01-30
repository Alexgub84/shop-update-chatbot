import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFlowController } from '../../src/conversation/flow-controller.js'
import type { FlowDefinition, MemoryManager, Session } from '../../src/conversation/types.js'

describe('FlowController', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any

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
        type: 'action',
        action: 'addProduct',
        nextStep: 'awaiting_intent'
      }
    }
  }

  const testMessages = {
    welcome: 'Welcome!',
    intent_prompt: 'Choose: 1 or 2',
    invalid_choice: 'Invalid choice'
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
    it('should create session on trigger match and return buttons', () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'start',
        logger: mockLogger
      })

      const result = controller.process('chat123', 'start')

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

    it('should match trigger case-insensitively', () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'START',
        logger: mockLogger
      })

      const result = controller.process('chat123', '  start  ')

      expect(result.handled).toBe(true)
    })

    it('should not handle when trigger does not match', () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        triggerCode: 'start',
        logger: mockLogger
      })

      const result = controller.process('chat123', 'hello')

      expect(result.handled).toBe(false)
      expect(memory.createSession).not.toHaveBeenCalled()
    })

    it('should match any message when no trigger code set', () => {
      const memory = createMockMemory()
      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', 'anything')

      expect(result.handled).toBe(true)
    })
  })

  describe('choice step', () => {
    it('should transition on valid option id and return buttons after action', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', 'list')

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('[Action: listProducts]')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
    })

    it('should transition on valid alias', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', '1')

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('[Action: listProducts]')
    })

    it('should match alias case-insensitively', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', 'LIST')

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
    })

    it('should return buttons with invalid message on unrecognized input', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', 'invalid')

      expect(result.handled).toBe(true)
      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('Invalid choice')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
    })

    it('should stay on same step after invalid input', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      controller.process('chat123', 'invalid')

      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
    })
  })

  describe('action step', () => {
    it('should execute action and return to next step', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      controller.process('chat123', '1')

      const updatedSession = memory.sessions.get('chat123')
      expect(updatedSession?.currentStep).toBe('awaiting_intent')
    })

    it('should include action header and next step buttons in response', () => {
      const memory = createMockMemory()
      const session = memory.createSession('chat123', 'awaiting_intent')
      memory.sessions.set('chat123', session)

      const controller = createFlowController({
        memory,
        flow: testFlow,
        messages: testMessages,
        logger: mockLogger
      })

      const result = controller.process('chat123', '2')

      expect(result.buttons).toBeDefined()
      expect(result.buttons?.header).toBe('[Action: addProduct]')
      expect(result.buttons?.body).toBe('Choose: 1 or 2')
      expect(result.buttons?.options).toHaveLength(2)
    })
  })

  describe('session handling', () => {
    it('should use existing session for returning user', () => {
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

      const result = controller.process('chat123', '1')

      expect(result.handled).toBe(true)
      expect(memory.createSession).toHaveBeenCalledTimes(1)
    })

    it('should delete session on invalid step', () => {
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

      const result = controller.process('chat123', 'anything')

      expect(result.handled).toBe(false)
      expect(memory.delete).toHaveBeenCalledWith('chat123')
    })
  })
})
