import { z } from 'zod'
import { ConfigError } from './errors.js'
import { logger } from './logger.js'

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  mockMode: z.coerce.boolean().default(false),
  triggerCode: z.string({ required_error: 'TRIGGER_CODE is required' }).min(1, 'TRIGGER_CODE cannot be empty'),
  greenApi: z.object({
    instanceId: z.string({ required_error: 'GREEN_API_INSTANCE_ID is required' }).min(1, 'GREEN_API_INSTANCE_ID cannot be empty'),
    token: z.string({ required_error: 'GREEN_API_TOKEN is required' }).min(1, 'GREEN_API_TOKEN cannot be empty')
  })
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    mockMode: env.MOCK_MODE,
    triggerCode: env.TRIGGER_CODE,
    greenApi: {
      instanceId: env.GREEN_API_INSTANCE_ID,
      token: env.GREEN_API_TOKEN
    }
  })

  if (!result.success) {
    const errors = result.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }))
    logger.error({ event: 'config_validation_failed', errors })
    
    const firstError = result.error.errors[0]
    const field = firstError.path.join('.')
    throw new ConfigError(firstError.message, field)
  }

  logger.info({ event: 'config_loaded', port: result.data.port, logLevel: result.data.logLevel })
  return result.data
}
