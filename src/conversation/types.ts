export type StepId = string

export interface Session {
  chatId: string
  currentStep: StepId
  context: Record<string, unknown>
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export interface StepOption {
  id: string
  label: string
  aliases: string[]
}

export interface StepTransition {
  nextStep: StepId
  messageKey?: string
}

export interface BaseStep {
  type: 'trigger' | 'choice' | 'input' | 'action' | 'terminal'
}

export interface TriggerStep extends BaseStep {
  type: 'trigger'
  onMatch: { nextStep: StepId; messageKey?: string }
  onNoMatch: { handled: boolean }
}

export interface ChoiceStep extends BaseStep {
  type: 'choice'
  responseType: 'text' | 'buttons'
  messageKey: string
  options: StepOption[]
  transitions: Record<string, StepTransition>
  onInvalid: { messageKey: string; nextStep: StepId }
}

export interface InputStep extends BaseStep {
  type: 'input'
  messageKey: string
  contextKey: string
  nextStep: StepId
}

export interface ActionStep extends BaseStep {
  type: 'action'
  action: string
  nextStep: StepId
}

export interface TerminalStep extends BaseStep {
  type: 'terminal'
  messageKey?: string
}

export type Step = TriggerStep | ChoiceStep | InputStep | ActionStep | TerminalStep

export interface FlowDefinition {
  id: string
  initialStep: StepId
  sessionTimeoutMs: number
  steps: Record<StepId, Step>
}

export interface FlowButtonOption {
  buttonId: string
  buttonText: string
}

export interface FlowButtons {
  body: string
  options: FlowButtonOption[]
  header?: string
  footer?: string
}

export interface FlowResult {
  handled: boolean
  response?: string
  preMessage?: string
  buttons?: FlowButtons
  sessionEnded?: boolean
}

export interface MemoryManager {
  get(chatId: string): Session | undefined
  set(chatId: string, session: Session): void
  delete(chatId: string): void
  cleanup(): void
  createSession(chatId: string, initialStep: StepId): Session
}
