import { z } from 'zod'

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
    }).optional()
  }),
  idMessage: z.string()
})

export type IncomingMessage = z.infer<typeof incomingMessageSchema>

export function extractMessageContent(payload: IncomingMessage): string | null {
  const { typeMessage } = payload.messageData

  if (typeMessage === 'textMessage') {
    return payload.messageData.textMessageData?.textMessage ?? null
  }

  if (typeMessage === 'buttonsResponseMessage') {
    const data = payload.messageData.buttonsResponseMessage
    return data?.selectedButtonId ?? data?.selectedButtonText ?? null
  }

  if (typeMessage === 'interactiveButtonsResponse') {
    const data = payload.messageData.interactiveButtonsResponse
    return data?.selectedButtonId ?? data?.selectedButtonText ?? null
  }

  if (typeMessage === 'templateButtonsReplyMessage') {
    const data = payload.messageData.templateButtonReplyMessage
    return data?.selectedId ?? data?.selectedDisplayText ?? null
  }

  return null
}
