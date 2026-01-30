import Fastify, { type FastifyInstance } from 'fastify'
import type { WooProduct } from '../../src/woocommerce/types.js'

export interface MockWooCommerceServer {
  server: FastifyInstance
  url: string
  port: number
  products: WooProduct[]
  setProducts(products: WooProduct[]): void
  setAuthCredentials(consumerKey: string, consumerSecret: string): void
  start(): Promise<void>
  stop(): Promise<void>
  getRequestLog(): Array<{ method: string; url: string; headers: Record<string, string> }>
}

export function createMockWooCommerceServer(port = 0): MockWooCommerceServer {
  const server = Fastify({ logger: false })
  let products: WooProduct[] = []
  let expectedConsumerKey = 'ck_test'
  let expectedConsumerSecret = 'cs_test'
  const requestLog: Array<{ method: string; url: string; headers: Record<string, string> }> = []
  let actualPort = port

  function verifyAuth(authHeader: string | undefined): boolean {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false
    }
    const encoded = authHeader.slice(6)
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const [key, secret] = decoded.split(':')
    return key === expectedConsumerKey && secret === expectedConsumerSecret
  }

  server.get('/wp-json/wc/v3/products', async (request, reply) => {
    requestLog.push({
      method: 'GET',
      url: request.url,
      headers: request.headers as Record<string, string>
    })

    const authHeader = request.headers.authorization
    if (!verifyAuth(authHeader)) {
      return reply.status(401).send({
        code: 'woocommerce_rest_cannot_view',
        message: 'Sorry, you cannot list resources.',
        data: { status: 401 }
      })
    }

    const query = request.query as Record<string, string>
    
    if (query.sku) {
      const matchingProduct = products.find(p => p.sku === query.sku)
      return reply.status(200).send(matchingProduct ? [matchingProduct] : [])
    }

    const perPage = Number(query.per_page) || 10
    const pagedProducts = products.slice(0, perPage)

    return reply.status(200).send(pagedProducts)
  })

  return {
    server,
    get url() {
      return `http://localhost:${actualPort}`
    },
    get port() {
      return actualPort
    },
    products,
    setProducts(newProducts: WooProduct[]) {
      products = newProducts
    },
    setAuthCredentials(consumerKey: string, consumerSecret: string) {
      expectedConsumerKey = consumerKey
      expectedConsumerSecret = consumerSecret
    },
    async start() {
      const address = await server.listen({ port, host: '127.0.0.1' })
      actualPort = Number(new URL(address).port)
    },
    async stop() {
      await server.close()
    },
    getRequestLog() {
      return requestLog
    }
  }
}

export function createSampleProduct(overrides: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 1,
    name: 'Sample Product',
    slug: 'sample-product',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    stock_status: 'instock',
    stock_quantity: 50,
    status: 'publish',
    description: '<p>This is a sample product description.</p>',
    short_description: 'A sample product for testing.',
    sku: 'SAMPLE-001',
    ...overrides
  }
}
