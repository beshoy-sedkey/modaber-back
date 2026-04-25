import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatAgentService } from '../services/chat-agent.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'test-session-001';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const PRODUCT_ID = 'pppppppp-pppp-4ppp-pppp-pppppppppppp';
const CUSTOMER_ID = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const ORDER_ID = 'oooooooo-oooo-4ooo-oooo-oooooooooooo';

// Mock Redis instance
const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

const mockPrisma = {
  merchant: {
    findUnique: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  customer: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  order: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn((key: string, def?: string) => {
    const values: Record<string, string> = {
      REDIS_URL: 'redis://localhost:6379',
      API_BASE_URL: 'http://localhost:3000',
      OPENAI_API_KEY: 'sk-test-key',
    };
    return values[key] ?? def ?? '';
  }),
};

const mockEvents = {
  emit: jest.fn(),
};

// ─── Mock LangChain ChatOpenAI ─────────────────────────────────────────────────

const mockStream = jest.fn();
const mockBindTools = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    bindTools: mockBindTools,
  })),
}));

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('ChatAgentService', () => {
  let service: ChatAgentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: conversation doesn't exist yet
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({
      id: CONVERSATION_ID,
      merchantId: MERCHANT_ID,
      totalMessages: 0,
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.message.create.mockResolvedValue({});
    mockPrisma.message.findMany.mockResolvedValue([]);

    mockPrisma.merchant.findUnique.mockResolvedValue({
      id: MERCHANT_ID,
      name: 'Test Store',
      settings: {},
    });

    // Set up model mock to stream a simple response by default
    async function* fakeStream() {
      yield { content: 'Hello! ', tool_calls: [], additional_kwargs: {} };
      yield { content: 'How can I help?', tool_calls: [], additional_kwargs: {} };
    }

    mockStream.mockReturnValue(fakeStream());
    mockBindTools.mockReturnValue({ stream: mockStream });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAgentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ChatAgentService>(ChatAgentService);
  });

  // ─── processMessage basic flow ─────────────────────────────────────────────

  describe('processMessage', () => {
    it('should yield streamed text chunks', async () => {
      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello there',
      )) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toContain('Hello');
    });

    it('should create a conversation when one does not exist', async () => {
      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello',
      )) {
        chunks.push(chunk);
      }

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            sessionId: SESSION_ID,
            channel: 'web',
            status: 'active',
          }),
        }),
      );
    });

    it('should reuse existing conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        merchantId: MERCHANT_ID,
        totalMessages: 4,
      });

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello again',
      )) {
        chunks.push(chunk);
      }

      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should persist user and assistant messages to PostgreSQL', async () => {
      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Show me products',
      )) {
        chunks.push(chunk);
      }

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user', content: 'Show me products' }),
        }),
      );
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'assistant' }),
        }),
      );
    });

    it('should update conversation message count', async () => {
      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello',
      )) {
        chunks.push(chunk);
      }

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalMessages: { increment: 2 } }),
        }),
      );
    });

    it('should use gpt-4o-mini model for first 10 turns', async () => {
      // totalMessages = 0, so turn count = 0, should use mini
      const { ChatOpenAI } = jest.requireMock<typeof import('@langchain/openai')>(
        '@langchain/openai',
      );

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello',
      )) {
        chunks.push(chunk);
      }

      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ modelName: 'gpt-4o-mini' }),
      );
    });

    it('should escalate to gpt-4o after 10 turns (totalMessages >= 20)', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        merchantId: MERCHANT_ID,
        totalMessages: 20, // 10 user turns
      });

      const { ChatOpenAI } = jest.requireMock<typeof import('@langchain/openai')>(
        '@langchain/openai',
      );

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Hello',
      )) {
        chunks.push(chunk);
      }

      expect(ChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ modelName: 'gpt-4o' }),
      );
    });
  });

  // ─── Tool: search_products ─────────────────────────────────────────────────

  describe('search_products tool', () => {
    it('should invoke search_products tool and return matching products', async () => {
      // Mock model to trigger the search_products tool call
      async function* toolCallStream() {
        yield {
          content: '',
          tool_calls: [
            {
              id: 'call_001',
              name: 'search_products',
              args: { query: 'laptop', limit: 5 },
              type: 'tool_call',
            },
          ],
          additional_kwargs: {},
        };
      }

      async function* finalStream() {
        yield {
          content: 'Here are some laptops I found!',
          tool_calls: [],
          additional_kwargs: {},
        };
      }

      mockStream
        .mockReturnValueOnce(toolCallStream())
        .mockReturnValueOnce(finalStream());

      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: PRODUCT_ID,
          name: 'Dell Laptop',
          price: '3500.00',
          currency: 'SAR',
          stockQuantity: 10,
          category: 'Electronics',
          description: 'A great laptop',
        },
      ]);

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'Show me laptops',
      )) {
        chunks.push(chunk);
      }

      // Verify the product search was executed with merchantId filter
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: MERCHANT_ID }),
        }),
      );

      // Verify final response was produced
      expect(chunks.join('')).toContain('laptops');
    });

    it('should return no products message when none found', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const searchTool = tools.find((t) => t.name === 'search_products');
      expect(searchTool).toBeDefined();

      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await searchTool!.invoke({ query: 'nonexistent', limit: 5 });
      expect(result).toContain('No products found');
    });

    it('should filter products by merchantId (tenant isolation)', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const searchTool = tools.find((t) => t.name === 'search_products');
      expect(searchTool).toBeDefined();

      mockPrisma.product.findMany.mockResolvedValue([]);

      await searchTool!.invoke({ query: 'test', limit: 3 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: MERCHANT_ID }),
        }),
      );
    });

    it('should include category filter when provided', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const searchTool = tools.find((t) => t.name === 'search_products');
      expect(searchTool).toBeDefined();

      mockPrisma.product.findMany.mockResolvedValue([]);

      await searchTool!.invoke({ query: 'shirt', category: 'Clothing', limit: 5 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: MERCHANT_ID,
            category: 'Clothing',
          }),
        }),
      );
    });
  });

  // ─── Tool: get_payment_link ────────────────────────────────────────────────

  describe('get_payment_link tool', () => {
    const orderInput = {
      items: [{ productId: PRODUCT_ID, quantity: 2, productName: 'Test Product' }],
      customerName: 'John Doe',
      customerPhone: '+966501234567',
      customerEmail: 'john@example.com',
      shippingAddress: '123 Main St',
      city: 'Riyadh',
      country: 'SA',
    };

    beforeEach(() => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Test Product',
        price: '100.00',
        stockQuantity: 10,
      });
      mockPrisma.customer.findFirst.mockResolvedValue(null);
      mockPrisma.customer.create.mockResolvedValue({ id: CUSTOMER_ID });
      mockPrisma.order.create.mockResolvedValue({ id: ORDER_ID });
      mockPrisma.conversation.update.mockResolvedValue({});
    });

    it('should create a pending order and return a payment URL', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      const result = await paymentTool!.invoke(orderInput);

      expect(typeof result).toBe('string');
      expect(result).toContain('Order created successfully');
      expect(result).toContain(ORDER_ID);
      expect(result).toContain('/checkout/');
    });

    it('should create the order with pending status', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            status: 'pending',
            paymentStatus: 'pending',
          }),
        }),
      );
    });

    it('should include order items in order creation', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                expect.objectContaining({
                  productId: PRODUCT_ID,
                  quantity: 2,
                  unitPrice: 100,
                  totalPrice: 200,
                }),
              ],
            },
          }),
        }),
      );
    });

    it('should upsert customer when phone not found', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockPrisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            name: 'John Doe',
            phone: '+966501234567',
          }),
        }),
      );
    });

    it('should reuse existing customer by phone', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: CUSTOMER_ID,
        name: 'John Doe',
        phone: '+966501234567',
        email: null,
        city: null,
        country: null,
      });
      mockPrisma.customer.update.mockResolvedValue({ id: CUSTOMER_ID });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockPrisma.customer.create).not.toHaveBeenCalled();
      expect(mockPrisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CUSTOMER_ID } }),
      );
    });

    it('should return error when product is not found', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      const result = await paymentTool!.invoke(orderInput);
      expect(result).toContain('Product not found');
    });

    it('should return error when insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Test Product',
        price: '100.00',
        stockQuantity: 1, // only 1 in stock but order wants 2
      });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      const result = await paymentTool!.invoke(orderInput);
      expect(result).toContain('Insufficient stock');
    });

    it('should emit chat.order.created event after order creation', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'chat.order.created',
        expect.objectContaining({
          orderId: ORDER_ID,
          merchantId: MERCHANT_ID,
          customerPhone: '+966501234567',
        }),
      );
    });

    it('should scope product lookup to merchantId (tenant isolation)', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      await paymentTool!.invoke(orderInput);

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: MERCHANT_ID }),
        }),
      );
    });

    it('should include payment URL with order ID in the response', async () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const paymentTool = tools.find((t) => t.name === 'get_payment_link');
      expect(paymentTool).toBeDefined();

      const result = await paymentTool!.invoke(orderInput);

      expect(result).toContain(`/checkout/${ORDER_ID}`);
    });
  });

  // ─── Tool: check_order_status ──────────────────────────────────────────────

  describe('check_order_status tool', () => {
    it('should return order details when found by orderId', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: ORDER_ID,
        status: 'shipped',
        paymentStatus: 'paid',
        total: '200.00',
        currency: 'SAR',
        createdAt: new Date('2026-01-01'),
        shipment: {
          status: 'in_transit',
          trackingNumber: 'TRK12345',
          estimatedDelivery: new Date('2026-01-05'),
        },
      });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const orderTool = tools.find((t) => t.name === 'check_order_status');
      expect(orderTool).toBeDefined();

      const result = await orderTool!.invoke({ orderId: ORDER_ID });
      const parsed = JSON.parse(result) as { status: string; shipment: { trackingNumber: string } };
      expect(parsed.status).toBe('shipped');
      expect(parsed.shipment.trackingNumber).toBe('TRK12345');
    });

    it('should return not found message when order does not exist', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const orderTool = tools.find((t) => t.name === 'check_order_status');
      expect(orderTool).toBeDefined();

      const result = await orderTool!.invoke({ orderId: 'bad-id' });
      expect(result).toContain('not found');
    });

    it('should filter by merchantId (tenant isolation)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const orderTool = tools.find((t) => t.name === 'check_order_status');
      expect(orderTool).toBeDefined();

      await orderTool!.invoke({ orderId: ORDER_ID });

      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: MERCHANT_ID }),
        }),
      );
    });
  });

  // ─── Notification opt-in ───────────────────────────────────────────────────

  describe('notification opt-in detection', () => {
    it('should set notifyOnShip when message contains ship notification request', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        merchantId: MERCHANT_ID,
        totalMessages: 2,
      });

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'please notify me when my order ships',
      )) {
        chunks.push(chunk);
      }

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONVERSATION_ID },
          data: expect.objectContaining({ notifyOnShip: true }),
        }),
      );
    });

    it('should emit chat.notification.opted_in event on opt-in', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_ID,
        merchantId: MERCHANT_ID,
        totalMessages: 2,
      });

      const chunks: string[] = [];
      for await (const chunk of service.processMessage(
        MERCHANT_ID,
        SESSION_ID,
        'notify me when order is dispatched',
      )) {
        chunks.push(chunk);
      }

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'chat.notification.opted_in',
        expect.objectContaining({
          conversationId: CONVERSATION_ID,
          merchantId: MERCHANT_ID,
          notifyOnShip: true,
        }),
      );
    });
  });

  // ─── Tool: collect_customer_info ───────────────────────────────────────────

  describe('collect_customer_info tool', () => {
    it('should update conversation with customer phone', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const collectTool = tools.find((t) => t.name === 'collect_customer_info');
      expect(collectTool).toBeDefined();

      await collectTool!.invoke({
        name: 'Jane Doe',
        phone: '+966501111111',
        email: 'jane@example.com',
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: SESSION_ID },
          data: expect.objectContaining({ customerPhone: '+966501111111' }),
        }),
      );
    });

    it('should create a new customer when phone not in DB', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const collectTool = tools.find((t) => t.name === 'collect_customer_info');
      expect(collectTool).toBeDefined();

      await collectTool!.invoke({
        name: 'Jane Doe',
        phone: '+966501111111',
        email: 'jane@example.com',
      });

      expect(mockPrisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            name: 'Jane Doe',
            phone: '+966501111111',
          }),
        }),
      );
    });
  });

  // ─── Tool: add_to_cart ─────────────────────────────────────────────────────

  describe('add_to_cart tool', () => {
    it('should return confirmation when product added successfully', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Test Product',
        price: '99.00',
        currency: 'SAR',
        stockQuantity: 20,
      });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const cartTool = tools.find((t) => t.name === 'add_to_cart');
      expect(cartTool).toBeDefined();

      const result = await cartTool!.invoke({ productId: PRODUCT_ID, quantity: 1 });
      expect(result).toContain('Added 1x Test Product');
    });

    it('should reject when insufficient stock', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Test Product',
        price: '99.00',
        currency: 'SAR',
        stockQuantity: 0,
      });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const cartTool = tools.find((t) => t.name === 'add_to_cart');
      expect(cartTool).toBeDefined();

      const result = await cartTool!.invoke({ productId: PRODUCT_ID, quantity: 1 });
      expect(result).toContain('only 0 units available');
    });

    it('should emit cart item added event', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: PRODUCT_ID,
        name: 'Test Product',
        price: '99.00',
        currency: 'SAR',
        stockQuantity: 20,
      });

      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const cartTool = tools.find((t) => t.name === 'add_to_cart');
      expect(cartTool).toBeDefined();

      await cartTool!.invoke({ productId: PRODUCT_ID, quantity: 2 });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'chat.cart.item_added',
        expect.objectContaining({
          productId: PRODUCT_ID,
          quantity: 2,
          merchantId: MERCHANT_ID,
          sessionId: SESSION_ID,
        }),
      );
    });
  });

  // ─── buildTools returns all 6 tools ────────────────────────────────────────

  describe('buildTools', () => {
    it('should return all 6 expected tools', () => {
      const tools = service.buildTools(MERCHANT_ID, SESSION_ID, CONVERSATION_ID);
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('search_products');
      expect(toolNames).toContain('get_product_details');
      expect(toolNames).toContain('check_order_status');
      expect(toolNames).toContain('collect_customer_info');
      expect(toolNames).toContain('add_to_cart');
      expect(toolNames).toContain('get_payment_link');
      expect(tools).toHaveLength(6);
    });
  });
});
