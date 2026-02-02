import Fastify, { type FastifyInstance } from 'fastify'

export interface ReceivedWebhook {
  payload: unknown
  timestamp: Date
  headers: Record<string, string>
}

export interface MockForwardWebhookServer {
  server: FastifyInstance
  url: string
  port: number
  start(): Promise<void>
  stop(): Promise<void>
  getReceivedWebhooks(): ReceivedWebhook[]
  clearReceivedWebhooks(): void
  setResponseStatus(status: number): void
}

export function createMockForwardWebhookServer(port = 0): MockForwardWebhookServer {
  const server = Fastify({ logger: false })
  const receivedWebhooks: ReceivedWebhook[] = []
  let actualPort = port
  let responseStatus = 200

  server.post('/', async (request, reply) => {
    receivedWebhooks.push({
      payload: request.body,
      timestamp: new Date(),
      headers: request.headers as Record<string, string>
    })

    return reply.status(responseStatus).send({ ok: responseStatus === 200 })
  })

  server.get('/received', async () => {
    return {
      count: receivedWebhooks.length,
      webhooks: receivedWebhooks.map(w => ({
        payload: w.payload,
        timestamp: w.timestamp.toISOString()
      }))
    }
  })

  server.delete('/received', async () => {
    receivedWebhooks.length = 0
    return { ok: true }
  })

  return {
    server,
    get url() {
      return `http://localhost:${actualPort}`
    },
    get port() {
      return actualPort
    },
    async start() {
      const address = await server.listen({ port, host: '127.0.0.1' })
      actualPort = Number(new URL(address).port)
    },
    async stop() {
      await server.close()
    },
    getReceivedWebhooks() {
      return [...receivedWebhooks]
    },
    clearReceivedWebhooks() {
      receivedWebhooks.length = 0
    },
    setResponseStatus(status: number) {
      responseStatus = status
    }
  }
}
