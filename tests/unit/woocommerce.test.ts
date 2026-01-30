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
      
      try {
        await client.getProducts()
      } catch (err) {
        expect((err as WooCommerceError).errorCode).toBe('unauthorized')
      }
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
      
      try {
        await client.getProductBySku('ANY-SKU')
      } catch (err) {
        expect((err as WooCommerceError).errorCode).toBe('unauthorized')
      }
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

  describe('createProduct', () => {
    const validInput = {
      name: 'Test Product',
      regular_price: '29.99',
      stock_quantity: 10,
      description: 'A test product',
      sku: 'TEST-SKU-123'
    }

    it('should create product successfully', async () => {
      const mockProduct = createMockProduct({
        id: 123,
        name: 'Test Product',
        sku: 'TEST-SKU-123',
        price: '29.99',
        regular_price: '29.99',
        stock_quantity: 10
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProduct
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      const result = await client.createProduct(validInput)

      expect(result).toEqual(mockProduct)
      expect(result.id).toBe(123)
      expect(result.name).toBe('Test Product')
    })

    it('should use correct URL and method', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockProduct({ id: 1 })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.createProduct(validInput)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.com/wp-json/wc/v3/products',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.any(String)
        })
      )
    })

    it('should send correct product data in body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockProduct({ id: 1 })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.createProduct(validInput)

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(calledBody).toEqual({
        name: 'Test Product',
        type: 'simple',
        regular_price: '29.99',
        description: 'A test product',
        manage_stock: true,
        stock_quantity: 10,
        sku: 'TEST-SKU-123'
      })
    })

    it('should log start and success events', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockProduct({ id: 456, sku: 'NEW-SKU' })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.createProduct(validInput)

      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_create_product_start',
        name: 'Test Product',
        sku: 'TEST-SKU-123'
      })
      expect(mockLogger.info).toHaveBeenCalledWith({
        event: 'woocommerce_create_product_success',
        productId: 456,
        sku: 'NEW-SKU'
      })
    })

    it('should throw WooCommerceError with network_error code on network failure', async () => {
      const networkError = new Error('Connection refused')
      const mockFetch = vi.fn().mockRejectedValue(networkError)

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      await expect(client.createProduct(validInput)).rejects.toThrow(WooCommerceError)
      
      try {
        await client.createProduct(validInput)
      } catch (err) {
        expect((err as WooCommerceError).errorCode).toBe('network_error')
        expect((err as WooCommerceError).message).toContain('Network error')
      }
    })

    it('should throw WooCommerceError with unauthorized code on 401', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({
          code: 'woocommerce_rest_cannot_create',
          message: 'Sorry, you are not allowed to create resources.',
          data: { status: 401 }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('unauthorized')
        expect((err as WooCommerceError).statusCode).toBe(401)
        expect((err as WooCommerceError).message).toBe('Sorry, you are not allowed to create resources.')
      }
    })

    it('should throw WooCommerceError with forbidden code on 403', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({
          code: 'woocommerce_rest_forbidden',
          message: 'You do not have permission to do that.',
          data: { status: 403 }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('forbidden')
        expect((err as WooCommerceError).statusCode).toBe(403)
      }
    })

    it('should throw WooCommerceError with duplicate_sku code on invalid SKU', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          code: 'product_invalid_sku',
          message: 'Invalid or duplicated SKU.',
          data: { status: 400, resource_id: 65, unique_sku: 'test-dup-sku-1' }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('duplicate_sku')
        expect((err as WooCommerceError).statusCode).toBe(400)
        expect((err as WooCommerceError).message).toBe('Invalid or duplicated SKU.')
      }
    })

    it('should throw WooCommerceError with invalid_data code on 400 with other errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          code: 'rest_invalid_param',
          message: 'Invalid parameter(s): regular_price',
          data: { status: 400 }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('invalid_data')
        expect((err as WooCommerceError).statusCode).toBe(400)
      }
    })

    it('should throw WooCommerceError with server_error code on 500', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({
          code: 'internal_error',
          message: 'Internal Server Error',
          data: { status: 500 }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('server_error')
        expect((err as WooCommerceError).statusCode).toBe(500)
      }
    })

    it('should throw WooCommerceError with server_error code on 503', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('server_error')
        expect((err as WooCommerceError).statusCode).toBe(503)
      }
    })

    it('should throw WooCommerceError with not_found code on 404', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({
          code: 'rest_no_route',
          message: 'No route was found matching the URL and request method.',
          data: { status: 404 }
        })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('not_found')
        expect((err as WooCommerceError).statusCode).toBe(404)
      }
    })

    it('should throw WooCommerceError with unknown code on JSON parse error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON') }
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('unknown')
        expect((err as WooCommerceError).message).toContain('Failed to parse')
      }
    })

    it('should handle non-JSON error response gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html>Bad Gateway</html>'
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WooCommerceError)
        expect((err as WooCommerceError).errorCode).toBe('server_error')
        expect((err as WooCommerceError).statusCode).toBe(502)
      }
    })

    it('should log API error with status and body', async () => {
      const errorBody = JSON.stringify({
        code: 'product_invalid_sku',
        message: 'Invalid or duplicated SKU.'
      })

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => errorBody
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)

      try {
        await client.createProduct(validInput)
      } catch {}

      expect(mockLogger.error).toHaveBeenCalledWith({
        event: 'woocommerce_api_error',
        statusCode: 400,
        body: errorBody
      })
    })

    it('should send empty description when not provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockProduct({ id: 1 })
      })

      const client = createWooCommerceClient(config, mockLogger, mockFetch)
      await client.createProduct({
        name: 'No Description',
        regular_price: '10',
        stock_quantity: 5
      })

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(calledBody.description).toBe('')
    })
  })
})
