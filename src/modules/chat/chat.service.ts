import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { buildWidgetScript, WidgetConfig } from './widget/chat-widget';

export interface SendMessageResult {
  readonly reply: string;
  readonly conversationId: string;
  readonly sessionId: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly apiBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // e.g. https://api.myapp.com  — no trailing slash
    this.apiBase = this.config.get<string>('API_BASE_URL', 'http://localhost:3000');
  }

  // ── Widget script generation ───────────────────────────────────────────────

  /**
   * Resolves the merchant by its UUID (used as the public apiKey).
   * Throws NotFoundException when the merchant does not exist or is inactive.
   */
  async getWidgetScript(apiKey: string): Promise<string> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: apiKey },
      select: { id: true, isActive: true, settings: true },
    });

    if (!merchant || !merchant.isActive) {
      throw new NotFoundException('Widget not found');
    }

    // Merchant settings can optionally override widget config
    const settings = (merchant.settings ?? {}) as Record<string, unknown>;

    // Note: widgetColor is controlled by the merchant (their own settings) and is
    // embedded into a CSS string inside the generated script. This is a self-XSS
    // risk only on the merchant's own storefront — no cross-merchant exposure.
    const widgetConfig: WidgetConfig = {
      apiKey,
      apiBase: this.apiBase,
      primaryColor: typeof settings['widgetColor'] === 'string' ? settings['widgetColor'] : '#2563eb',
      greeting: typeof settings['widgetGreeting'] === 'string' ? settings['widgetGreeting'] : 'Hello! How can I help you today?',
      position:
        settings['widgetPosition'] === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    };

    return buildWidgetScript(widgetConfig);
  }

  // ── Incoming message handling ─────────────────────────────────────────────

  /**
   * Processes a visitor message posted from the widget.
   * Finds or creates a Conversation keyed by sessionId, persists the user
   * Message, and returns a canned/AI reply.
   *
   * The merchantId is validated by resolving the apiKey (merchant.id) so
   * that the conversation is always scoped to the correct merchant.
   */
  async handleMessage(
    apiKey: string,
    sessionId: string,
    message: string,
  ): Promise<SendMessageResult> {
    // Resolve merchant — validates apiKey and ensures tenant isolation
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: apiKey },
      select: { id: true, isActive: true },
    });

    if (!merchant || !merchant.isActive) {
      throw new NotFoundException('Widget not found');
    }

    const merchantId = merchant.id;

    // Find or create conversation
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
    } else if (conversation.merchantId !== merchantId) {
      // Tenant isolation guard: session belongs to a different merchant
      throw new NotFoundException('Widget not found');
    }

    const conversationId = conversation.id;

    // Persist user message
    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: message,
      },
    });

    // Increment message counter
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { totalMessages: { increment: 1 } },
    });

    // Generate reply (stub — Agent 14's AI service integrates here via events)
    const reply = this.generateReply(message);

    // Persist assistant reply
    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: reply,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { totalMessages: { increment: 1 } },
    });

    this.logger.log(
      `Widget message handled: merchantId=${merchantId} session=${sessionId} conversationId=${conversationId}`,
    );

    return { reply, conversationId, sessionId };
  }

  // ── Socket.IO / Gateway helpers ───────────────────────────────────────────

  /**
   * Finds an existing conversation by sessionId or creates a new one.
   * Used by the WebSocket gateway on client connect.
   */
  async startConversation(
    merchantId: string,
    sessionId: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.conversation.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    const created = await this.prisma.conversation.create({
      data: {
        merchantId,
        channel: 'web',
        status: 'active',
        sessionId,
      },
      select: { id: true },
    });

    this.logger.log(
      `Conversation started: merchantId=${merchantId} session=${sessionId} id=${created.id}`,
    );

    return created;
  }

  /**
   * Persists a single message under the conversation identified by sessionId.
   * Used by the WebSocket gateway to record user and assistant messages.
   */
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!conversation) {
      this.logger.warn(
        `saveMessage: no conversation for session=${sessionId}, skipping persist`,
      );
      return;
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role,
        content,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { totalMessages: { increment: 1 } },
    });
  }

  /**
   * Marks a conversation as closed and records the end time.
   * Called when the WebSocket client disconnects (optional cleanup).
   */
  async endConversation(sessionId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!conversation) {
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'closed',
        endedAt: new Date(),
      },
    });

    this.logger.log(`Conversation ended: session=${sessionId} id=${conversation.id}`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Stub reply generator.
   * Replace with AI service call (via EventEmitter) once Agent 14 is integrated.
   */
  private generateReply(userMessage: string): string {
    const lower = userMessage.toLowerCase();

    if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
      return 'I can help you find the best price! Please browse our product catalog or let me know the specific item you are interested in.';
    }
    if (lower.includes('shipping') || lower.includes('delivery') || lower.includes('track')) {
      return 'We offer fast shipping to your location. You can track your order using the tracking number sent to your email after dispatch.';
    }
    if (lower.includes('return') || lower.includes('refund') || lower.includes('exchange')) {
      return 'We have a hassle-free returns policy. Please contact us within 14 days of receiving your order and we will arrange a return or exchange.';
    }
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return 'Hello! Welcome to our store. How can I assist you today?';
    }

    return 'Thank you for your message! Our team will get back to you shortly. Is there anything else I can help you with?';
  }
}
