import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { WhatsAppService } from 'src/modules/whatsapp/whatsapp.service';
import { WhatsAppMessageReceivedEvent } from 'src/modules/whatsapp/interfaces/whatsapp-message.interface';
import { OrderReceivedEvent } from 'src/modules/platform/events/order-received.event';
import { ORDER_CONFIRMATION_QUEUE } from './order-confirmation.service';

export const JOB_START_CONVERSATION = 'start-conversation';
export const JOB_EXPIRE_CONVERSATION = 'expire-conversation';

const SESSION_PREFIX = 'order-confirm';
const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const REDIS_TTL_SECONDS = 3 * 60 * 60;
const MAX_HISTORY = 20;

interface RedisChatMessage {
  readonly role: 'human' | 'assistant';
  readonly content: string;
}

type OrderWithDetails = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    items: { include: { product: true } };
  };
}>;

@Injectable()
export class OrderConfirmationAgentService {
  private readonly logger = new Logger(OrderConfirmationAgentService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
    @InjectQueue(ORDER_CONFIRMATION_QUEUE) private readonly queue: Queue,
  ) {
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
  }

  // ─── Trigger: order arrived ────────────────────────────────────────────────

  @OnEvent('order.received')
  async onOrderReceived(event: OrderReceivedEvent): Promise<void> {
    await this.queue.add(
      JOB_START_CONVERSATION,
      { merchantId: event.merchantId, orderId: event.orderId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  // ─── Called by processor: start conversation ───────────────────────────────

  async startConversation(merchantId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
      include: { customer: true, items: { include: { product: true } } },
    });

    if (!order) {
      this.logger.warn(`Order not found: orderId=${orderId}`);
      return;
    }

    if (!order.customer.phone) {
      this.logger.warn(`No phone for orderId=${orderId} — flagging for manual review`);
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.confirming },
      });
      return;
    }

    const sessionId = `${SESSION_PREFIX}:${orderId}`;

    // Idempotent: skip if already started
    const existing = await this.prisma.conversation.findUnique({ where: { sessionId } });
    if (existing) return;

    await this.prisma.conversation.create({
      data: {
        merchantId,
        channel: 'whatsapp',
        status: 'active',
        sessionId,
        customerPhone: order.customer.phone,
        customerId: order.customer.id,
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.confirming },
    });

    const summary = this.buildOrderSummary(order);
    const greeting =
      `مرحباً ${order.customer.name}! 👋\n\n` +
      `وصلنا طلبك، وهذه تفاصيله:\n\n${summary}\n\n` +
      `هل تريد تأكيد الطلب كما هو؟ أم تريد تعديل العنوان أو الكميات؟`;

    await this.whatsapp.enqueueSendText(merchantId, order.customer.phone, greeting);
    await this.pushToRedis(sessionId, { role: 'assistant', content: greeting });

    // Schedule expiry after 2h
    await this.queue.add(
      JOB_EXPIRE_CONVERSATION,
      { merchantId, orderId },
      { delay: CONVERSATION_TTL_MS, attempts: 2, backoff: { type: 'fixed', delay: 5000 } },
    );

    this.logger.log(`Conversation started: orderId=${orderId} phone=${order.customer.phone}`);
  }

  // ─── Called by processor: expire conversation ──────────────────────────────

  async expireConversation(merchantId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
      select: { id: true, status: true, customer: { select: { phone: true } } },
    });

    if (!order || order.status === OrderStatus.confirmed || order.status === OrderStatus.cancelled) {
      return;
    }

    const sessionId = `${SESSION_PREFIX}:${orderId}`;
    await this.prisma.conversation.updateMany({
      where: { sessionId, merchantId },
      data: { status: 'closed', endedAt: new Date() },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.confirming },
    });

    if (order.customer.phone) {
      await this.whatsapp.enqueueSendText(
        merchantId,
        order.customer.phone,
        'انتهت مهلة تأكيد طلبك. سيتواصل معك فريقنا قريباً. 🙏',
      );
    }

    this.logger.log(`Conversation expired: orderId=${orderId}`);
  }

  // ─── Trigger: customer replies via WhatsApp ────────────────────────────────

  @OnEvent('whatsapp.message.received')
  async onWhatsAppMessage(event: WhatsAppMessageReceivedEvent): Promise<void> {
    // Only handle text/interactive — ignore status updates
    if (!event.content) return;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        merchantId: event.merchantId,
        channel: 'whatsapp',
        status: 'active',
        customerPhone: event.from,
        sessionId: { startsWith: `${SESSION_PREFIX}:` },
      },
      select: { id: true, sessionId: true, merchantId: true },
    });

    if (!conversation) return;

    const orderId = conversation.sessionId.replace(`${SESSION_PREFIX}:`, '');

    await this.processReply(
      conversation.merchantId,
      conversation.id,
      conversation.sessionId,
      orderId,
      event.from,
      event.content,
    );
  }

  // ─── Core: run one agent turn ──────────────────────────────────────────────

  private async processReply(
    merchantId: string,
    conversationId: string,
    sessionId: string,
    orderId: string,
    phone: string,
    userMessage: string,
  ): Promise<void> {
    await this.prisma.message.create({
      data: { conversationId, role: 'user', content: userMessage },
    });
    await this.pushToRedis(sessionId, { role: 'human', content: userMessage });

    const history = await this.getRedisHistory(sessionId);

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
      include: { customer: true, items: { include: { product: true } } },
    });

    if (!order) return;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true },
    });

    const tools = this.buildTools(merchantId, orderId, conversationId);
    const model = new ChatOpenAI({
      openAIApiKey: this.config.get<string>('OPENAI_API_KEY'),
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
    }).bindTools(tools);

    const messages: BaseMessage[] = [
      new SystemMessage(this.buildSystemPrompt(merchant?.name ?? 'المتجر', order)),
      ...history,
    ];

    let reply: string;
    try {
      reply = await this.agentLoop(model, messages, tools);
    } catch (err) {
      this.logger.error(`Agent loop failed for orderId=${orderId}: ${String(err)}`);
      reply = 'عذراً، حدث خطأ مؤقت. سيتواصل معك فريقنا قريباً.';
    }

    await this.whatsapp.enqueueSendText(merchantId, phone, reply);

    await this.prisma.message.create({
      data: { conversationId, role: 'assistant', content: reply },
    });
    await this.pushToRedis(sessionId, { role: 'assistant', content: reply });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { totalMessages: { increment: 2 } },
    });
  }

  // ─── Agentic loop ──────────────────────────────────────────────────────────

  private async agentLoop(
    model: ReturnType<ChatOpenAI['bindTools']>,
    messages: BaseMessage[],
    tools: DynamicStructuredTool[],
  ): Promise<string> {
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    let currentMessages = [...messages];
    let finalText = '';

    for (let i = 0; i < 5; i++) {
      const response = await model.invoke(currentMessages);
      const content = typeof response.content === 'string' ? response.content : '';
      const toolCalls = response.tool_calls ?? [];

      if (toolCalls.length === 0) {
        finalText = content;
        break;
      }

      currentMessages.push(
        new AIMessage({
          content,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id ?? '',
            name: tc.name,
            args: tc.args as Record<string, unknown>,
            type: 'tool_call' as const,
          })),
        }),
      );

      const toolMessages: ToolMessage[] = [];
      for (const tc of toolCalls) {
        const tool = toolMap.get(tc.name);
        let result: string;
        try {
          result = tool ? String(await tool.invoke(tc.args)) : `Tool ${tc.name} not found`;
        } catch (err) {
          result = `Error: ${String(err)}`;
        }
        toolMessages.push(new ToolMessage({ content: result, tool_call_id: tc.id ?? '' }));
      }

      currentMessages.push(...toolMessages);
    }

    return finalText;
  }

  // ─── Tool definitions ──────────────────────────────────────────────────────

  private buildTools(
    merchantId: string,
    orderId: string,
    conversationId: string,
  ): DynamicStructuredTool[] {
    const prisma = this.prisma;
    const logger = this.logger;

    const getOrderDetails = new DynamicStructuredTool({
      name: 'get_order_details',
      description: 'Get the current order items, quantities, prices, and delivery address.',
      schema: z.object({}),
      func: async () => {
        const order = await prisma.order.findFirst({
          where: { id: orderId, merchantId },
          include: { items: { include: { product: true } } },
        });
        if (!order) return 'Order not found.';
        return JSON.stringify({
          status: order.status,
          total: order.total,
          currency: order.currency,
          shippingAddress: order.shippingAddress,
          items: order.items.map((i) => ({
            itemId: i.id,
            productName: i.product.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        });
      },
    });

    const updateDeliveryAddress = new DynamicStructuredTool({
      name: 'update_delivery_address',
      description: 'Update the delivery address when the customer wants to change where the order is delivered.',
      schema: z.object({
        address: z.string().describe('Full street address'),
        city: z.string().optional().describe('City name'),
        country: z.string().optional().describe('Country code, e.g. SA'),
      }),
      func: async ({ address, city, country }) => {
        const order = await prisma.order.findFirst({
          where: { id: orderId, merchantId },
          select: { shippingAddress: true },
        });
        if (!order) return 'Order not found.';

        const current = (order.shippingAddress as Record<string, string>) ?? {};
        await prisma.order.update({
          where: { id: orderId },
          data: {
            shippingAddress: {
              ...current,
              address,
              ...(city ? { city } : {}),
              ...(country ? { country } : {}),
            },
          },
        });

        logger.log(`Address updated: orderId=${orderId} address=${address}`);
        return `تم تحديث عنوان التوصيل إلى: ${address}${city ? `, ${city}` : ''}`;
      },
    });

    const updateItemQuantity = new DynamicStructuredTool({
      name: 'update_item_quantity',
      description: 'Change the quantity of a specific item in the order.',
      schema: z.object({
        itemId: z.string().describe('The order item UUID from get_order_details'),
        quantity: z.number().int().min(1).describe('New quantity (minimum 1)'),
      }),
      func: async ({ itemId, quantity }) => {
        const item = await prisma.orderItem.findFirst({
          where: { id: itemId, orderId },
          include: { product: true },
        });
        if (!item) return 'Item not found in this order.';

        const newItemTotal = Number(item.unitPrice) * quantity;
        await prisma.orderItem.update({
          where: { id: itemId },
          data: { quantity, totalPrice: newItemTotal },
        });

        await this.recalculateOrderTotal(orderId);

        logger.log(`Quantity updated: itemId=${itemId} qty=${quantity}`);
        return `تم تحديث كمية "${item.product.name}" إلى ${quantity} قطع.`;
      },
    });

    const removeItem = new DynamicStructuredTool({
      name: 'remove_item',
      description: 'Remove a specific item from the order when the customer wants to cancel a product.',
      schema: z.object({
        itemId: z.string().describe('The order item UUID from get_order_details'),
      }),
      func: async ({ itemId }) => {
        const item = await prisma.orderItem.findFirst({
          where: { id: itemId, orderId },
          include: { product: true },
        });
        if (!item) return 'Item not found.';

        const count = await prisma.orderItem.count({ where: { orderId } });
        if (count <= 1) {
          return 'لا يمكن حذف جميع المنتجات. الطلب يجب أن يحتوي على منتج واحد على الأقل.';
        }

        await prisma.orderItem.delete({ where: { id: itemId } });
        await this.recalculateOrderTotal(orderId);

        logger.log(`Item removed: itemId=${itemId} orderId=${orderId}`);
        return `تم حذف "${item.product.name}" من الطلب.`;
      },
    });

    const confirmOrder = new DynamicStructuredTool({
      name: 'confirm_order',
      description: 'Confirm the order. Call this ONLY when the customer explicitly says they confirm or agree.',
      schema: z.object({}),
      func: async () => {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.confirmed, confirmedAt: new Date() },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: 'closed', endedAt: new Date() },
        });

        logger.log(`Order confirmed by customer: orderId=${orderId}`);
        return 'ORDER_CONFIRMED';
      },
    });

    const cancelOrder = new DynamicStructuredTool({
      name: 'cancel_order',
      description: 'Cancel the order. Call this ONLY when the customer explicitly says they want to cancel.',
      schema: z.object({
        reason: z.string().optional().describe('Reason for cancellation if provided'),
      }),
      func: async ({ reason }) => {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.cancelled,
            ...(reason ? { notes: reason } : {}),
          },
        });

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: 'closed', endedAt: new Date() },
        });

        logger.log(`Order cancelled by customer: orderId=${orderId}`);
        return 'ORDER_CANCELLED';
      },
    });

    return [
      getOrderDetails,
      updateDeliveryAddress,
      updateItemQuantity,
      removeItem,
      confirmOrder,
      cancelOrder,
    ];
  }

  // ─── System prompt ─────────────────────────────────────────────────────────

  private buildSystemPrompt(merchantName: string, order: OrderWithDetails): string {
    const itemsContext = order.items
      .map(
        (i) =>
          `  - itemId: ${i.id} | ${i.product.name} × ${i.quantity} @ ${Number(i.unitPrice).toFixed(2)} ${order.currency}`,
      )
      .join('\n');

    const addr = order.shippingAddress as Record<string, string> | null;
    const addressLine = addr?.address
      ? `${addr.address}${addr.city ? `, ${addr.city}` : ''}`
      : 'غير محدد';

    return `أنت مساعد تأكيد الطلبات لمتجر "${merchantName}".

معلومات الطلب الحالي (رقم: ${order.id}):
المنتجات:
${itemsContext}
عنوان التوصيل: ${addressLine}
الإجمالي: ${Number(order.total).toFixed(2)} ${order.currency}

مهمتك:
1. ساعد العميل على مراجعة تفاصيل طلبه
2. نفّذ أي تعديلات يطلبها باستخدام الأدوات (تغيير العنوان، تعديل الكمية، حذف منتج)
3. أكّد الطلب عند موافقة العميل الصريحة فقط
4. ألغِ الطلب إذا طلب العميل ذلك صراحةً

قواعد:
- استخدم الأدوات دائماً لتنفيذ التعديلات — لا تَعِد بشيء دون تنفيذه
- بعد كل تعديل، أخبر العميل بالتغيير واذكر الإجمالي الجديد
- لا تؤكد الطلب إلا عند قول العميل "تأكيد" أو "موافق" أو ما يعادلها بوضوح
- إذا قال العميل "ORDER_CONFIRMED" أو "ORDER_CANCELLED" فقط كرر الرسالة المناسبة
- تحدث بنفس لغة العميل (عربي أو إنجليزي)
- كن مختصراً وودوداً`;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildOrderSummary(order: OrderWithDetails): string {
    const lines = order.items.map(
      (i) =>
        `📦 ${i.product.name} × ${i.quantity} = ${Number(i.totalPrice).toFixed(2)} ${order.currency}`,
    );
    const addr = order.shippingAddress as Record<string, string> | null;
    const addressLine = addr?.address
      ? `📍 العنوان: ${addr.address}${addr.city ? `, ${addr.city}` : ''}`
      : '📍 العنوان: غير محدد';

    return `${lines.join('\n')}\n${addressLine}\n💰 الإجمالي: ${Number(order.total).toFixed(2)} ${order.currency}`;
  }

  private async recalculateOrderTotal(orderId: string): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { totalPrice: true },
    });
    const subtotal = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { subtotal, total: subtotal },
    });
  }

  private async getRedisHistory(sessionId: string): Promise<BaseMessage[]> {
    const key = `order-confirm:history:${sessionId}`;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return [];
      const stored = JSON.parse(raw) as RedisChatMessage[];
      return stored.map((m) =>
        m.role === 'human' ? new HumanMessage(m.content) : new AIMessage(m.content),
      );
    } catch {
      return [];
    }
  }

  private async pushToRedis(sessionId: string, message: RedisChatMessage): Promise<void> {
    const key = `order-confirm:history:${sessionId}`;
    try {
      const raw = await this.redis.get(key);
      const history: RedisChatMessage[] = raw ? (JSON.parse(raw) as RedisChatMessage[]) : [];
      history.push(message);
      await this.redis.set(
        key,
        JSON.stringify(history.slice(-MAX_HISTORY)),
        'EX',
        REDIS_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Redis write failed for session=${sessionId}: ${String(err)}`);
    }
  }
}
