import type { Session, StepId, MemoryManager } from './types.js'

export function createInMemoryManager(timeoutMs: number): MemoryManager {
  const sessions = new Map<string, Session>()

  function isExpired(session: Session): boolean {
    return Date.now() > session.expiresAt
  }

  function get(chatId: string): Session | undefined {
    const session = sessions.get(chatId)
    if (!session) {
      return undefined
    }
    if (isExpired(session)) {
      sessions.delete(chatId)
      return undefined
    }
    return session
  }

  function set(chatId: string, session: Session): void {
    const now = Date.now()
    session.updatedAt = now
    session.expiresAt = now + timeoutMs
    sessions.set(chatId, session)
  }

  function deleteSession(chatId: string): void {
    sessions.delete(chatId)
  }

  function cleanup(): void {
    const now = Date.now()
    for (const [chatId, session] of sessions) {
      if (now > session.expiresAt) {
        sessions.delete(chatId)
      }
    }
  }

  function createSession(chatId: string, initialStep: StepId): Session {
    const now = Date.now()
    return {
      chatId,
      currentStep: initialStep,
      context: {},
      createdAt: now,
      updatedAt: now,
      expiresAt: now + timeoutMs
    }
  }

  return {
    get,
    set,
    delete: deleteSession,
    cleanup,
    createSession
  }
}
