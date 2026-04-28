import { mapShopifyProduct, mapShopifyOrder, mapShopifyCustomer } from '../shopify-mapper';

const sampleProduct = {
  id: 123456,
  title: 'Test Product',
  body_html: '<p>Description</p>',
  vendor: 'TestBrand',
  product_type: 'Electronics',
  status: 'active',
  variants: [{ id: 1, price: '99.99', compare_at_price: '129.99', inventory_quantity: 50 }],
  images: [{ src: 'https://example.com/img.jpg' }],
};

const sampleOrder = {
  id: 789,
  name: '#1001',
  financial_status: 'paid',
  fulfillment_status: undefined,
  payment_gateway: 'visa',
  subtotal_price: '199.00',
  total_discounts: '10.00',
  total_shipping_price_set: { shop_money: { amount: '15.00' } },
  total_price: '204.00',
  currency: 'SAR',
  shipping_address: { address1: '123 Main St', city: 'Riyadh', country: 'SA', zip: '12345' },
  line_items: [
    { variant_id: 1, title: 'Test Product', quantity: 2, price: '99.99' },
  ],
  note: 'Please deliver fast',
  customer: { email: 'test@example.com', first_name: 'Ahmed', last_name: 'Ali', phone: '+966501234567' },
  created_at: '2024-01-01T10:00:00Z',
};

const sampleCustomer = {
  id: 111,
  first_name: 'Ahmed',
  last_name: 'Ali',
  email: 'ahmed@example.com',
  phone: '+966501234567',
  default_address: { city: 'Riyadh', country: 'SA' },
  orders_count: 5,
  total_spent: '1500.00',
};

describe('ShopifyMapper', () => {
  describe('mapShopifyProduct', () => {
    it('should map product fields correctly', () => {
      const result = mapShopifyProduct(sampleProduct as Parameters<typeof mapShopifyProduct>[0]);
      expect(result.platformProductId).toBe('123456');
      expect(result.name).toBe('Test Product');
      expect(result.price).toBe(99.99);
      expect(result.compareAtPrice).toBe(129.99);
      expect(result.stockQuantity).toBe(50);
      expect(result.brand).toBe('TestBrand');
      expect(result.category).toBe('Electronics');
      expect(result.isActive).toBe(true);
      expect(result.images).toEqual(['https://example.com/img.jpg']);
    });

    it('should mark inactive product correctly', () => {
      const result = mapShopifyProduct({ ...sampleProduct, status: 'draft' } as Parameters<typeof mapShopifyProduct>[0]);
      expect(result.isActive).toBe(false);
    });
  });

  describe('mapShopifyOrder', () => {
    it('should map order fields correctly', () => {
      const result = mapShopifyOrder(sampleOrder as Parameters<typeof mapShopifyOrder>[0]);
      expect(result.platformOrderId).toBe('789');
      expect(result.paymentStatus).toBe('paid');
      expect(result.subtotal).toBe(199.00);
      expect(result.discountAmount).toBe(10.00);
      expect(result.shippingCost).toBe(15.00);
      expect(result.total).toBe(204.00);
      expect(result.currency).toBe('SAR');
      expect(result.customerEmail).toBe('test@example.com');
      expect(result.customerName).toBe('Ahmed Ali');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(2);
    });
  });

  describe('mapShopifyCustomer', () => {
    it('should map customer fields correctly', () => {
      const result = mapShopifyCustomer(sampleCustomer as Parameters<typeof mapShopifyCustomer>[0]);
      expect(result.platformCustomerId).toBe('111');
      expect(result.name).toBe('Ahmed Ali');
      expect(result.email).toBe('ahmed@example.com');
      expect(result.totalOrders).toBe(5);
      expect(result.totalSpent).toBe(1500.00);
      expect(result.city).toBe('Riyadh');
    });
  });
});
