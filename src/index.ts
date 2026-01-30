import 'dotenv/config'
import { createApp } from './app.js'

async function main() {
  const { server, dependencies } = createApp()
  const { config, logger } = dependencies

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' })
    logger.info({ event: 'server_started', port: config.port })
  } catch (err) {
    logger.error({ event: 'server_start_failed', error: err })
    process.exit(1)
  }
}

main()
