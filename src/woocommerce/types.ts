export interface WooCommerceConfig {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
}

export interface WooProduct {
  id: number
  name: string
  slug: string
  price: string
  regular_price: string
  sale_price: string
  stock_status: string
  stock_quantity: number | null
  status: string
  description: string
  short_description: string
  sku: string
}

export interface WooCommerceClient {
  getProducts(perPage?: number): Promise<WooProduct[]>
}
