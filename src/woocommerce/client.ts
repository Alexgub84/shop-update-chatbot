import { WooCommerceError } from '../errors.js'
import type { Logger } from '../logger.js'
import type { WooCommerceConfig, WooCommerceClient, WooProduct } from './types.js'

export function createWooCommerceClient(
  config: WooCommerceConfig,
  logger: Logger,
  fetchFunction: typeof fetch = fetch
): WooCommerceClient {
  function buildAuthHeader(): string {
    const credentials = `${config.consumerKey}:${config.consumerSecret}`
    const encoded = Buffer.from(credentials).toString('base64')
    return `Basic ${encoded}`
  }

  async function getProducts(perPage = 100): Promise<WooProduct[]> {
    const url = `${config.storeUrl}/wp-json/wc/v3/products?per_page=${perPage}`

    logger.info({ event: 'woocommerce_get_products_start', perPage })

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
      logger.error({ event: 'woocommerce_network_error', error: err })
      throw new WooCommerceError('Network error fetching products', undefined, { cause: err })
    }

    if (!response.ok) {
      const body = await response.text()
      logger.error({ event: 'woocommerce_api_error', statusCode: response.status, body })
      throw new WooCommerceError(`WooCommerce API error: ${response.status}`, response.status)
    }

    const products = await response.json() as WooProduct[]
    logger.info({ event: 'woocommerce_get_products_success', productCount: products.length })

    return products
  }

  return { getProducts }
}
