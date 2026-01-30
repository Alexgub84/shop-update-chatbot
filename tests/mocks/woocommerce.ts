import { vi } from 'vitest'
import type { WooCommerceClient, WooProduct } from '../../src/woocommerce/types.js'

export function createMockWooCommerceClient(): WooCommerceClient & {
  getProducts: ReturnType<typeof vi.fn>
  getProductBySku: ReturnType<typeof vi.fn>
} {
  return {
    getProducts: vi.fn().mockResolvedValue([]),
    getProductBySku: vi.fn().mockResolvedValue(null)
  }
}

export function createMockProduct(overrides: Partial<WooProduct> = {}): WooProduct {
  return {
    id: 1,
    name: 'Test Product',
    slug: 'test-product',
    price: '10.00',
    regular_price: '10.00',
    sale_price: '',
    stock_status: 'instock',
    stock_quantity: 100,
    status: 'publish',
    description: 'Test description',
    short_description: 'Short desc',
    sku: 'TEST-001',
    ...overrides
  }
}
