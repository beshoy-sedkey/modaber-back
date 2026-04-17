import {
  PrismaClient,
  PlatformType,
  PlanTier,
  OrderStatus,
  PaymentStatus,
  CustomerSegment,
  SourceChannel,
  ShipmentStatus,
  CarrierName,
  ConversationChannel,
  ConversationStatus,
  MessageRole,
} from '@prisma/client';

const prisma = new PrismaClient();

const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
const MERCHANT_2_ID = '00000000-0000-0000-0000-000000000002';
const ARAMEX_CARRIER_ID = '00000000-0000-0000-0000-000000000010';
const SMSA_CARRIER_ID = '00000000-0000-0000-0000-000000000011';

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

  // ── Shipping Carriers ─────────────────────────────────────────────────────
  await prisma.shippingCarrier.upsert({
    where: { id: ARAMEX_CARRIER_ID },
    create: {
      id: ARAMEX_CARRIER_ID,
      merchantId: MERCHANT_ID,
      carrierName: CarrierName.aramex,
      isActive: true,
      priority: 1,
    },
    update: {},
  });

  await prisma.shippingCarrier.upsert({
    where: { id: SMSA_CARRIER_ID },
    create: {
      id: SMSA_CARRIER_ID,
      merchantId: MERCHANT_ID,
      carrierName: CarrierName.smsa,
      isActive: true,
      priority: 2,
    },
    update: {},
  });
  console.log('✅ Shipping carriers: Aramex + SMSA seeded');

  // ── Orders (15 total, spread across last 30 days) ─────────────────────────
  const ordersConfig = [
    { idx: 0,  custIdx: 0, prod1Idx: 0,  prod2Idx: 2,  status: OrderStatus.pending,   payStatus: PaymentStatus.pending, daysAgo: 1,  extra: 0 },
    { idx: 1,  custIdx: 1, prod1Idx: 1,  prod2Idx: 3,  status: OrderStatus.confirmed,  payStatus: PaymentStatus.paid,    daysAgo: 2,  extra: 0 },
    { idx: 2,  custIdx: 2, prod1Idx: 2,  prod2Idx: 4,  status: OrderStatus.shipped,    payStatus: PaymentStatus.paid,    daysAgo: 4,  extra: 0 },
    { idx: 3,  custIdx: 3, prod1Idx: 3,  prod2Idx: 5,  status: OrderStatus.delivered,  payStatus: PaymentStatus.paid,    daysAgo: 6,  extra: 0 },
    { idx: 4,  custIdx: 4, prod1Idx: 4,  prod2Idx: 6,  status: OrderStatus.pending,    payStatus: PaymentStatus.paid,    daysAgo: 8,  extra: 0 },
    { idx: 5,  custIdx: 0, prod1Idx: 5,  prod2Idx: 7,  status: OrderStatus.confirmed,  payStatus: PaymentStatus.paid,    daysAgo: 10, extra: 100 },
    { idx: 6,  custIdx: 1, prod1Idx: 6,  prod2Idx: 8,  status: OrderStatus.shipped,    payStatus: PaymentStatus.paid,    daysAgo: 12, extra: 50 },
    { idx: 7,  custIdx: 2, prod1Idx: 7,  prod2Idx: 9,  status: OrderStatus.delivered,  payStatus: PaymentStatus.paid,    daysAgo: 14, extra: 200 },
    { idx: 8,  custIdx: 3, prod1Idx: 8,  prod2Idx: 0,  status: OrderStatus.cancelled,  payStatus: PaymentStatus.failed,  daysAgo: 16, extra: 0 },
    { idx: 9,  custIdx: 4, prod1Idx: 9,  prod2Idx: 1,  status: OrderStatus.returned,   payStatus: PaymentStatus.refunded, daysAgo: 18, extra: 0 },
    { idx: 10, custIdx: 0, prod1Idx: 0,  prod2Idx: 3,  status: OrderStatus.confirmed,  payStatus: PaymentStatus.paid,    daysAgo: 20, extra: 300 },
    { idx: 11, custIdx: 1, prod1Idx: 1,  prod2Idx: 4,  status: OrderStatus.shipped,    payStatus: PaymentStatus.paid,    daysAgo: 22, extra: 150 },
    { idx: 12, custIdx: 2, prod1Idx: 2,  prod2Idx: 5,  status: OrderStatus.delivered,  payStatus: PaymentStatus.paid,    daysAgo: 24, extra: 75 },
    { idx: 13, custIdx: 3, prod1Idx: 3,  prod2Idx: 6,  status: OrderStatus.pending,    payStatus: PaymentStatus.pending, daysAgo: 26, extra: 0 },
    { idx: 14, custIdx: 4, prod1Idx: 4,  prod2Idx: 7,  status: OrderStatus.delivered,  payStatus: PaymentStatus.paid,    daysAgo: 29, extra: 500 },
  ];

  const createdOrders = [];
  for (const cfg of ordersConfig) {
    const existing = await prisma.order.findFirst({
      where: { merchantId: MERCHANT_ID, platformOrderId: `SEED-ORDER-${cfg.idx + 1}` },
    });

    const customer = createdCustomers[cfg.custIdx];
    const product1 = createdProducts[cfg.prod1Idx];
    const product2 = createdProducts[cfg.prod2Idx];

    const createdAtDate = new Date(Date.now() - cfg.daysAgo * 86400000);
    const subtotal = Number(product1.price) + Number(product2.price) + cfg.extra;
    const shipping = 25.00;
    const total = subtotal + shipping;

    if (existing) {
      createdOrders.push(existing);
      continue;
    }

    const order = await prisma.order.create({
      data: {
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        platformOrderId: `SEED-ORDER-${cfg.idx + 1}`,
        status: cfg.status,
        paymentStatus: cfg.payStatus,
        paymentMethod: cfg.idx % 2 === 0 ? 'visa' : 'mada',
        subtotal,
        discountAmount: 0,
        shippingCost: shipping,
        total,
        currency: 'SAR',
        createdAt: createdAtDate,
        shippingAddress: {
          address1: `${100 + cfg.idx} King Fahd Rd`,
          city: customer.city ?? 'Riyadh',
          country: 'SA',
        },
        notes: cfg.idx === 0 ? 'Please handle with care' : null,
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

    console.log(`  Order ${order.platformOrderId ?? ''}: ${cfg.status} — SAR ${total}`);
    createdOrders.push(order);
  }
  console.log(`✅ Orders: ${ordersConfig.length} total`);

  // ── Shipments ─────────────────────────────────────────────────────────────
  const shippableStatuses: OrderStatus[] = [OrderStatus.shipped, OrderStatus.delivered];

  for (const order of createdOrders) {
    if (!shippableStatuses.includes(order.status as OrderStatus)) continue;

    const shipmentStatus =
      order.status === OrderStatus.delivered
        ? ShipmentStatus.delivered
        : ShipmentStatus.in_transit;

    const existing = await prisma.shipment.findFirst({
      where: { orderId: order.id },
    });
    if (existing) continue;

    await prisma.shipment.create({
      data: {
        orderId: order.id,
        merchantId: MERCHANT_ID,
        carrierId: ARAMEX_CARRIER_ID,
        trackingNumber: `ARX-${order.platformOrderId ?? order.id}`,
        status: shipmentStatus,
        estimatedCost: 25.00,
        weightKg: 0.5,
        shippedAt: order.status === OrderStatus.shipped ? new Date() : undefined,
        deliveredAt: order.status === OrderStatus.delivered ? new Date() : undefined,
      },
    });
    console.log(`  Shipment created for ${order.platformOrderId ?? order.id}: ${shipmentStatus}`);
  }
  console.log('✅ Shipments seeded');

  // ── Conversations & Messages ──────────────────────────────────────────────
  const conversationsData = [
    {
      sessionId: 'seed-session-001',
      channel: ConversationChannel.web,
      status: ConversationStatus.closed,
      resolvedByAi: true,
      customerIdx: 0,
      messages: [
        { role: MessageRole.user,      content: 'What is the status of my order?',           tokensInput: 12, tokensOutput: 0, latencyMs: null },
        { role: MessageRole.assistant, content: 'Your order is currently being processed.',   tokensInput: 0,  tokensOutput: 20, latencyMs: 320 },
        { role: MessageRole.user,      content: 'How long will it take?',                     tokensInput: 8,  tokensOutput: 0, latencyMs: null },
        { role: MessageRole.assistant, content: 'Estimated delivery is within 2-3 days.',    tokensInput: 0,  tokensOutput: 18, latencyMs: 290 },
      ],
    },
    {
      sessionId: 'seed-session-002',
      channel: ConversationChannel.whatsapp,
      status: ConversationStatus.closed,
      resolvedByAi: true,
      customerIdx: 1,
      messages: [
        { role: MessageRole.user,      content: 'I want to return a product.',                tokensInput: 9,  tokensOutput: 0, latencyMs: null },
        { role: MessageRole.assistant, content: 'Sure! Please provide your order number.',   tokensInput: 0,  tokensOutput: 15, latencyMs: 310 },
        { role: MessageRole.user,      content: 'Order number is SEED-ORDER-2.',             tokensInput: 10, tokensOutput: 0, latencyMs: null },
        { role: MessageRole.assistant, content: 'I have initiated the return process.',      tokensInput: 0,  tokensOutput: 22, latencyMs: 350 },
        { role: MessageRole.user,      content: 'Thank you.',                                tokensInput: 3,  tokensOutput: 0, latencyMs: null },
      ],
    },
    {
      sessionId: 'seed-session-003',
      channel: ConversationChannel.web,
      status: ConversationStatus.active,
      resolvedByAi: false,
      customerIdx: 2,
      messages: [
        { role: MessageRole.user,      content: 'Do you have the Arabic Coffee Maker in stock?', tokensInput: 14, tokensOutput: 0, latencyMs: null },
        { role: MessageRole.assistant, content: 'Yes, we have it in stock! Price is SAR 149.',   tokensInput: 0,  tokensOutput: 20, latencyMs: 280 },
        { role: MessageRole.user,      content: 'Can I get a discount?',                          tokensInput: 7,  tokensOutput: 0, latencyMs: null },
      ],
    },
  ];

  for (const convData of conversationsData) {
    const existingConv = await prisma.conversation.findUnique({
      where: { sessionId: convData.sessionId },
    });
    if (existingConv) {
      console.log(`  Conversation ${convData.sessionId}: already exists, skipping`);
      continue;
    }

    const customer = createdCustomers[convData.customerIdx];
    const totalMessages = convData.messages.length;
    const totalTokens = convData.messages.reduce(
      (acc, m) => acc + (m.tokensInput ?? 0) + (m.tokensOutput ?? 0),
      0,
    );

    const conv = await prisma.conversation.create({
      data: {
        merchantId: MERCHANT_ID,
        customerId: customer.id,
        sessionId: convData.sessionId,
        channel: convData.channel,
        status: convData.status,
        resolvedByAi: convData.resolvedByAi,
        totalMessages,
        totalTokens,
        startedAt: new Date(Date.now() - 5 * 86400000),
        endedAt: convData.status === ConversationStatus.closed ? new Date(Date.now() - 4 * 86400000) : null,
      },
    });

    for (const msg of convData.messages) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          role: msg.role,
          content: msg.content,
          tokensInput: msg.tokensInput ?? null,
          tokensOutput: msg.tokensOutput ?? null,
          latencyMs: msg.latencyMs ?? null,
        },
      });
    }

    console.log(`  Conversation ${convData.sessionId}: ${totalMessages} messages seeded`);
  }
  console.log('✅ Conversations & Messages seeded');

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
