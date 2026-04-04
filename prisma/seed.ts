import { PrismaClient, PlatformType, PlanTier, OrderStatus, PaymentStatus, CustomerSegment, SourceChannel } from '@prisma/client';

const prisma = new PrismaClient();

const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
const MERCHANT_2_ID = '00000000-0000-0000-0000-000000000002';

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // ── Merchants ─────────────────────────────────────────────────────────────
  const merchant = await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id: MERCHANT_ID,
      name: 'Demo Shopify Store',
      email: 'shopify-seed-store.myshopify.com',
      phone: '+966501111111',
      platformType: PlatformType.shopify,
      platformStoreId: 'seed-store.myshopify.com',
      platformAccessToken: 'shpat_demo_access_token_for_testing',
      planTier: PlanTier.pro,
      isActive: true,
      webhookSecret: 'demo-webhook-secret',
    },
    update: {
      name: 'Demo Shopify Store',
      isActive: true,
    },
  });

  const merchant2 = await prisma.merchant.upsert({
    where: { id: MERCHANT_2_ID },
    create: {
      id: MERCHANT_2_ID,
      name: 'Demo Salla Store',
      email: 'salla-demo@example.com',
      phone: '+966502222222',
      platformType: PlatformType.salla,
      platformStoreId: '12345678',
      platformAccessToken: 'salla_demo_access_token',
      platformRefreshToken: 'salla_demo_refresh_token',
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      planTier: PlanTier.basic,
      isActive: true,
    },
    update: { isActive: true },
  });

  console.log(`✅ Merchants: ${merchant.name}, ${merchant2.name}`);

  // ── Products ──────────────────────────────────────────────────────────────
  const productsData = [
    { id: '5001', name: 'Arabic Coffee Maker',    price: 149.00, compareAt: 199.00, stock: 30, category: 'Kitchen',     brand: 'AlKhair' },
    { id: '5002', name: 'Smart Watch',             price: 599.00, compareAt: 799.00, stock: 15, category: 'Electronics', brand: 'TechSA' },
    { id: '5003', name: 'Prayer Rug Premium',      price:  89.00, compareAt: null,   stock: 50, category: 'Religious',   brand: 'Madinah' },
    { id: '5004', name: 'Oud Perfume 100ml',       price: 350.00, compareAt: 420.00, stock: 20, category: 'Perfumes',    brand: 'Arabian Oud' },
    { id: '5005', name: 'Date Gift Box 1KG',       price:  75.00, compareAt: null,   stock: 100, category: 'Food',       brand: 'AlMadinah Dates' },
    { id: '5006', name: 'Abaya Modern Cut',        price: 250.00, compareAt: 300.00, stock:  8, category: 'Fashion',     brand: 'Elaf' },
    { id: '5007', name: 'Wireless Earbuds',        price: 199.00, compareAt: 249.00, stock: 25, category: 'Electronics', brand: 'TechSA' },
    { id: '5008', name: 'Camel Milk Soap Set',     price:  45.00, compareAt: null,   stock: 60, category: 'Beauty',      brand: 'Desert Glow' },
    { id: '5009', name: 'Traditional Dallah',      price: 120.00, compareAt: 150.00, stock: 12, category: 'Kitchen',    brand: 'Heritage' },
    { id: '5010', name: 'LED Quran Speaker',       price: 175.00, compareAt: 220.00, stock: 35, category: 'Religious',   brand: 'NoorTech' },
  ];

  const createdProducts = [];
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { merchantId_platformProductId: { merchantId: MERCHANT_ID, platformProductId: p.id } },
      create: {
        merchantId: MERCHANT_ID,
        platformProductId: p.id,
        name: p.name,
        price: p.price,
        compareAtPrice: p.compareAt ?? undefined,
        currency: 'SAR',
        stockQuantity: p.stock,
        category: p.category,
        brand: p.brand,
        isActive: true,
        syncedAt: new Date(),
        images: [`https://picsum.photos/seed/${p.id}/400/400`],
      },
      update: { name: p.name, price: p.price, stockQuantity: p.stock },
    });
    createdProducts.push(product);
  }
  console.log(`✅ Products: ${createdProducts.length} seeded`);

  // ── Customers ─────────────────────────────────────────────────────────────
  const customersData = [
    { name: 'Ahmed Ali',       phone: '+966501234567', email: 'ahmed@test.com',   city: 'Riyadh',  segment: CustomerSegment.vip,        orders: 8,  spent: 4200.00 },
    { name: 'Fatima Hassan',   phone: '+966507654321', email: 'fatima@test.com',  city: 'Jeddah',  segment: CustomerSegment.returning,  orders: 3,  spent: 890.00 },
    { name: 'Mohammed Salem',  phone: '+966509876543', email: 'mohammed@test.com',city: 'Makkah',  segment: CustomerSegment.new_customer, orders: 1, spent: 149.00 },
    { name: 'Sara Ahmed',      phone: '+966501122334', email: 'sara@test.com',    city: 'Riyadh',  segment: CustomerSegment.returning,  orders: 5,  spent: 2100.00 },
    { name: 'Omar Khalid',     phone: '+966505544332', email: 'omar@test.com',    city: 'Dammam',  segment: CustomerSegment.dormant,    orders: 2,  spent: 320.00 },
  ];

  const createdCustomers = [];
  for (const c of customersData) {
    const customer = await prisma.customer.upsert({
      where: { id: (await prisma.customer.findFirst({ where: { merchantId: MERCHANT_ID, phone: c.phone } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
      create: {
        merchantId: MERCHANT_ID,
        name: c.name,
        phone: c.phone,
        email: c.email,
        city: c.city,
        country: 'SA',
        segment: c.segment,
        sourceChannel: SourceChannel.web,
        totalOrders: c.orders,
        totalSpent: c.spent,
      },
      update: { totalOrders: c.orders, totalSpent: c.spent, segment: c.segment },
    });
    createdCustomers.push(customer);
  }
  console.log(`✅ Customers: ${createdCustomers.length} seeded`);

  // ── Orders ────────────────────────────────────────────────────────────────
  const orderStatuses = [OrderStatus.pending, OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered, OrderStatus.pending];
  const paymentStatuses = [PaymentStatus.pending, PaymentStatus.paid, PaymentStatus.paid, PaymentStatus.paid, PaymentStatus.paid];

  for (let i = 0; i < createdCustomers.length; i++) {
    const customer = createdCustomers[i];
    const product1 = createdProducts[i % createdProducts.length];
    const product2 = createdProducts[(i + 2) % createdProducts.length];

    const existing = await prisma.order.findFirst({
      where: { merchantId: MERCHANT_ID, platformOrderId: `SEED-ORDER-${i + 1}` },
    });
    if (existing) continue;

    const subtotal = Number(product1.price) * 1 + Number(product2.price) * 1;
    const shipping = 25.00;
    const total = subtotal + shipping;

    const order = await prisma.order.create({
      data: {
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        platformOrderId: `SEED-ORDER-${i + 1}`,
        status: orderStatuses[i],
        paymentStatus: paymentStatuses[i],
        paymentMethod: i % 2 === 0 ? 'visa' : 'mada',
        subtotal,
        discountAmount: 0,
        shippingCost: shipping,
        total,
        currency: 'SAR',
        shippingAddress: {
          address1: `${100 + i} King Fahd Rd`,
          city: customer.city ?? 'Riyadh',
          country: 'SA',
        },
        notes: i === 0 ? 'Please handle with care' : null,
        items: {
          create: [
            {
              productId: product1.id,
              quantity: 1,
              unitPrice: product1.price,
              totalPrice: product1.price,
            },
            {
              productId: product2.id,
              quantity: 1,
              unitPrice: product2.price,
              totalPrice: product2.price,
            },
          ],
        },
      },
    });

    console.log(`  Order ${order.platformOrderId ?? ''}: ${orderStatuses[i]} — SAR ${total}`);
  }
  console.log(`✅ Orders: ${createdCustomers.length} seeded`);

  // ── Shipping Carrier ──────────────────────────────────────────────────────
  await prisma.shippingCarrier.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      merchantId: MERCHANT_ID,
      carrierName: 'aramex',
      isActive: true,
      priority: 1,
    },
    update: {},
  });
  console.log('✅ Shipping carrier: Aramex seeded');

  console.log('\n🎉 Seed complete!');
  console.log('──────────────────────────────────────────');
  console.log(`Merchant ID (Shopify): ${MERCHANT_ID}`);
  console.log(`Merchant ID (Salla):   ${MERCHANT_2_ID}`);
  console.log('\nUse the Shopify merchant ID in Postman → Generate Token request.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
