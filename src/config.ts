import { z } from 'zod'
import { ConfigError } from './errors.js'
import { logger } from './logger.js'

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  mockMode: z.coerce.boolean().default(false),
  triggerCode: z.string().min(1).optional(),
  greenApi: z.object({
    instanceId: z.string({ required_error: 'GREEN_API_INSTANCE_ID is required' }).min(1, 'GREEN_API_INSTANCE_ID cannot be empty'),
    token: z.string({ required_error: 'GREEN_API_TOKEN is required' }).min(1, 'GREEN_API_TOKEN cannot be empty')
  })
})

export type Config = z.infer<typeof configSchema>

function fieldToEnvVar(field: string): string {
  const mapping: Record<string, string> = {
    'port': 'PORT',
    'logLevel': 'LOG_LEVEL',
    'mockMode': 'MOCK_MODE',
    'greenApi.instanceId': 'GREEN_API_INSTANCE_ID',
    'greenApi.token': 'GREEN_API_TOKEN'
  }
  return mapping[field] || field.toUpperCase()
}

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
