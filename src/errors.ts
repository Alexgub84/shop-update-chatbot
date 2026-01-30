export class ConfigError extends Error {
  readonly name = 'ConfigError'
  
  constructor(message: string, public readonly field?: string) {
    super(message)
  }
}

export class MessagesError extends Error {
  readonly name = 'MessagesError'
  
  constructor(message: string, public readonly key?: string) {
    super(message)
  }
}

export class GreenApiError extends Error {
  readonly name = 'GreenApiError'
  
  constructor(
    message: string,
    public readonly statusCode?: number,
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

export class WebhookError extends Error {
  readonly name = 'WebhookError'
  
  constructor(message: string, public readonly field?: string) {
    super(message)
  }
}

export type WooCommerceErrorCode = 
  | 'network_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'duplicate_sku'
  | 'invalid_data'
  | 'server_error'
  | 'unknown'

export class WooCommerceError extends Error {
  readonly name = 'WooCommerceError'

  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly errorCode: WooCommerceErrorCode = 'unknown',
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}
