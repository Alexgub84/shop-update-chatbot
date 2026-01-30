import { WooCommerceError } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'
import type { WooCommerceConfig, WooCommerceClient, WooProduct } from './types.js'

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
      throw new WooCommerceError('Network error fetching products', undefined, { cause: err })
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
      throw new WooCommerceError(`WooCommerce API error: ${response.status}`, response.status)
    }

    let products: WooProduct[]
    try {
      products = await response.json() as WooProduct[]
    } catch (err) {
      log.error({ event: 'woocommerce_json_parse_error', error: err })
      throw new WooCommerceError('Failed to parse WooCommerce response', undefined, { cause: err })
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
      throw new WooCommerceError('Network error fetching product by SKU', undefined, { cause: err })
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
      throw new WooCommerceError(`WooCommerce API error: ${response.status}`, response.status)
    }

    let products: WooProduct[]
    try {
      products = await response.json() as WooProduct[]
    } catch (err) {
      log.error({ event: 'woocommerce_json_parse_error', error: err })
      throw new WooCommerceError('Failed to parse WooCommerce response', undefined, { cause: err })
    }

    if (products.length === 0) {
      log.info({ event: 'woocommerce_get_product_by_sku_not_found', sku })
      return null
    }

    log.info({ event: 'woocommerce_get_product_by_sku_success', sku, productId: products[0].id })
    return products[0]
  }

  return { getProducts, getProductBySku }
}
