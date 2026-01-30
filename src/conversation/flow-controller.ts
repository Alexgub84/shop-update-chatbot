import type { Logger } from '../logger.js'
import type {
  FlowDefinition,
  FlowResult,
  FlowButtons,
  MemoryManager,
  Session,
  ChoiceStep,
  TriggerStep,
  ActionStep,
  Step
} from './types.js'

export interface FlowControllerDeps {
  memory: MemoryManager
  flow: FlowDefinition
  messages: Record<string, string>
  triggerCode?: string
  logger: Logger
}

export interface FlowController {
  process(chatId: string, messageText: string): FlowResult
}

export function createFlowController(dependencies: FlowControllerDeps): FlowController {
  const { memory, flow, messages, triggerCode, logger } = dependencies

  function isTriggerMatch(text: string): boolean {
    if (!triggerCode) {
      return true
    }
    return text.trim().toLowerCase() === triggerCode.toLowerCase()
  }

  function getMessage(key: string): string {
    return messages[key] ?? `[Missing message: ${key}]`
  }

  function buildButtonsFromChoice(step: ChoiceStep): FlowButtons {
    return {
      body: getMessage(step.messageKey),
      options: step.options.map(opt => ({
        buttonId: opt.id,
        buttonText: opt.label
      }))
    }
  }

  function isChoiceStep(step: Step | undefined): step is ChoiceStep {
    return step?.type === 'choice'
  }

  function matchChoiceOption(step: ChoiceStep, input: string): string | undefined {
    const normalizedInput = input.trim().toLowerCase()
    for (const option of step.options) {
      if (option.id === normalizedInput) {
        return option.id
      }
      for (const alias of option.aliases) {
        if (alias.toLowerCase() === normalizedInput) {
          return option.id
        }
      }
    }
    return undefined
  }

  function processTriggerStep(
    chatId: string,
    messageText: string,
    step: TriggerStep
  ): FlowResult {
    if (!isTriggerMatch(messageText)) {
      logger.info({ event: 'trigger_no_match', chatId })
      return { handled: step.onNoMatch.handled }
    }

    logger.info({ event: 'trigger_matched', chatId })

    const session = memory.createSession(chatId, step.onMatch.nextStep)
    memory.set(chatId, session)

    const nextStep = flow.steps[step.onMatch.nextStep]
    const welcomeMessage = step.onMatch.messageKey ? getMessage(step.onMatch.messageKey) : undefined

    if (isChoiceStep(nextStep)) {
      const buttons = buildButtonsFromChoice(nextStep)
      if (welcomeMessage) {
        buttons.header = welcomeMessage
      }
      return {
        handled: true,
        buttons
      }
    }

    const responseMessages: string[] = []
    if (welcomeMessage) {
      responseMessages.push(welcomeMessage)
    }
    if (nextStep && 'messageKey' in nextStep && nextStep.messageKey) {
      responseMessages.push(getMessage(nextStep.messageKey))
    }

    return {
      handled: true,
      response: responseMessages.join('\n\n')
    }
  }

  function processChoiceStep(
    chatId: string,
    messageText: string,
    session: Session,
    step: ChoiceStep
  ): FlowResult {
    const matchedOption = matchChoiceOption(step, messageText)

    if (!matchedOption) {
      logger.info({ event: 'choice_invalid', chatId, input: messageText })
      session.currentStep = step.onInvalid.nextStep
      memory.set(chatId, session)

      const invalidStep = flow.steps[step.onInvalid.nextStep]
      if (isChoiceStep(invalidStep)) {
        const buttons = buildButtonsFromChoice(invalidStep)
        buttons.header = getMessage(step.onInvalid.messageKey)
        return {
          handled: true,
          buttons
        }
      }

      return {
        handled: true,
        response: getMessage(step.onInvalid.messageKey)
      }
    }

    const transition = step.transitions[matchedOption]
    if (!transition) {
      logger.warn({ event: 'choice_no_transition', chatId, option: matchedOption })
      return {
        handled: true,
        response: getMessage(step.onInvalid.messageKey)
      }
    }

    logger.info({ event: 'choice_selected', chatId, option: matchedOption })

    session.currentStep = transition.nextStep
    memory.set(chatId, session)

    const nextStep = flow.steps[transition.nextStep]

    if (nextStep && nextStep.type === 'action') {
      return processActionStep(chatId, session, nextStep as ActionStep)
    }

    if (isChoiceStep(nextStep)) {
      const buttons = buildButtonsFromChoice(nextStep)
      if (transition.messageKey) {
        buttons.header = getMessage(transition.messageKey)
      }
      return {
        handled: true,
        buttons
      }
    }

    const responseMessages: string[] = []
    if (transition.messageKey) {
      responseMessages.push(getMessage(transition.messageKey))
    }
    if (nextStep && 'messageKey' in nextStep && nextStep.messageKey) {
      responseMessages.push(getMessage(nextStep.messageKey))
    }

    return {
      handled: true,
      response: responseMessages.length > 0 ? responseMessages.join('\n\n') : undefined
    }
  }

  function processActionStep(
    chatId: string,
    session: Session,
    step: ActionStep
  ): FlowResult {
    logger.info({ event: 'action_triggered', chatId, action: step.action })

    session.currentStep = step.nextStep
    memory.set(chatId, session)

    const nextStep = flow.steps[step.nextStep]

    if (isChoiceStep(nextStep)) {
      const buttons = buildButtonsFromChoice(nextStep)
      buttons.header = `[Action: ${step.action}]`
      return {
        handled: true,
        buttons
      }
    }

    if (nextStep && 'messageKey' in nextStep && nextStep.messageKey) {
      return {
        handled: true,
        response: `[Action: ${step.action}]\n\n${getMessage(nextStep.messageKey)}`
      }
    }

    return {
      handled: true,
      response: `[Action: ${step.action}]`
    }
  }

  function process(chatId: string, messageText: string): FlowResult {
    let session = memory.get(chatId)

    if (!session) {
      const triggerStep = flow.steps[flow.initialStep]
      if (triggerStep?.type !== 'trigger') {
        logger.error({ event: 'invalid_initial_step', chatId })
        return { handled: false }
      }
      return processTriggerStep(chatId, messageText, triggerStep as TriggerStep)
    }

    const currentStep = flow.steps[session.currentStep]
    if (!currentStep) {
      logger.error({ event: 'invalid_step', chatId, step: session.currentStep })
      memory.delete(chatId)
      return { handled: false }
    }

    switch (currentStep.type) {
      case 'trigger':
        return processTriggerStep(chatId, messageText, currentStep as TriggerStep)

      case 'choice':
        return processChoiceStep(chatId, messageText, session, currentStep as ChoiceStep)

      case 'action':
        return processActionStep(chatId, session, currentStep as ActionStep)

      default:
        logger.warn({ event: 'unhandled_step_type', chatId, type: currentStep.type })
        return { handled: false }
    }
  }

  return { process }
}
