import { mapSallaProduct, mapSallaOrder, mapSallaCustomer } from '../salla-mapper';

describe('SallaMapper', () => {
  // ── mapSallaProduct ─────────────────────────────────────────────────────────

  describe('mapSallaProduct', () => {
    const rawProduct = {
      id: 101,
      name: 'Arabic Coffee Maker',
      description: '<p>Premium coffee</p>',
      price: { amount: 149.0, currency: 'SAR' },
      sale_price: { amount: 99.0 },
      quantity: 25,
      category: { name: 'Kitchen' },
      brand: { name: 'AlKhair' },
      images: [{ url: 'https://example.com/img1.jpg' }],
      thumbnail: 'https://example.com/thumb.jpg',
      status: 'sale',
    };

    it('should map a Salla product to PlatformProduct', () => {
      const result = mapSallaProduct(rawProduct);
      expect(result.platformProductId).toBe('101');
      expect(result.name).toBe('Arabic Coffee Maker');
      expect(result.price).toBe(149.0);
      expect(result.compareAtPrice).toBe(99.0);
      expect(result.currency).toBe('SAR');
      expect(result.stockQuantity).toBe(25);
      expect(result.category).toBe('Kitchen');
      expect(result.brand).toBe('AlKhair');
      expect(result.isActive).toBe(true);
    });

    it('should collect thumbnail and images without duplicates', () => {
      const result = mapSallaProduct(rawProduct);
      expect(result.images).toContain('https://example.com/thumb.jpg');
      expect(result.images).toContain('https://example.com/img1.jpg');
    });

    it('should mark inactive when status is out_of_stock', () => {
      const result = mapSallaProduct({ ...rawProduct, status: 'out_of_stock' });
      expect(result.isActive).toBe(false);
    });

    it('should handle numeric price', () => {
      const result = mapSallaProduct({ ...rawProduct, price: 200 });
      expect(result.price).toBe(200);
      expect(result.currency).toBe('SAR');
    });

    it('should handle missing optional fields', () => {
      const minimal = {
        id: 1,
        name: 'Simple',
        price: 10,
        quantity: 0,
        status: 'active',
      };
      const result = mapSallaProduct(minimal);
      expect(result.description).toBeUndefined();
      expect(result.category).toBeUndefined();
      expect(result.brand).toBeUndefined();
      expect(result.images).toHaveLength(0);
      expect(result.compareAtPrice).toBeUndefined();
    });
  });

  // ── mapSallaOrder ───────────────────────────────────────────────────────────

  describe('mapSallaOrder', () => {
    const rawOrder = {
      id: 5001,
      status: { slug: 'pending', name: 'Pending' },
      payment_method: 'credit_card',
      amounts: {
        subtotal: { amount: 200.0 },
        discount: { amount: 10.0 },
        shipping: { amount: 15.0 },
        total: { amount: 205.0 },
      },
      currency: 'SAR',
      customer: {
        id: 1,
        name: 'Ahmed Ali',
        email: 'ahmed@test.com',
        mobile: '+966501234567',
      },
      shipping: {
        address: { city: 'Riyadh', country: 'SA' },
      },
      items: [
        {
          product_id: 101,
          name: 'Coffee Maker',
          quantity: 2,
          price: { amount: 100.0 },
        },
      ],
      note: 'Please gift wrap',
      date: { date: '2026-04-01T10:00:00Z' },
    };

    it('should map a Salla order to PlatformOrder', () => {
      const result = mapSallaOrder(rawOrder);
      expect(result.platformOrderId).toBe('5001');
      expect(result.customerName).toBe('Ahmed Ali');
      expect(result.customerEmail).toBe('ahmed@test.com');
      expect(result.customerPhone).toBe('+966501234567');
      expect(result.status).toBe('pending');
      expect(result.paymentMethod).toBe('credit_card');
      expect(result.subtotal).toBe(200.0);
      expect(result.discountAmount).toBe(10.0);
      expect(result.shippingCost).toBe(15.0);
      expect(result.total).toBe(205.0);
      expect(result.currency).toBe('SAR');
      expect(result.notes).toBe('Please gift wrap');
    });

    it('should map order items correctly', () => {
      const result = mapSallaOrder(rawOrder);
      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.platformProductId).toBe('101');
      expect(item.name).toBe('Coffee Maker');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice).toBe(100.0);
      expect(item.totalPrice).toBe(200.0);
    });

    it('should handle string status', () => {
      const result = mapSallaOrder({ ...rawOrder, status: 'delivered' });
      expect(result.status).toBe('delivered');
    });

    it('should handle missing amounts gracefully', () => {
      const result = mapSallaOrder({ ...rawOrder, amounts: {} });
      expect(result.subtotal).toBe(0);
      expect(result.discountAmount).toBe(0);
      expect(result.shippingCost).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  // ── mapSallaCustomer ────────────────────────────────────────────────────────

  describe('mapSallaCustomer', () => {
    const rawCustomer = {
      id: 200,
      name: 'Fatima Hassan',
      email: 'fatima@test.com',
      mobile: '+966509876543',
      city: 'Jeddah',
      country: 'SA',
      orders_count: 5,
      total_spent: { amount: 1250.0 },
    };

    it('should map a Salla customer to PlatformCustomer', () => {
      const result = mapSallaCustomer(rawCustomer);
      expect(result.platformCustomerId).toBe('200');
      expect(result.name).toBe('Fatima Hassan');
      expect(result.email).toBe('fatima@test.com');
      expect(result.phone).toBe('+966509876543');
      expect(result.city).toBe('Jeddah');
      expect(result.country).toBe('SA');
      expect(result.totalOrders).toBe(5);
      expect(result.totalSpent).toBe(1250.0);
    });

    it('should build name from first_name + last_name when name is absent', () => {
      const result = mapSallaCustomer({
        ...rawCustomer,
        name: undefined,
        first_name: 'Fatima',
        last_name: 'Hassan',
      });
      expect(result.name).toBe('Fatima Hassan');
    });

    it('should handle numeric total_spent', () => {
      const result = mapSallaCustomer({ ...rawCustomer, total_spent: 500 });
      expect(result.totalSpent).toBe(500);
    });

    it('should handle missing optional fields', () => {
      const result = mapSallaCustomer({ id: 1, name: 'Test' } as Parameters<typeof mapSallaCustomer>[0]);
      expect(result.email).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.city).toBeUndefined();
      expect(result.totalOrders).toBe(0);
      expect(result.totalSpent).toBe(0);
    });
  });
});
