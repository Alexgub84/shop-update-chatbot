import { WooCommerceError, type WooCommerceErrorCode } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'
import type { WooCommerceConfig, WooCommerceClient, WooProduct, CreateProductInput } from './types.js'

interface WooApiErrorResponse {
  code?: string
  message?: string
  data?: {
    status?: number
  }
}

export function createWooCommerceClient(
  config: WooCommerceConfig,
  logger?: Logger,
  fetchFunction: typeof fetch = fetch
): WooCommerceClient {
  const log = logger ?? createNoopLogger()

  function buildAuthHeader(): string {
    const credentials = `${config.consumerKey}:${config.consumerSecret}`
    const encoded = Buffer.from(credentials).toString('base64')
    return `Basic ${encoded}`
  }

  function parseErrorCode(statusCode: number, responseBody: string): WooCommerceErrorCode {
    if (statusCode === 401) return 'unauthorized'
    if (statusCode === 403) return 'forbidden'
    if (statusCode === 404) return 'not_found'
    if (statusCode >= 500) return 'server_error'

    try {
      const parsed = JSON.parse(responseBody) as WooApiErrorResponse
      if (parsed.code === 'product_invalid_sku' || parsed.message?.includes('SKU')) {
        return 'duplicate_sku'
      }
      if (parsed.code === 'rest_invalid_param' || parsed.code === 'woocommerce_rest_invalid_product') {
        return 'invalid_data'
      }
    } catch {
      // ignore parse errors
    }

    if (statusCode === 400) return 'invalid_data'
    return 'unknown'
  }

  function buildApiError(statusCode: number, responseBody: string, operation: string): WooCommerceError {
    const errorCode = parseErrorCode(statusCode, responseBody)
    
    let userMessage: string
    try {
      const parsed = JSON.parse(responseBody) as WooApiErrorResponse
      userMessage = parsed.message || `${operation} failed`
    } catch {
      userMessage = `${operation} failed`
    }

    return new WooCommerceError(userMessage, statusCode, errorCode)
  }

  async function getProducts(perPage = 100): Promise<WooProduct[]> {
    const url = `${config.storeUrl}/wp-json/wc/v3/products?per_page=${perPage}`

    log.info({ event: 'woocommerce_get_products_start', perPage })

    let response: Response
    try {
      response = await fetchFunction(url, {
        method: 'GET',
        headers: {
          'Authorization': buildAuthHeader(),
          'Content-Type': 'application/json'
        }
      })
    } catch (err) {
      log.error({ event: 'woocommerce_network_error', error: err })
      throw new WooCommerceError('Network error fetching products', undefined, 'network_error', { cause: err })
    }

    if (!response.ok) {
      let body: string
      try {
        body = await response.text()
      } catch (err) {
        log.error({ event: 'woocommerce_response_read_error', error: err })
        body = 'Failed to read response body'
      }
      log.error({ event: 'woocommerce_api_error', statusCode: response.status, body })
      throw buildApiError(response.status, body, 'Fetching products')
    }

    let products: WooProduct[]
    try {
      products = await response.json() as WooProduct[]
    } catch (err) {
      log.error({ event: 'woocommerce_json_parse_error', error: err })
      throw new WooCommerceError('Failed to parse WooCommerce response', undefined, 'unknown', { cause: err })
    }

    log.info({ event: 'woocommerce_get_products_success', productCount: products.length })

    return products
  }

  async function getProductBySku(sku: string): Promise<WooProduct | null> {
    const url = `${config.storeUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`

    log.info({ event: 'woocommerce_get_product_by_sku_start', sku })

    let response: Response
    try {
      response = await fetchFunction(url, {
        method: 'GET',
        headers: {
          'Authorization': buildAuthHeader(),
          'Content-Type': 'application/json'
        }
      })
    } catch (err) {
      log.error({ event: 'woocommerce_network_error', error: err })
      throw new WooCommerceError('Network error fetching product by SKU', undefined, 'network_error', { cause: err })
    }

    if (!response.ok) {
      let body: string
      try {
        body = await response.text()
      } catch (err) {
        log.error({ event: 'woocommerce_response_read_error', error: err })
        body = 'Failed to read response body'
      }
      log.error({ event: 'woocommerce_api_error', statusCode: response.status, body })
      throw buildApiError(response.status, body, 'Fetching product')
    }

    let products: WooProduct[]
    try {
      products = await response.json() as WooProduct[]
    } catch (err) {
      log.error({ event: 'woocommerce_json_parse_error', error: err })
      throw new WooCommerceError('Failed to parse WooCommerce response', undefined, 'unknown', { cause: err })
    }

    if (products.length === 0) {
      log.info({ event: 'woocommerce_get_product_by_sku_not_found', sku })
      return null
    }

    log.info({ event: 'woocommerce_get_product_by_sku_success', sku, productId: products[0].id })
    return products[0]
  }

  async function createProduct(input: CreateProductInput): Promise<WooProduct> {
    const url = `${config.storeUrl}/wp-json/wc/v3/products`

    const body = {
      name: input.name,
      type: 'simple',
      regular_price: input.regular_price,
      description: input.description || '',
      manage_stock: true,
      stock_quantity: input.stock_quantity,
      sku: input.sku
    }

    log.info({ event: 'woocommerce_create_product_start', name: input.name, sku: input.sku })

    let response: Response
    try {
      response = await fetchFunction(url, {
        method: 'POST',
        headers: {
          'Authorization': buildAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    } catch (err) {
      log.error({ event: 'woocommerce_network_error', error: err })
      throw new WooCommerceError('Network error creating product', undefined, 'network_error', { cause: err })
    }

    if (!response.ok) {
      let responseBody: string
      try {
        responseBody = await response.text()
      } catch (err) {
        log.error({ event: 'woocommerce_response_read_error', error: err })
        responseBody = 'Failed to read response body'
      }
      log.error({ event: 'woocommerce_api_error', statusCode: response.status, body: responseBody })
      throw buildApiError(response.status, responseBody, 'Creating product')
    }

    let product: WooProduct
    try {
      product = await response.json() as WooProduct
    } catch (err) {
      log.error({ event: 'woocommerce_json_parse_error', error: err })
      throw new WooCommerceError('Failed to parse WooCommerce response', undefined, 'unknown', { cause: err })
    }

    log.info({ event: 'woocommerce_create_product_success', productId: product.id, sku: product.sku })

    return product
  }

  return { getProducts, getProductBySku, createProduct }
}
