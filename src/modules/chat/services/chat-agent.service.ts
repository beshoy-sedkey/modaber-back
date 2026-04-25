import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import Redis from 'ioredis';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_REDIS_MESSAGES = 20;
const REDIS_TTL_SECONDS = 60 * 60 * 24; // 24h
const TURNS_BEFORE_ESCALATION = 10; // escalate to gpt-4o after 10 user turns

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly productName: string;
}

interface CustomerInfo {
  readonly name?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly address?: string;
  readonly city?: string;
  readonly country?: string;
}

interface RedisChatMessage {
  readonly role: 'human' | 'assistant' | 'system';
  readonly content: string;
}

// ─── ChatAgentService ─────────────────────────────────────────────────────────

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);
  private readonly redis: Redis;
  private readonly apiBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
    this.apiBase = this.config.get<string>(
      'API_BASE_URL',
      'http://localhost:3000',
    );
  }

  // ─── Public entry point ────────────────────────────────────────────────────

  /**
   * Process a customer message and stream AI response tokens back.
   * Handles tool invocations internally; callers receive only text chunks.
   */
  async *processMessage(
    merchantId: string,
    sessionId: string,
    userMessage: string,
  ): AsyncGenerator<string> {
    // 1. Find or create conversation record
    const conversation = await this.upsertConversation(merchantId, sessionId);
    const conversationId = conversation.id;
    const totalMessages = conversation.totalMessages;

    // 2. Persist user message to PostgreSQL
    await this.persistMessage(conversationId, 'user', userMessage);

    // 3. Update Redis cache with user message
    await this.pushToRedis(sessionId, { role: 'human', content: userMessage });

    // 4. Proactive notification opt-in detection
    await this.handleNotificationOptIn(
      conversationId,
      merchantId,
      userMessage,
      sessionId,
    );

    // 5. Build message history from Redis cache
    const history = await this.getRedisHistory(sessionId);

    // 6. Get merchant info for system prompt
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true, settings: true },
    });

    // 7. Choose model: escalate to gpt-4o after TURNS_BEFORE_ESCALATION turns
    const userTurns = Math.ceil(totalMessages / 2);
    const modelName =
      userTurns >= TURNS_BEFORE_ESCALATION ? 'gpt-4o' : 'gpt-4o-mini';

    this.logger.log(
      `processMessage merchantId=${merchantId} session=${sessionId} model=${modelName} turns=${userTurns}`,
    );

    // 8. Build tools
    const tools = this.buildTools(merchantId, sessionId, conversationId);

    // 9. Build LLM
    const model = new ChatOpenAI({
      openAIApiKey: this.config.get<string>('OPENAI_API_KEY'),
      modelName,
      streaming: true,
      temperature: 0.3,
    }).bindTools(tools);

    // 10. Build messages array
    const merchantName = merchant?.name ?? 'our store';
    const systemPrompt = this.buildSystemPrompt(merchantName);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...history,
    ];

    // 11. Stream response — handle tool calls in agentic loop
    let fullResponse = '';
    let toolCallsJson: string | undefined;

    fullResponse = yield* this.agentLoop(
      model,
      messages,
      tools,
      merchantId,
      sessionId,
      conversationId,
    );

    // 12. Persist assistant reply to PostgreSQL
    await this.persistMessage(conversationId, 'assistant', fullResponse, {
      toolCalls: toolCallsJson,
    });

    // 13. Update Redis cache with assistant reply
    await this.pushToRedis(sessionId, {
      role: 'assistant',
      content: fullResponse,
    });

    // 14. Update conversation message count
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { totalMessages: { increment: 2 } },
    });
  }

  // ─── Agentic loop ──────────────────────────────────────────────────────────

  private async *agentLoop(
    model: ReturnType<ChatOpenAI['bindTools']>,
    messages: BaseMessage[],
    tools: DynamicStructuredTool[],
    merchantId: string,
    sessionId: string,
    conversationId: string,
  ): AsyncGenerator<string, string> {
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    let currentMessages = [...messages];
    let accumulatedText = '';

    // Max 5 iterations to prevent infinite loops
    for (let iteration = 0; iteration < 5; iteration++) {
      let streamedContent = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCallsAccum: Array<{ id: string; name: string; args: any }> = [];

      // Stream from LLM
      const stream = await model.stream(currentMessages);

      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content) {
          streamedContent += content;
          accumulatedText += content;
          yield content;
        }

        // Accumulate tool calls from streaming chunks
        if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
          for (const tc of chunk.tool_calls) {
            if (tc.id && tc.name) {
              toolCallsAccum.push({
                id: tc.id as string,
                name: tc.name as string,
                args: tc.args as Record<string, unknown>,
              });
            }
          }
        }
        if (
          chunk.additional_kwargs?.tool_calls &&
          Array.isArray(chunk.additional_kwargs.tool_calls)
        ) {
          for (const tc of chunk.additional_kwargs.tool_calls as Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>) {
            if (tc.id && tc.function?.name) {
              try {
                const args = JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown>;
                const existing = toolCallsAccum.find((t) => t.id === tc.id);
                if (!existing) {
                  toolCallsAccum.push({
                    id: tc.id,
                    name: tc.function.name,
                    args,
                  });
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }

      // If no tool calls, we're done
      if (toolCallsAccum.length === 0) {
        break;
      }

      // Execute tool calls
      const aiMessage = new AIMessage({
        content: streamedContent,
        tool_calls: toolCallsAccum.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args as Record<string, unknown>,
          type: 'tool_call' as const,
        })),
      });
      currentMessages.push(aiMessage);

      const toolMessages: ToolMessage[] = [];
      for (const tc of toolCallsAccum) {
        const tool = toolMap.get(tc.name);
        let result: string;
        if (tool) {
          try {
            result = String(await tool.invoke(tc.args));
          } catch (err) {
            result = `Error executing tool ${tc.name}: ${String(err)}`;
          }
        } else {
          result = `Tool ${tc.name} not found`;
        }

        toolMessages.push(
          new ToolMessage({
            content: result,
            tool_call_id: tc.id,
          }),
        );
      }

      currentMessages.push(...toolMessages);
    }

    return accumulatedText;
  }

  // ─── Tool definitions ─────────────────────────────────────────────────────

  buildTools(
    merchantId: string,
    sessionId: string,
    conversationId: string,
  ): DynamicStructuredTool[] {
    const prisma = this.prisma;
    const events = this.events;
    const apiBase = this.apiBase;
    const logger = this.logger;

    // 1. search_products
    const searchProducts = new DynamicStructuredTool({
      name: 'search_products',
      description:
        'Search for products in the catalog by keyword, category, or attributes. Use when customer asks about products, prices, availability.',
      schema: z.object({
        query: z.string().describe('Search query text'),
        category: z.string().optional().describe('Optional product category filter'),
        limit: z.number().optional().default(5).describe('Max results to return'),
      }),
      func: async ({ query, category, limit }) => {
        const where: {
          merchantId: string;
          isActive: boolean;
          category?: string;
          OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }>;
        } = {
          merchantId,
          isActive: true,
        };

        if (category) {
          where.category = category;
        }

        if (query) {
          where.OR = [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ];
        }

        const products = await prisma.product.findMany({
          where,
          take: limit ?? 5,
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            stockQuantity: true,
            category: true,
            description: true,
          },
        });

        if (products.length === 0) {
          return 'No products found matching your search.';
        }

        const lines = products.map(
          (p) =>
            `- ${p.name} | Price: ${p.price} ${p.currency} | Stock: ${p.stockQuantity} | ID: ${p.id}${p.category ? ` | Category: ${p.category}` : ''}`,
        );
        return `Found ${products.length} products:\n${lines.join('\n')}`;
      },
    });

    // 2. get_product_details
    const getProductDetails = new DynamicStructuredTool({
      name: 'get_product_details',
      description:
        'Get full details of a specific product by its ID. Use after search_products to get more information.',
      schema: z.object({
        productId: z.string().describe('The product UUID'),
      }),
      func: async ({ productId }) => {
        const product = await prisma.product.findFirst({
          where: { id: productId, merchantId, isActive: true },
        });

        if (!product) {
          return 'Product not found.';
        }

        return JSON.stringify({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          currency: product.currency,
          stockQuantity: product.stockQuantity,
          category: product.category,
          brand: product.brand,
          attributes: product.attributes,
        });
      },
    });

    // 3. check_order_status
    const checkOrderStatus = new DynamicStructuredTool({
      name: 'check_order_status',
      description:
        'Check the status of an existing order. Use when customer asks about their order or tracking.',
      schema: z.object({
        orderId: z
          .string()
          .optional()
          .describe('The order UUID (if known)'),
        platformOrderId: z
          .string()
          .optional()
          .describe('The platform order ID (if UUID not known)'),
        customerPhone: z
          .string()
          .optional()
          .describe('Customer phone number to look up their orders'),
      }),
      func: async ({ orderId, platformOrderId, customerPhone }) => {
        let order: {
          id: string;
          status: string;
          paymentStatus: string;
          total: unknown;
          currency: string;
          createdAt: Date;
          shipment: { status: string; trackingNumber: string | null; estimatedDelivery: Date | null } | null;
        } | null = null;

        if (orderId) {
          order = await prisma.order.findFirst({
            where: { id: orderId, merchantId },
            include: {
              shipment: {
                select: {
                  status: true,
                  trackingNumber: true,
                  estimatedDelivery: true,
                },
              },
            },
          });
        } else if (platformOrderId) {
          order = await prisma.order.findFirst({
            where: { platformOrderId, merchantId },
            include: {
              shipment: {
                select: {
                  status: true,
                  trackingNumber: true,
                  estimatedDelivery: true,
                },
              },
            },
          });
        } else if (customerPhone) {
          const customer = await prisma.customer.findFirst({
            where: { phone: customerPhone, merchantId },
            select: { id: true },
          });

          if (customer) {
            order = await prisma.order.findFirst({
              where: { customerId: customer.id, merchantId },
              orderBy: { createdAt: 'desc' },
              include: {
                shipment: {
                  select: {
                    status: true,
                    trackingNumber: true,
                    estimatedDelivery: true,
                  },
                },
              },
            });
          }
        }

        if (!order) {
          return 'Order not found. Please provide a valid order ID or phone number.';
        }

        return JSON.stringify({
          orderId: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          currency: order.currency,
          createdAt: order.createdAt,
          shipment: order.shipment
            ? {
                status: order.shipment.status,
                trackingNumber: order.shipment.trackingNumber,
                estimatedDelivery: order.shipment.estimatedDelivery,
              }
            : null,
        });
      },
    });

    // 4. collect_customer_info
    const collectCustomerInfo = new DynamicStructuredTool({
      name: 'collect_customer_info',
      description:
        'Save customer information collected during conversation. Use when customer provides their name, phone, email, or address.',
      schema: z.object({
        name: z.string().optional().describe('Customer full name'),
        phone: z.string().optional().describe('Customer phone number'),
        email: z.string().optional().describe('Customer email address'),
        address: z.string().optional().describe('Customer shipping address'),
        city: z.string().optional().describe('Customer city'),
        country: z.string().optional().describe('Customer country'),
      }),
      func: async (info: CustomerInfo) => {
        // Store customer info on the conversation record for later use
        await prisma.conversation.update({
          where: { sessionId },
          data: {
            customerPhone: info.phone ?? undefined,
          },
        });

        // Upsert customer record if phone or email is provided
        if (info.phone || info.email) {
          const existing = await prisma.customer.findFirst({
            where: {
              merchantId,
              OR: [
                info.phone ? { phone: info.phone } : undefined,
                info.email ? { email: info.email } : undefined,
              ].filter(
                (c): c is { phone: string } | { email: string } => !!c,
              ),
            },
          });

          if (existing) {
            await prisma.customer.update({
              where: { id: existing.id },
              data: {
                name: info.name ?? existing.name,
                phone: info.phone ?? existing.phone ?? undefined,
                email: info.email ?? existing.email ?? undefined,
                city: info.city ?? existing.city ?? undefined,
                country: info.country ?? existing.country ?? undefined,
              },
            });

            // Link conversation to customer
            await prisma.conversation.update({
              where: { sessionId },
              data: { customerId: existing.id },
            });
          } else if (info.name) {
            const newCustomer = await prisma.customer.create({
              data: {
                merchantId,
                name: info.name,
                phone: info.phone ?? undefined,
                email: info.email ?? undefined,
                city: info.city ?? undefined,
                country: info.country ?? undefined,
                sourceChannel: 'whatsapp',
              },
            });

            await prisma.conversation.update({
              where: { sessionId },
              data: { customerId: newCustomer.id },
            });
          }
        }

        return 'Customer information saved successfully.';
      },
    });

    // 5. add_to_cart
    const addToCart = new DynamicStructuredTool({
      name: 'add_to_cart',
      description:
        'Add a product to the customer cart for this session. Tracks items before payment link generation.',
      schema: z.object({
        productId: z.string().describe('Product UUID to add'),
        quantity: z
          .number()
          .min(1)
          .default(1)
          .describe('Quantity to add'),
      }),
      func: async ({ productId, quantity }) => {
        const product = await prisma.product.findFirst({
          where: { id: productId, merchantId, isActive: true },
          select: { id: true, name: true, price: true, currency: true, stockQuantity: true },
        });

        if (!product) {
          return 'Product not found or not available.';
        }

        if (product.stockQuantity < quantity) {
          return `Sorry, only ${product.stockQuantity} units available in stock.`;
        }

        logger.log(
          `add_to_cart productId=${productId} quantity=${quantity} session=${sessionId}`,
        );

        // Signal that an item was added (event for downstream use)
        events.emit('chat.cart.item_added', {
          sessionId,
          merchantId,
          conversationId,
          productId,
          productName: product.name,
          quantity,
          unitPrice: Number(product.price),
        });

        return `Added ${quantity}x ${product.name} to cart at ${product.price} ${product.currency} each.`;
      },
    });

    // 6. get_payment_link
    const getPaymentLink = new DynamicStructuredTool({
      name: 'get_payment_link',
      description:
        'Generate a payment link for the customer to complete their purchase. Use after collecting all cart items and customer info. Creates a pending order in the system.',
      schema: z.object({
        items: z
          .array(
            z.object({
              productId: z.string().describe('Product UUID'),
              quantity: z.number().min(1).describe('Quantity'),
              productName: z.string().optional().describe('Product name for reference'),
            }),
          )
          .describe('List of items to purchase'),
        customerName: z.string().describe('Customer full name'),
        customerPhone: z.string().describe('Customer phone number'),
        customerEmail: z.string().optional().describe('Customer email address'),
        shippingAddress: z.string().optional().describe('Shipping street address'),
        city: z.string().optional().describe('Shipping city'),
        country: z.string().optional().default('SA').describe('Shipping country code'),
      }),
      func: async ({
        items,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        city,
        country,
      }) => {
        // 1. Validate products and compute totals
        const orderItems: Array<{
          productId: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
          name: string;
        }> = [];

        for (const item of items) {
          const product = await prisma.product.findFirst({
            where: { id: item.productId, merchantId, isActive: true },
            select: { id: true, name: true, price: true, stockQuantity: true },
          });

          if (!product) {
            return `Product not found: ${item.productId}`;
          }
          if (product.stockQuantity < item.quantity) {
            return `Insufficient stock for ${product.name}: only ${product.stockQuantity} available`;
          }

          orderItems.push({
            productId: product.id,
            quantity: item.quantity,
            unitPrice: Number(product.price),
            totalPrice: Number(product.price) * item.quantity,
            name: product.name,
          });
        }

        const subtotal = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
        const total = subtotal;

        // 2. Upsert customer
        let customer = await prisma.customer.findFirst({
          where: { phone: customerPhone, merchantId },
        });

        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              merchantId,
              name: customerName,
              phone: customerPhone,
              email: customerEmail ?? undefined,
              city: city ?? undefined,
              country: country ?? undefined,
              sourceChannel: 'whatsapp',
            },
          });
        } else {
          await prisma.customer.update({
            where: { id: customer.id },
            data: {
              name: customerName,
              email: customerEmail ?? customer.email ?? undefined,
              city: city ?? customer.city ?? undefined,
              country: country ?? customer.country ?? undefined,
            },
          });
        }

        // 3. Create pending order
        const order = await prisma.order.create({
          data: {
            merchantId,
            customerId: customer.id,
            status: 'pending',
            paymentStatus: 'pending',
            subtotal,
            total,
            shippingAddress: {
              name: customerName,
              phone: customerPhone,
              address: shippingAddress,
              city,
              country: country ?? 'SA',
            },
            items: {
              create: orderItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                totalPrice: i.totalPrice,
              })),
            },
          },
          select: { id: true },
        });

        // 4. Link conversation to customer
        await prisma.conversation.update({
          where: { sessionId },
          data: { customerId: customer.id },
        });

        // 5. Construct payment URL
        // Build a redirect URL to merchant checkout with pre-filled cart
        // The orderId serves as the secure token for the pending order
        const paymentUrl = `${apiBase}/checkout/${order.id}`;

        logger.log(
          `Payment link created orderId=${order.id} merchantId=${merchantId} total=${total}`,
        );

        // 6. Emit event for downstream processing (e.g. order notifications)
        events.emit('chat.order.created', {
          orderId: order.id,
          merchantId,
          sessionId,
          conversationId,
          customerId: customer.id,
          customerPhone,
          total,
        });

        const itemLines = orderItems.map(
          (i) => `  - ${i.name} x${i.quantity} = ${i.totalPrice.toFixed(2)} SAR`,
        );

        return (
          `Order created successfully!\n\nOrder Summary:\n${itemLines.join('\n')}\nTotal: ${total.toFixed(2)} SAR\n\n` +
          `Complete your payment here: ${paymentUrl}\n\nOrder ID: ${order.id}`
        );
      },
    });

    return [
      searchProducts,
      getProductDetails,
      checkOrderStatus,
      collectCustomerInfo,
      addToCart,
      getPaymentLink,
    ];
  }

  // ─── Notification opt-in ───────────────────────────────────────────────────

  private async handleNotificationOptIn(
    conversationId: string,
    merchantId: string,
    message: string,
    sessionId: string,
  ): Promise<void> {
    const lower = message.toLowerCase();

    const wantsShipNotification =
      lower.includes('notify me when') &&
      (lower.includes('ship') || lower.includes('dispatch') || lower.includes('sent'));

    const wantsDeliverNotification =
      lower.includes('notify me when') &&
      (lower.includes('deliver') || lower.includes('arrive') || lower.includes('received'));

    const optingOut =
      lower.includes("don't notify") ||
      lower.includes('stop notif') ||
      lower.includes('unsubscribe');

    if (optingOut) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { notifyOnShip: false, notifyOnDeliver: false },
      });
      this.logger.log(
        `Notification opt-out: conversationId=${conversationId} merchantId=${merchantId}`,
      );
      return;
    }

    const updates: { notifyOnShip?: boolean; notifyOnDeliver?: boolean } = {};

    if (wantsShipNotification) {
      updates.notifyOnShip = true;
    }
    if (wantsDeliverNotification) {
      updates.notifyOnDeliver = true;
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: updates,
      });

      // Emit event so Agent 20 (WhatsApp notifications) can act on this preference
      this.events.emit('chat.notification.opted_in', {
        conversationId,
        sessionId,
        merchantId,
        notifyOnShip: updates.notifyOnShip ?? false,
        notifyOnDeliver: updates.notifyOnDeliver ?? false,
      });

      this.logger.log(
        `Notification opt-in saved: conversationId=${conversationId} ship=${updates.notifyOnShip} deliver=${updates.notifyOnDeliver}`,
      );
    }
  }

  // ─── Memory helpers ────────────────────────────────────────────────────────

  private async upsertConversation(
    merchantId: string,
    sessionId: string,
  ): Promise<{ id: string; totalMessages: number }> {
    let conversation = await this.prisma.conversation.findUnique({
      where: { sessionId },
      select: { id: true, merchantId: true, totalMessages: true },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          merchantId,
          channel: 'web',
          status: 'active',
          sessionId,
        },
        select: { id: true, merchantId: true, totalMessages: true },
      });
    }

    return { id: conversation.id, totalMessages: conversation.totalMessages };
  }

  private async getRedisHistory(sessionId: string): Promise<BaseMessage[]> {
    const key = `chat:history:${sessionId}`;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return [];

      const stored = JSON.parse(raw) as RedisChatMessage[];
      return stored.map((m) => {
        if (m.role === 'human') return new HumanMessage(m.content);
        if (m.role === 'assistant') return new AIMessage(m.content);
        return new SystemMessage(m.content);
      });
    } catch (err) {
      this.logger.warn(`Redis history read failed for session=${sessionId}: ${String(err)}`);
      return this.loadHistoryFromPostgres(sessionId);
    }
  }

  private async pushToRedis(
    sessionId: string,
    message: RedisChatMessage,
  ): Promise<void> {
    const key = `chat:history:${sessionId}`;
    try {
      const raw = await this.redis.get(key);
      const history: RedisChatMessage[] = raw
        ? (JSON.parse(raw) as RedisChatMessage[])
        : [];

      history.push(message);

      // Keep only the last MAX_REDIS_MESSAGES messages
      const trimmed = history.slice(-MAX_REDIS_MESSAGES);

      await this.redis.set(key, JSON.stringify(trimmed), 'EX', REDIS_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Redis history write failed for session=${sessionId}: ${String(err)}`,
      );
    }
  }

  private async loadHistoryFromPostgres(
    sessionId: string,
  ): Promise<BaseMessage[]> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!conversation) return [];

    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_REDIS_MESSAGES,
      select: { role: true, content: true },
    });

    return messages.reverse().map((m) => {
      if (m.role === 'user') return new HumanMessage(m.content);
      if (m.role === 'assistant') return new AIMessage(m.content);
      return new SystemMessage(m.content);
    });
  }

  private async persistMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    extra?: { toolCalls?: string },
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        toolCalls: extra?.toolCalls ? JSON.parse(extra.toolCalls) : undefined,
      },
    });
  }

  // ─── System prompt ─────────────────────────────────────────────────────────

  private buildSystemPrompt(merchantName: string): string {
    return `You are a helpful AI sales assistant for ${merchantName}.
Your role is to assist customers with:
- Finding products that match their needs
- Providing product details and pricing
- Checking order status and tracking
- Collecting customer information for orders
- Generating payment links to complete purchases

Guidelines:
- Be friendly, professional, and concise
- Use the available tools to look up real product and order information
- When a customer wants to buy something, use search_products first, then add_to_cart, then collect customer info, then generate a payment link
- Always confirm item details and totals before generating a payment link
- If a customer asks about shipping notifications, let them know you can notify them when their order ships
- Respond in the same language the customer uses
- Never make up product details or prices — always use the tools

Available tools: search_products, get_product_details, check_order_status, collect_customer_info, add_to_cart, get_payment_link`;
  }
}
