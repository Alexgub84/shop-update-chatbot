import { z } from 'zod'

export const fileMessageDataSchema = z.object({
  downloadUrl: z.string(),
  caption: z.string().optional(),
  mimeType: z.string().optional(),
  jpegThumbnail: z.string().optional(),
  isForwarded: z.boolean().optional(),
  forwardingScore: z.number().optional()
})

export const incomingMessageSchema = z.object({
  typeWebhook: z.string(),
  instanceData: z.object({
    idInstance: z.number(),
    wid: z.string()
  }),
  senderData: z.object({
    chatId: z.string(),
    sender: z.string()
  }),
  messageData: z.object({
    typeMessage: z.string(),
    textMessageData: z.object({
      textMessage: z.string()
    }).optional(),
    buttonsResponseMessage: z.object({
      selectedButtonId: z.string().optional(),
      selectedButtonText: z.string().optional(),
      stanzaId: z.string().optional()
    }).optional(),
    interactiveButtonsResponse: z.object({
      selectedButtonId: z.string().optional(),
      selectedButtonText: z.string().optional()
    }).optional(),
    templateButtonReplyMessage: z.object({
      selectedId: z.string().optional(),
      selectedDisplayText: z.string().optional(),
      selectedIndex: z.number().optional(),
      stanzaId: z.string().optional()
    }).optional(),
    fileMessageData: fileMessageDataSchema.optional()
  }),
  idMessage: z.string()
})

export type IncomingMessage = z.infer<typeof incomingMessageSchema>
export type FileMessageData = z.infer<typeof fileMessageDataSchema>

export interface ExtractedMessage {
  type: 'text' | 'image'
  content: string
  mimeType?: string
}

export function extractMessageContent(payload: IncomingMessage): ExtractedMessage | null {
  const { typeMessage } = payload.messageData

  if (typeMessage === 'textMessage') {
    const text = payload.messageData.textMessageData?.textMessage ?? null
    if (!text) return null
    return { type: 'text', content: text }
  }

  if (typeMessage === 'buttonsResponseMessage') {
    const data = payload.messageData.buttonsResponseMessage
    const content = data?.selectedButtonId ?? data?.selectedButtonText ?? null
    if (!content) return null
    return { type: 'text', content }
  }

  if (typeMessage === 'interactiveButtonsResponse') {
    const data = payload.messageData.interactiveButtonsResponse
    const content = data?.selectedButtonId ?? data?.selectedButtonText ?? null
    if (!content) return null
    return { type: 'text', content }
  }

  if (typeMessage === 'templateButtonsReplyMessage') {
    const data = payload.messageData.templateButtonReplyMessage
    const content = data?.selectedId ?? data?.selectedDisplayText ?? null
    if (!content) return null
    return { type: 'text', content }
  }

  if (typeMessage === 'imageMessage') {
    const fileData = payload.messageData.fileMessageData
    if (!fileData?.downloadUrl) return null
    return {
      type: 'image',
      content: fileData.downloadUrl,
      mimeType: fileData.mimeType
    }
  }

  return null
}
