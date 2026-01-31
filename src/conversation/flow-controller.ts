import { randomUUID } from 'crypto'
import { WooCommerceError, type WooCommerceErrorCode } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'
import type { WooCommerceClient } from '../woocommerce/types.js'
import type { ExtractedMessage } from '../webhook/types.js'
import type {
  FlowDefinition,
  FlowResult,
  FlowButtons,
  MemoryManager,
  Session,
  ChoiceStep,
  TriggerStep,
  ActionStep,
  InputStep,
  ImageInputStep,
  Step
} from './types.js'

export interface FlowControllerDeps {
  memory: MemoryManager
  flow: FlowDefinition
  messages: Record<string, string>
  triggerCode?: string
  logger?: Logger
  wooCommerce?: WooCommerceClient
}

export interface MessageInput {
  type: 'text' | 'image'
  content: string
  mimeType?: string
}

export interface FlowController {
  process(chatId: string, message: MessageInput): Promise<FlowResult>
}

export function createFlowController(dependencies: FlowControllerDeps): FlowController {
  const { memory, flow, messages, triggerCode, wooCommerce } = dependencies
  const logger = dependencies.logger ?? createNoopLogger()

  function isTriggerMatch(message: MessageInput): boolean {
    if (message.type !== 'text') {
      return false
    }
    if (!triggerCode) {
      return true
    }
    return message.content.trim().toLowerCase() === triggerCode.toLowerCase()
  }

  function getMessage(key: string): string {
    return messages[key] ?? `[Missing message: ${key}]`
  }

  const errorCodeToMessageKey: Record<WooCommerceErrorCode, string> = {
    network_error: 'error_network',
    unauthorized: 'error_unauthorized',
    forbidden: 'error_forbidden',
    not_found: 'error_not_found',
    duplicate_sku: 'error_duplicate_sku',
    invalid_data: 'error_invalid_data',
    image_upload_error: 'error_image_upload',
    server_error: 'error_server',
    unknown: 'error_unknown'
  }

  function getErrorMessage(err: unknown): string {
    if (err instanceof WooCommerceError) {
      const messageKey = errorCodeToMessageKey[err.errorCode]
      return getMessage(messageKey)
    }
    return getMessage('error_unknown')
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
    message: MessageInput,
    step: TriggerStep
  ): FlowResult {
    if (!isTriggerMatch(message)) {
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

  async function processChoiceStep(
    chatId: string,
    message: MessageInput,
    session: Session,
    step: ChoiceStep
  ): Promise<FlowResult> {
    if (message.type !== 'text') {
      logger.info({ event: 'choice_invalid_type', chatId, type: message.type })
      const invalidStep = flow.steps[step.onInvalid.nextStep]
      if (isChoiceStep(invalidStep)) {
        const buttons = buildButtonsFromChoice(invalidStep)
        buttons.header = getMessage(step.onInvalid.messageKey)
        return { handled: true, buttons }
      }
      return { handled: true, response: getMessage(step.onInvalid.messageKey) }
    }

    const matchedOption = matchChoiceOption(step, message.content)

    if (!matchedOption) {
      logger.info({ event: 'choice_invalid', chatId, input: message.content })
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
      return await processActionStep(chatId, session, nextStep as ActionStep)
    }

    if (isInputStep(nextStep)) {
      const responseMessages: string[] = []
      if (transition.messageKey) {
        responseMessages.push(getMessage(transition.messageKey))
      }
      responseMessages.push(getMessage(nextStep.messageKey))
      return {
        handled: true,
        response: responseMessages.join('\n\n')
      }
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

  function isInputStep(step: Step | undefined): step is InputStep {
    return step?.type === 'input'
  }

  function isImageInputStep(step: Step | undefined): step is ImageInputStep {
    return step?.type === 'imageInput'
  }

  async function processInputStep(
    chatId: string,
    message: MessageInput,
    session: Session,
    step: InputStep
  ): Promise<FlowResult> {
    logger.info({ event: 'input_received', chatId, contextKey: step.contextKey, type: message.type })

    if (message.type !== 'text') {
      logger.info({ event: 'input_invalid_type', chatId, type: message.type })
      return {
        handled: true,
        response: getMessage(step.messageKey)
      }
    }

    const messageText = message.content

    if (messageText.trim().toLowerCase() === 'stop') {
      logger.info({ event: 'input_cancelled', chatId, contextKey: step.contextKey })
      delete session.context.productData
      delete session.context.productImage
      delete session.context[step.contextKey]
      session.currentStep = 'awaiting_intent'
      memory.set(chatId, session)

      const intentStep = flow.steps['awaiting_intent']
      if (isChoiceStep(intentStep)) {
        const buttons = buildButtonsFromChoice(intentStep)
        buttons.header = getMessage('add_product_cancelled')
        return {
          handled: true,
          buttons
        }
      }

      return {
        handled: true,
        response: getMessage('add_product_cancelled')
      }
    }

    if (step.contextKey === 'productInput') {
      const existingData = (session.context.productData as ProductData) || {}
      const newFields = parseInputFields(messageText)
      const { product, errors } = validateAndMergeProduct(existingData, newFields)

      session.context.productData = product
      logger.info({ event: 'product_data_updated', chatId, product, errors })

      if (!isProductComplete(product) || errors.length > 0) {
        memory.set(chatId, session)
        const prompt = buildMissingFieldsPrompt(product, errors)
        return {
          handled: true,
          response: prompt
        }
      }

      session.currentStep = step.nextStep
      memory.set(chatId, session)

      const nextStep = flow.steps[step.nextStep]
      if (nextStep && nextStep.type === 'action') {
        return await processActionStep(chatId, session, nextStep as ActionStep)
      }

      if (isImageInputStep(nextStep)) {
        return {
          handled: true,
          response: getMessage(nextStep.messageKey)
        }
      }
    }

    session.context[step.contextKey] = messageText
    session.currentStep = step.nextStep
    memory.set(chatId, session)

    const nextStep = flow.steps[step.nextStep]

    if (nextStep && nextStep.type === 'action') {
      return await processActionStep(chatId, session, nextStep as ActionStep)
    }

    if (isChoiceStep(nextStep)) {
      return {
        handled: true,
        buttons: buildButtonsFromChoice(nextStep)
      }
    }

    if (isInputStep(nextStep)) {
      return {
        handled: true,
        response: getMessage(nextStep.messageKey)
      }
    }

    if (isImageInputStep(nextStep)) {
      return {
        handled: true,
        response: getMessage(nextStep.messageKey)
      }
    }

    return { handled: true }
  }

  async function processImageInputStep(
    chatId: string,
    message: MessageInput,
    session: Session,
    step: ImageInputStep
  ): Promise<FlowResult> {
    logger.info({ event: 'image_input_received', chatId, contextKey: step.contextKey, type: message.type })

    if (message.type === 'text') {
      const text = message.content.trim().toLowerCase()

      if (text === 'stop') {
        logger.info({ event: 'image_input_cancelled', chatId })
        delete session.context.productData
        delete session.context.productImage
        session.currentStep = 'awaiting_intent'
        memory.set(chatId, session)

        const intentStep = flow.steps['awaiting_intent']
        if (isChoiceStep(intentStep)) {
          const buttons = buildButtonsFromChoice(intentStep)
          buttons.header = getMessage('add_product_cancelled')
          return { handled: true, buttons }
        }
        return { handled: true, response: getMessage('add_product_cancelled') }
      }

      if (step.optional && step.skipKeyword && text === step.skipKeyword.toLowerCase()) {
        logger.info({ event: 'image_input_skipped', chatId })
        session.currentStep = step.nextStep
        memory.set(chatId, session)

        const nextStep = flow.steps[step.nextStep]
        if (nextStep && nextStep.type === 'action') {
          return await processActionStep(chatId, session, nextStep as ActionStep)
        }

        return { handled: true, response: getMessage('add_product_image_skipped') }
      }

      logger.info({ event: 'image_input_invalid_text', chatId, text })
      return {
        handled: true,
        response: getMessage('add_product_image_invalid')
      }
    }

    if (message.type === 'image') {
      logger.info({ event: 'image_input_received_image', chatId, mimeType: message.mimeType })
      session.context[step.contextKey] = {
        url: message.content,
        mimeType: message.mimeType
      }
      session.currentStep = step.nextStep
      memory.set(chatId, session)

      const nextStep = flow.steps[step.nextStep]
      if (nextStep && nextStep.type === 'action') {
        const imageReceivedMsg = getMessage('add_product_image_received')
        const actionResult = await processActionStep(chatId, session, nextStep as ActionStep)
        if (actionResult.preMessage) {
          actionResult.preMessage = `${imageReceivedMsg}\n\n${actionResult.preMessage}`
        } else if (actionResult.response) {
          actionResult.response = `${imageReceivedMsg}\n\n${actionResult.response}`
        } else {
          actionResult.response = imageReceivedMsg
        }
        return actionResult
      }

      return { handled: true, response: getMessage('add_product_image_received') }
    }

    return { handled: true, response: getMessage('add_product_image_invalid') }
  }

  async function executeListProducts(): Promise<string> {
    if (!wooCommerce) {
      logger.warn({ event: 'woocommerce_not_configured' })
      return '[WooCommerce not configured]'
    }

    try {
      const products = await wooCommerce.getProducts(20)
      logger.info({ event: 'list_products_fetched', count: products.length })

      if (products.length === 0) {
        return 'No products found in your store.'
      }

      const productList = products.map((p, i) => 
        `${i + 1}. ${p.name} - ${p.price} (${p.stock_status})`
      ).join('\n')

      return `📦 *Products (${products.length}):*\n\n${productList}`
    } catch (err) {
      logger.error({ event: 'list_products_error', error: err })
      return `${getMessage('list_products_error')}\n\n${getErrorMessage(err)}`
    }
  }

  interface ProductData {
    name?: string
    price?: number
    stock?: number
    description?: string
    sku?: string
  }

  function parseInputFields(input: string): Record<string, string> {
    const lines = input.split('\n')
    const fields: Record<string, string> = {}

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.substring(0, colonIndex).trim().toLowerCase()
      const value = line.substring(colonIndex + 1).trim()

      if (value) {
        fields[key] = value
      }
    }

    return fields
  }

  function validateAndMergeProduct(
    existingData: ProductData,
    newFields: Record<string, string>
  ): { product: ProductData; errors: string[] } {
    const product: ProductData = { ...existingData }
    const errors: string[] = []

    if (newFields.name !== undefined) {
      if (newFields.name.length > 0) {
        product.name = newFields.name
      } else {
        errors.push(getMessage('validation_error_name'))
      }
    }

    if (newFields.price !== undefined) {
      const priceNum = parseFloat(newFields.price)
      if (!isNaN(priceNum) && priceNum > 0) {
        product.price = priceNum
      } else {
        errors.push(getMessage('validation_error_price'))
      }
    }

    if (newFields.stock !== undefined) {
      const stockNum = parseInt(newFields.stock, 10)
      if (!isNaN(stockNum) && stockNum >= 0 && Number.isInteger(stockNum)) {
        product.stock = stockNum
      } else {
        errors.push(getMessage('validation_error_stock'))
      }
    }

    if (newFields.description !== undefined) {
      product.description = newFields.description
    }

    return { product, errors }
  }

  function isProductComplete(product: ProductData): boolean {
    return product.name !== undefined && product.price !== undefined && product.stock !== undefined
  }

  function buildMissingFieldsPrompt(product: ProductData, errors: string[]): string {
    const parts: string[] = []

    if (errors.length > 0) {
      parts.push('⚠️ ' + errors.join('\n⚠️ '))
    }

    const currentValues: string[] = []
    if (product.name) currentValues.push(`✓ Name: ${product.name}`)
    if (product.price !== undefined) currentValues.push(`✓ Price: ${product.price}`)
    if (product.stock !== undefined) currentValues.push(`✓ Stock: ${product.stock}`)
    if (product.description) currentValues.push(`✓ Description: ${product.description}`)

    if (currentValues.length > 0) {
      parts.push(getMessage('add_product_current_values').replace('{current_values}', currentValues.join('\n')))
    }

    const missingFields: string[] = []
    if (!product.name) missingFields.push('Name: Product Name')
    if (product.price === undefined) missingFields.push('Price: 29.99')
    if (product.stock === undefined) missingFields.push('Stock: 10')

    if (missingFields.length > 0) {
      parts.push(getMessage('add_product_missing_fields').replace('{missing_fields}', missingFields.join('\n')))
    }

    return parts.join('\n\n')
  }

  interface ProductImageData {
    url: string
    mimeType?: string
  }

  async function executeAddProduct(session: Session): Promise<string> {
    const productData = session.context.productData as ProductData | undefined
    const productImage = session.context.productImage as ProductImageData | undefined

    if (!productData || !isProductComplete(productData)) {
      logger.warn({ event: 'add_product_incomplete', productData })
      return '[Product data incomplete]'
    }

    if (!wooCommerce) {
      logger.warn({ event: 'woocommerce_not_configured' })
      return '[WooCommerce not configured]'
    }

    productData.sku = randomUUID()
    session.context.productData = productData

    logger.info({ event: 'add_product_processing', productData, hasImage: !!productImage })

    try {
      const createInput: Parameters<typeof wooCommerce.createProduct>[0] = {
        name: productData.name!,
        regular_price: productData.price!.toString(),
        stock_quantity: productData.stock!,
        description: productData.description,
        sku: productData.sku
      }

      if (productImage?.url) {
        createInput.images = [{ src: productImage.url, name: productData.name }]
        logger.info({ event: 'add_product_with_image', imageUrl: productImage.url })
      }

      const createdProduct = await wooCommerce.createProduct(createInput)

      logger.info({ event: 'add_product_success', productId: createdProduct.id, sku: createdProduct.sku, permalink: createdProduct.permalink })

      delete session.context.productData
      delete session.context.productImage

      const template = getMessage('add_product_received')
      return template.replace('{name}', createdProduct.name).replace('{permalink}', createdProduct.permalink)
    } catch (err) {
      logger.error({ event: 'add_product_error', error: err, productData })
      return `${getMessage('add_product_error')}\n\n${getErrorMessage(err)}`
    }
  }

  async function processActionStep(
    chatId: string,
    session: Session,
    step: ActionStep
  ): Promise<FlowResult> {
    logger.info({ event: 'action_triggered', chatId, action: step.action })

    let actionResult: string
    if (step.action === 'listProducts') {
      actionResult = await executeListProducts()
    } else if (step.action === 'addProduct') {
      actionResult = await executeAddProduct(session)
    } else {
      actionResult = `[Action: ${step.action}]`
    }

    session.currentStep = step.nextStep
    memory.set(chatId, session)

    const nextStep = flow.steps[step.nextStep]

    if (isChoiceStep(nextStep)) {
      const buttons = buildButtonsFromChoice(nextStep)
      return {
        handled: true,
        preMessage: actionResult,
        buttons
      }
    }

    if (nextStep && 'messageKey' in nextStep && nextStep.messageKey) {
      return {
        handled: true,
        response: `${actionResult}\n\n${getMessage(nextStep.messageKey)}`
      }
    }

    return {
      handled: true,
      response: actionResult
    }
  }

  async function process(chatId: string, message: MessageInput): Promise<FlowResult> {
    let session = memory.get(chatId)

    if (!session) {
      const triggerStep = flow.steps[flow.initialStep]
      if (triggerStep?.type !== 'trigger') {
        logger.error({ event: 'invalid_initial_step', chatId })
        return { handled: false }
      }
      return processTriggerStep(chatId, message, triggerStep as TriggerStep)
    }

    const currentStep = flow.steps[session.currentStep]
    if (!currentStep) {
      logger.error({ event: 'invalid_step', chatId, step: session.currentStep })
      memory.delete(chatId)
      return { handled: false }
    }

    switch (currentStep.type) {
      case 'trigger':
        return processTriggerStep(chatId, message, currentStep as TriggerStep)

      case 'choice':
        return await processChoiceStep(chatId, message, session, currentStep as ChoiceStep)

      case 'input':
        return await processInputStep(chatId, message, session, currentStep as InputStep)

      case 'imageInput':
        return await processImageInputStep(chatId, message, session, currentStep as ImageInputStep)

      case 'action':
        return await processActionStep(chatId, session, currentStep as ActionStep)

      default:
        logger.warn({ event: 'unhandled_step_type', chatId, type: currentStep.type })
        return { handled: false }
    }
  }

  return { process }
}
