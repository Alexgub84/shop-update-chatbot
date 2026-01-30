import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createWooCommerceClient } from '../../src/woocommerce/client.js'
import { WooCommerceError } from '../../src/errors.js'
import { createMockWooCommerceServer, createSampleProduct, type MockWooCommerceServer } from './woocommerce-server.js'
import type { WooCommerceConfig } from '../../src/woocommerce/types.js'

describe('Integration: WooCommerce Client', () => {
  let mockServer: MockWooCommerceServer
  let config: WooCommerceConfig
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {}
  } as any

  beforeAll(async () => {
    mockServer = createMockWooCommerceServer()
    await mockServer.start()

    config = {
      storeUrl: mockServer.url,
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test'
    }
    mockServer.setAuthCredentials('ck_test', 'cs_test')
  })

  afterAll(async () => {
    await mockServer.stop()
  })

  beforeEach(() => {
    mockServer.setProducts([])
  })

  describe('getProducts - successful requests', () => {
    it('should fetch products from mock WooCommerce server', async () => {
      const sampleProducts = [
        createSampleProduct({ id: 1, name: 'Product One', sku: 'PROD-001' }),
        createSampleProduct({ id: 2, name: 'Product Two', sku: 'PROD-002' }),
        createSampleProduct({ id: 3, name: 'Product Three', sku: 'PROD-003' })
      ]
      mockServer.setProducts(sampleProducts)

      const client = createWooCommerceClient(config, mockLogger)
      const products = await client.getProducts()

      expect(products).toHaveLength(3)
      expect(products[0].name).toBe('Product One')
      expect(products[1].name).toBe('Product Two')
      expect(products[2].name).toBe('Product Three')
    })

    it('should return empty array when no products exist (not an error)', async () => {
      mockServer.setProducts([])

      const client = createWooCommerceClient(config, mockLogger)
      const products = await client.getProducts()

      expect(products).toEqual([])
      expect(products).toHaveLength(0)
      expect(Array.isArray(products)).toBe(true)
    })

    it('should respect per_page parameter', async () => {
      const manyProducts = Array.from({ length: 50 }, (_, i) =>
        createSampleProduct({ id: i + 1, name: `Product ${i + 1}`, sku: `PROD-${i + 1}` })
      )
      mockServer.setProducts(manyProducts)

      const client = createWooCommerceClient(config, mockLogger)
      const products = await client.getProducts(10)

      expect(products).toHaveLength(10)
      expect(products[0].name).toBe('Product 1')
      expect(products[9].name).toBe('Product 10')
    })

    it('should send correct Authorization header', async () => {
      mockServer.setProducts([createSampleProduct()])

      const client = createWooCommerceClient(config, mockLogger)
      await client.getProducts()

      const requestLog = mockServer.getRequestLog()
      const lastRequest = requestLog[requestLog.length - 1]
      
      expect(lastRequest.headers.authorization).toBeDefined()
      expect(lastRequest.headers.authorization).toMatch(/^Basic /)
      
      const encoded = lastRequest.headers.authorization.slice(6)
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      expect(decoded).toBe('ck_test:cs_test')
    })

    it('should fetch products with all expected fields', async () => {
      const detailedProduct = createSampleProduct({
        id: 42,
        name: 'Detailed Product',
        slug: 'detailed-product',
        price: '99.99',
        regular_price: '129.99',
        sale_price: '99.99',
        stock_status: 'instock',
        stock_quantity: 25,
        status: 'publish',
        description: '<p>Full description here</p>',
        short_description: 'Short desc',
        sku: 'DETAIL-001'
      })
      mockServer.setProducts([detailedProduct])

      const client = createWooCommerceClient(config, mockLogger)
      const products = await client.getProducts()

      expect(products).toHaveLength(1)
      const product = products[0]
      expect(product.id).toBe(42)
      expect(product.name).toBe('Detailed Product')
      expect(product.slug).toBe('detailed-product')
      expect(product.price).toBe('99.99')
      expect(product.regular_price).toBe('129.99')
      expect(product.sale_price).toBe('99.99')
      expect(product.stock_status).toBe('instock')
      expect(product.stock_quantity).toBe(25)
      expect(product.status).toBe('publish')
      expect(product.sku).toBe('DETAIL-001')
    })
  })

  describe('getProducts - authentication errors', () => {
    it('should throw WooCommerceError on invalid credentials', async () => {
      mockServer.setProducts([createSampleProduct()])

      const badConfig: WooCommerceConfig = {
        storeUrl: mockServer.url,
        consumerKey: 'ck_wrong',
        consumerSecret: 'cs_wrong'
      }

      const client = createWooCommerceClient(badConfig, mockLogger)

      await expect(client.getProducts()).rejects.toThrow(WooCommerceError)
      
      try {
        await client.getProducts()
      } catch (err) {
        expect((err as WooCommerceError).errorCode).toBe('unauthorized')
      }
    })

    it('should include status code 401 in error', async () => {
      const badConfig: WooCommerceConfig = {
        storeUrl: mockServer.url,
        consumerKey: 'ck_invalid',
        consumerSecret: 'cs_invalid'
      }

      const client = createWooCommerceClient(badConfig, mockLogger)

      try {
        await client.getProducts()
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).statusCode).toBe(401)
      }
    })
  })

  describe('getProducts - network errors', () => {
    it('should throw WooCommerceError when server is unreachable', async () => {
      const unreachableConfig: WooCommerceConfig = {
        storeUrl: 'http://localhost:59999',
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test'
      }

      const client = createWooCommerceClient(unreachableConfig, mockLogger)

      await expect(client.getProducts()).rejects.toThrow(WooCommerceError)
      await expect(client.getProducts()).rejects.toThrow(/Network error/)
    })
  })

  describe('getProducts - empty store (no products)', () => {
    it('should return empty array without throwing error', async () => {
      mockServer.setProducts([])

      const client = createWooCommerceClient(config, mockLogger)
      
      await expect(client.getProducts()).resolves.not.toThrow()
      const products = await client.getProducts()
      expect(products).toEqual([])
    })

    it('should make successful HTTP request even with no products', async () => {
      mockServer.setProducts([])

      const client = createWooCommerceClient(config, mockLogger)
      await client.getProducts()

      const requestLog = mockServer.getRequestLog()
      const lastRequest = requestLog[requestLog.length - 1]
      
      expect(lastRequest.url).toContain('/wp-json/wc/v3/products')
      expect(lastRequest.method).toBe('GET')
    })

    it('should handle transition from empty to having products', async () => {
      mockServer.setProducts([])

      const client = createWooCommerceClient(config, mockLogger)
      
      const emptyResult = await client.getProducts()
      expect(emptyResult).toHaveLength(0)

      mockServer.setProducts([
        createSampleProduct({ id: 1, name: 'New Product' })
      ])

      const populatedResult = await client.getProducts()
      expect(populatedResult).toHaveLength(1)
      expect(populatedResult[0].name).toBe('New Product')
    })
  })

  describe('getProducts - multiple sequential requests', () => {
    it('should handle multiple requests correctly', async () => {
      mockServer.setProducts([
        createSampleProduct({ id: 1, name: 'First' }),
        createSampleProduct({ id: 2, name: 'Second' })
      ])

      const client = createWooCommerceClient(config, mockLogger)

      const firstCall = await client.getProducts()
      expect(firstCall).toHaveLength(2)

      mockServer.setProducts([
        createSampleProduct({ id: 3, name: 'Third' })
      ])

      const secondCall = await client.getProducts()
      expect(secondCall).toHaveLength(1)
      expect(secondCall[0].name).toBe('Third')
    })
  })

  describe('getProductBySku - successful requests', () => {
    it('should fetch product by SKU from mock WooCommerce server', async () => {
      const sampleProducts = [
        createSampleProduct({ id: 1, name: 'Product One', sku: 'PROD-001' }),
        createSampleProduct({ id: 2, name: 'Product Two', sku: 'PROD-002' }),
        createSampleProduct({ id: 3, name: 'Product Three', sku: 'PROD-003' })
      ]
      mockServer.setProducts(sampleProducts)

      const client = createWooCommerceClient(config, mockLogger)
      const product = await client.getProductBySku('PROD-002')

      expect(product).not.toBeNull()
      expect(product?.id).toBe(2)
      expect(product?.name).toBe('Product Two')
      expect(product?.sku).toBe('PROD-002')
    })

    it('should return null when SKU does not exist', async () => {
      mockServer.setProducts([
        createSampleProduct({ id: 1, sku: 'EXISTING-SKU' })
      ])

      const client = createWooCommerceClient(config, mockLogger)
      const product = await client.getProductBySku('NONEXISTENT-SKU')

      expect(product).toBeNull()
    })

    it('should return null when no products exist', async () => {
      mockServer.setProducts([])

      const client = createWooCommerceClient(config, mockLogger)
      const product = await client.getProductBySku('ANY-SKU')

      expect(product).toBeNull()
    })

    it('should fetch product with all expected fields', async () => {
      const detailedProduct = createSampleProduct({
        id: 42,
        name: 'Detailed Product',
        slug: 'detailed-product',
        price: '99.99',
        regular_price: '129.99',
        sale_price: '99.99',
        stock_status: 'instock',
        stock_quantity: 25,
        status: 'publish',
        description: '<p>Full description here</p>',
        short_description: 'Short desc',
        sku: 'DETAIL-001'
      })
      mockServer.setProducts([detailedProduct])

      const client = createWooCommerceClient(config, mockLogger)
      const product = await client.getProductBySku('DETAIL-001')

      expect(product).not.toBeNull()
      expect(product?.id).toBe(42)
      expect(product?.name).toBe('Detailed Product')
      expect(product?.price).toBe('99.99')
      expect(product?.stock_quantity).toBe(25)
      expect(product?.sku).toBe('DETAIL-001')
    })

    it('should send correct Authorization header', async () => {
      mockServer.setProducts([createSampleProduct({ sku: 'AUTH-TEST' })])

      const client = createWooCommerceClient(config, mockLogger)
      await client.getProductBySku('AUTH-TEST')

      const requestLog = mockServer.getRequestLog()
      const lastRequest = requestLog[requestLog.length - 1]

      expect(lastRequest.headers.authorization).toBeDefined()
      expect(lastRequest.headers.authorization).toMatch(/^Basic /)

      const encoded = lastRequest.headers.authorization.slice(6)
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      expect(decoded).toBe('ck_test:cs_test')
    })
  })

  describe('getProductBySku - authentication errors', () => {
    it('should throw WooCommerceError on invalid credentials', async () => {
      mockServer.setProducts([createSampleProduct({ sku: 'TEST-SKU' })])

      const badConfig: WooCommerceConfig = {
        storeUrl: mockServer.url,
        consumerKey: 'ck_wrong',
        consumerSecret: 'cs_wrong'
      }

      const client = createWooCommerceClient(badConfig, mockLogger)

      await expect(client.getProductBySku('TEST-SKU')).rejects.toThrow(WooCommerceError)
      
      try {
        await client.getProductBySku('TEST-SKU')
      } catch (err) {
        expect((err as WooCommerceError).errorCode).toBe('unauthorized')
      }
    })
  })

  describe('getProductBySku - network errors', () => {
    it('should throw WooCommerceError when server is unreachable', async () => {
      const unreachableConfig: WooCommerceConfig = {
        storeUrl: 'http://localhost:59999',
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test'
      }

      const client = createWooCommerceClient(unreachableConfig, mockLogger)

      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(WooCommerceError)
      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(/Network error/)
    })
  })
})
