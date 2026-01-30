import { z } from 'zod'
import { ConfigError } from './errors.js'
import { logger } from './logger.js'

const coerceBooleanFromEnvVar = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val
    return val.toLowerCase() === 'true'
  })
  .default(false)

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  mockMode: coerceBooleanFromEnvVar,
  fakeGreenApiMode: coerceBooleanFromEnvVar,
  triggerCode: z.string().min(1).optional(),
  sessionTimeoutMs: z.coerce.number().int().min(1000).default(300000),
  greenApi: z.object({
    instanceId: z.string({ required_error: 'GREEN_API_INSTANCE_ID is required' }).min(1, 'GREEN_API_INSTANCE_ID cannot be empty'),
    token: z.string({ required_error: 'GREEN_API_TOKEN is required' }).min(1, 'GREEN_API_TOKEN cannot be empty')
  }),
  wooCommerce: z.object({
    storeUrl: z.string({ required_error: 'WOOCOMMERCE_STORE_URL is required' }).min(1, 'WOOCOMMERCE_STORE_URL cannot be empty'),
    consumerKey: z.string({ required_error: 'WOOCOMMERCE_CONSUMER_KEY is required' }).min(1, 'WOOCOMMERCE_CONSUMER_KEY cannot be empty'),
    consumerSecret: z.string({ required_error: 'WOOCOMMERCE_CONSUMER_SECRET is required' }).min(1, 'WOOCOMMERCE_CONSUMER_SECRET cannot be empty')
  })
})

export type Config = z.infer<typeof configSchema>

function fieldToEnvVar(field: string): string {
  const mapping: Record<string, string> = {
    'port': 'PORT',
    'logLevel': 'LOG_LEVEL',
    'mockMode': 'MOCK_MODE',
    'greenApi.instanceId': 'GREEN_API_INSTANCE_ID',
    'greenApi.token': 'GREEN_API_TOKEN',
    'wooCommerce.storeUrl': 'WOOCOMMERCE_STORE_URL',
    'wooCommerce.consumerKey': 'WOOCOMMERCE_CONSUMER_KEY',
    'wooCommerce.consumerSecret': 'WOOCOMMERCE_CONSUMER_SECRET'
  }
  return mapping[field] || field.toUpperCase()
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    mockMode: env.MOCK_MODE,
    fakeGreenApiMode: env.FAKE_GREENAPI_MODE,
    triggerCode: env.TRIGGER_CODE,
    sessionTimeoutMs: env.SESSION_TIMEOUT_MS,
    greenApi: {
      instanceId: env.GREEN_API_INSTANCE_ID,
      token: env.GREEN_API_TOKEN
    },
    wooCommerce: {
      storeUrl: env.WOOCOMMERCE_STORE_URL,
      consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
      consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET
    }
  })

  if (!result.success) {
    const missingVars: string[] = []
    const errors = result.error.errors.map(e => {
      const field = e.path.join('.')
      const envVarName = fieldToEnvVar(field)
      if (e.code === 'invalid_type' && e.received === 'undefined') {
        missingVars.push(envVarName)
      }
      return { field, envVar: envVarName, message: e.message }
    })

    logger.error({ event: 'config_validation_failed', errors })
    
    if (missingVars.length > 0) {
      logger.error({ 
        event: 'missing_environment_variables', 
        missing: missingVars,
        hint: 'Add these variables to your Railway environment or .env file'
      })
    }
    
    const firstError = result.error.errors[0]
    const field = firstError.path.join('.')
    throw new ConfigError(firstError.message, field)
  }

  logger.info({ event: 'config_loaded', port: result.data.port, logLevel: result.data.logLevel })
  return result.data
}
