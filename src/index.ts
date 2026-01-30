import 'dotenv/config'
import { createApp } from './app.js'
import { logger } from './logger.js'
import { ConfigError } from './errors.js'

async function main() {
  let server, dependencies

  try {
    const app = createApp()
    server = app.server
    dependencies = app.dependencies
  } catch (err) {
    if (err instanceof ConfigError) {
      logger.error({ 
        event: 'startup_failed', 
        reason: 'configuration_error',
        message: err.message,
        field: err.field
      })
    } else {
      logger.error({ event: 'startup_failed', error: err })
    }
    process.exit(1)
  }

  const { config } = dependencies

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' })
    logger.info({ event: 'server_started', port: config.port })
  } catch (err) {
    logger.error({ event: 'server_start_failed', error: err })
    process.exit(1)
  }
}

main()
