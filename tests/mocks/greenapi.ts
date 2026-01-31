import { vi } from 'vitest'
import type { GreenApiSender } from '../../src/greenapi/sender.js'

export function createMockSender(): GreenApiSender & { 
  sendMessage: ReturnType<typeof vi.fn>
  sendButtons: ReturnType<typeof vi.fn>
} {
  return {
    sendMessage: vi.fn().mockResolvedValue({ idMessage: 'mock-msg-id' }),
    sendButtons: vi.fn().mockResolvedValue({ idMessage: 'mock-btn-id' })
  }
}

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
  } as any
}

export function createValidWebhookPayload(text: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: '123456789@c.us' },
    senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: text }
    },
    idMessage: 'ABC123'
  }
}

export function createImageWebhookPayload(url = 'https://example.com/image.jpg', mimeType = 'image/jpeg') {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: '123456789@c.us' },
    senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
    messageData: {
      typeMessage: 'imageMessage',
      fileMessageData: { downloadUrl: url, mimeType }
    },
    idMessage: 'ABC123'
  }
}

export function createButtonsResponsePayload(buttonId: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: '123456789@c.us' },
    senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
    messageData: {
      typeMessage: 'buttonsResponseMessage',
      buttonsResponseMessage: {
        selectedButtonId: buttonId,
        selectedButtonText: 'Button Text',
        stanzaId: 'original-msg-id'
      }
    },
    idMessage: 'ABC123'
  }
}

export function createInteractiveButtonsResponsePayload(buttonId: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: '123456789@c.us' },
    senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
    messageData: {
      typeMessage: 'interactiveButtonsResponse',
      interactiveButtonsResponse: {
        selectedButtonId: buttonId,
        selectedButtonText: 'Button Text'
      }
    },
    idMessage: 'ABC123'
  }
}

export function createTemplateButtonReplyPayload(buttonId: string, buttonText?: string) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 123, wid: '123456789@c.us' },
    senderData: { chatId: '987654321@c.us', sender: '987654321@c.us' },
    messageData: {
      typeMessage: 'templateButtonsReplyMessage',
      templateButtonReplyMessage: {
        selectedId: buttonId,
        selectedDisplayText: buttonText ?? 'Button Text',
        selectedIndex: 0,
        stanzaId: 'original-msg-id'
      }
    },
    idMessage: 'ABC123'
  }
}
