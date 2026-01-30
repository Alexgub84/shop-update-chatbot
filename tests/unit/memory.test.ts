import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInMemoryManager } from '../../src/conversation/memory.js'

describe('InMemoryManager', () => {
  const TIMEOUT_MS = 5000

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createSession', () => {
    it('should create session with correct initial values', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const now = Date.now()

      const session = memory.createSession('chat123', 'awaiting_trigger')

      expect(session.chatId).toBe('chat123')
      expect(session.currentStep).toBe('awaiting_trigger')
      expect(session.context).toEqual({})
      expect(session.createdAt).toBe(now)
      expect(session.updatedAt).toBe(now)
      expect(session.expiresAt).toBe(now + TIMEOUT_MS)
    })
  })

  describe('set and get', () => {
    it('should store and retrieve session', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')

      memory.set('chat123', session)
      const retrieved = memory.get('chat123')

      expect(retrieved).toBeDefined()
      expect(retrieved?.chatId).toBe('chat123')
    })

    it('should return undefined for non-existent session', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)

      const retrieved = memory.get('nonexistent')

      expect(retrieved).toBeUndefined()
    })

    it('should update timestamps on set', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')
      memory.set('chat123', session)

      vi.advanceTimersByTime(1000)
      const newTime = Date.now()

      session.currentStep = 'awaiting_intent'
      memory.set('chat123', session)

      const retrieved = memory.get('chat123')
      expect(retrieved?.updatedAt).toBe(newTime)
      expect(retrieved?.expiresAt).toBe(newTime + TIMEOUT_MS)
    })
  })

  describe('expiration', () => {
    it('should return undefined for expired session', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')
      memory.set('chat123', session)

      vi.advanceTimersByTime(TIMEOUT_MS + 1)

      const retrieved = memory.get('chat123')
      expect(retrieved).toBeUndefined()
    })

    it('should return session that has not expired', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')
      memory.set('chat123', session)

      vi.advanceTimersByTime(TIMEOUT_MS - 1)

      const retrieved = memory.get('chat123')
      expect(retrieved).toBeDefined()
    })

    it('should delete expired session from storage on get', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')
      memory.set('chat123', session)

      vi.advanceTimersByTime(TIMEOUT_MS + 1)
      const firstGet = memory.get('chat123')
      expect(firstGet).toBeUndefined()

      memory.set('chat123', memory.createSession('chat123', 'new_step'))
      const secondGet = memory.get('chat123')
      expect(secondGet?.currentStep).toBe('new_step')
    })
  })

  describe('delete', () => {
    it('should remove session', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)
      const session = memory.createSession('chat123', 'awaiting_trigger')
      memory.set('chat123', session)

      memory.delete('chat123')

      expect(memory.get('chat123')).toBeUndefined()
    })

    it('should not throw when deleting non-existent session', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)

      expect(() => memory.delete('nonexistent')).not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('should remove all expired sessions', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)

      const session1 = memory.createSession('chat1', 'awaiting_trigger')
      memory.set('chat1', session1)

      vi.advanceTimersByTime(2000)
      const session2 = memory.createSession('chat2', 'awaiting_trigger')
      memory.set('chat2', session2)

      vi.advanceTimersByTime(TIMEOUT_MS - 1000)
      memory.cleanup()

      expect(memory.get('chat1')).toBeUndefined()
      expect(memory.get('chat2')).toBeDefined()
    })

    it('should keep all sessions when none are expired', () => {
      const memory = createInMemoryManager(TIMEOUT_MS)

      const session1 = memory.createSession('chat1', 'awaiting_trigger')
      const session2 = memory.createSession('chat2', 'awaiting_trigger')
      memory.set('chat1', session1)
      memory.set('chat2', session2)

      memory.cleanup()

      expect(memory.get('chat1')).toBeDefined()
      expect(memory.get('chat2')).toBeDefined()
    })
  })
})
