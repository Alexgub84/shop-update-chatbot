import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWooCommerceClient } from '../../src/woocommerce/client.js'
import { WooCommerceError } from '../../src/errors.js'
import { createMockProduct } from '../mocks/woocommerce.js'

describe('WooCommerceClient', () => {
  const config = {
    storeUrl: 'https://test-store.com',
    consumerKey: 'ck_test_key',
    consumerSecret: 'cs_test_secret'
  }

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getProducts', () => {
    it('should fetch products successfully', async () => {
      const mockProducts = [
        createMockProduct({ id: 1, name: 'Product 1' }),
        createMockProduct({ id: 2, name: 'Product 2' })
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProducts
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      const result = await client.getProducts()

      expect(result).toEqual(mockProducts)
      expect(result).toHaveLength(2)
    })

    it('should use correct URL with per_page parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProducts(50)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.com/wp-json/wc/v3/products?per_page=50',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('should default to 100 products per page', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProducts()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.com/wp-json/wc/v3/products?per_page=100',
        expect.any(Object)
      )
    })

    it('should send Basic auth header with encoded credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProducts()

      const expectedAuth = Buffer.from('ck_test_key:cs_test_secret').toString('base64')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`
          })
        })
      )
    })

    it('should log success event with product count', async () => {
      const mockProducts = [
        createMockProduct({ id: 1 }),
        createMockProduct({ id: 2 }),
        createMockProduct({ id: 3 })
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProducts
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProducts()

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_products_start',
        perPage: 100
      })
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_products_success',
        productCount: 3
      })
    })

    it('should return empty array when no products exist (not an error)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      const result = await client.getProducts()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
      expect(mockLogger.error).not.toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_products_success',
        productCount: 0
      })
    })

    it('should throw WooCommerceError on network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      await expect(client.getProducts()).rejects.toThrow(WooCommerceError)
      await expect(client.getProducts()).rejects.toThrow(/Network error/)
    })

    it('should log network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.getProducts()
      } catch {}

      expect(mockLogger.error).toHaveBeenCalledWith({
        event: 'woocommerce_network_error',
        error: networkError
      })
    })

    it('should throw WooCommerceError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      await expect(client.getProducts()).rejects.toThrow(WooCommerceError)
      await expect(client.getProducts()).rejects.toThrow(/WooCommerce API error: 401/)
    })

    it('should include status code in WooCommerceError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal error'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.getProducts()
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).statusCode).toBe(500)
      }
    })

    it('should log API error with status and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.getProducts()
      } catch {}

      expect(mockLogger.error).toHaveBeenCalledWith({
        event: 'woocommerce_api_error',
        statusCode: 403,
        body: 'Forbidden'
      })
    })
  })

  describe('getProductBySku', () => {
    it('should fetch product by SKU successfully', async () => {
      const mockProduct = createMockProduct({ id: 42, sku: 'TEST-SKU-001' })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockProduct]
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      const result = await client.getProductBySku('TEST-SKU-001')

      expect(result).toEqual(mockProduct)
      expect(result?.sku).toBe('TEST-SKU-001')
    })

    it('should use correct URL with encoded SKU parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProductBySku('SKU-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.com/wp-json/wc/v3/products?sku=SKU-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('should URL-encode special characters in SKU', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProductBySku('SKU/123&test')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.com/wp-json/wc/v3/products?sku=SKU%2F123%26test',
        expect.any(Object)
      )
    })

    it('should return null when product not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      const result = await client.getProductBySku('NONEXISTENT')

      expect(result).toBeNull()
    })

    it('should log not found event when product does not exist', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProductBySku('MISSING-SKU')

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_product_by_sku_not_found',
        sku: 'MISSING-SKU'
      })
    })

    it('should log success event with product ID when found', async () => {
      const mockProduct = createMockProduct({ id: 99, sku: 'FOUND-SKU' })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockProduct]
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.getProductBySku('FOUND-SKU')

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_product_by_sku_start',
        sku: 'FOUND-SKU'
      })
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_get_product_by_sku_success',
        sku: 'FOUND-SKU',
        productId: 99
      })
    })

    it('should throw WooCommerceError on network error', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(WooCommerceError)
      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(/Network error/)
    })

    it('should throw WooCommerceError on API error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(WooCommerceError)
      await expect(client.getProductBySku('ANY-SKU')).rejects.toThrow(/WooCommerce API error: 401/)
    })

    it('should include status code in WooCommerceError', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal error'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.getProductBySku('ANY-SKU')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).statusCode).toBe(500)
      }
    })
  })
})
