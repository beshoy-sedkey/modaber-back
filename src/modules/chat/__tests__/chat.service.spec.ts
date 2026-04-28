import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from '../chat.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { buildWidgetScript } from '../widget/chat-widget';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID  = 'sess-001';

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
  },
};

const mockConfig = {
  get: jest.fn((key: string, def: string) => def ?? ''),
};

// ── buildWidgetScript unit tests ─────────────────────────────────────────────

describe('buildWidgetScript', () => {
  it('should return a non-empty string', () => {
    const script = buildWidgetScript({
      apiKey: 'test-key',
      apiBase: 'http://localhost:3000',
    });
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('should embed the apiKey into the script', () => {
    const script = buildWidgetScript({
      apiKey: 'my-api-key',
      apiBase: 'http://localhost:3000',
    });
    expect(script).toContain('my-api-key');
  });

  it('should embed the apiBase into the script', () => {
    const script = buildWidgetScript({
      apiKey: 'k',
      apiBase: 'https://api.example.com',
    });
    expect(script).toContain('https://api.example.com');
  });

  it('should use default primaryColor when not provided', () => {
    const script = buildWidgetScript({ apiKey: 'k', apiBase: 'http://x' });
    expect(script).toContain('#2563eb');
  });

  it('should use provided primaryColor', () => {
    const script = buildWidgetScript({
      apiKey: 'k',
      apiBase: 'http://x',
      primaryColor: '#ff0000',
    });
    expect(script).toContain('#ff0000');
  });

  it('should contain IIFE wrapper', () => {
    const script = buildWidgetScript({ apiKey: 'k', apiBase: 'http://x' });
    expect(script).toContain('(function()');
  });

  it('should embed widget/message API path', () => {
    const script = buildWidgetScript({
      apiKey: 'test-key-123',
      apiBase: 'https://api.example.com',
    });
    expect(script).toContain('/widget/');
    expect(script).toContain('/message');
  });
});

// ── ChatService unit tests ────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ── getWidgetScript ────────────────────────────────────────────────────────

  describe('getWidgetScript', () => {
    it('should return a JavaScript string for a valid active merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: true,
        settings: {},
      });

      const script = await service.getWidgetScript(MERCHANT_ID);

      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
      expect(script).toContain(MERCHANT_ID);
    });

    it('should throw NotFoundException when merchant does not exist', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getWidgetScript('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when merchant is inactive', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: false,
        settings: {},
      });

      await expect(service.getWidgetScript(MERCHANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should apply widgetColor from merchant settings', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: true,
        settings: { widgetColor: '#123456' },
      });

      const script = await service.getWidgetScript(MERCHANT_ID);
      expect(script).toContain('#123456');
    });

    it('should filter by merchantId (tenant isolation)', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(service.getWidgetScript('other-merchant')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.merchant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'other-merchant' } }),
      );
    });
  });

  // ── handleMessage ──────────────────────────────────────────────────────────

  describe('handleMessage', () => {
    beforeEach(() => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: true,
      });
    });

    it('should create conversation when one does not exist for the session', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-001',
        merchantId: MERCHANT_ID,
        totalMessages: 0,
      });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.handleMessage(MERCHANT_ID, SESSION_ID, 'Hello');

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            sessionId: SESSION_ID,
            channel: 'web',
          }),
        }),
      );
      expect(result.conversationId).toBe('conv-001');
      expect(result.sessionId).toBe(SESSION_ID);
      expect(typeof result.reply).toBe('string');
      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('should reuse existing conversation when sessionId matches', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-existing',
        merchantId: MERCHANT_ID,
        totalMessages: 3,
      });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.handleMessage(MERCHANT_ID, SESSION_ID, 'Hi again');

      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(result.conversationId).toBe('conv-existing');
    });

    it('should persist user and assistant messages', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-002',
        merchantId: MERCHANT_ID,
        totalMessages: 0,
      });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.handleMessage(MERCHANT_ID, SESSION_ID, 'What is the shipping cost?');

      // user message + assistant reply = 2 creates
      expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user', content: 'What is the shipping cost?' }),
        }),
      );
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'assistant' }),
        }),
      );
    });

    it('should throw NotFoundException when merchant is invalid', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.handleMessage('bad-key', SESSION_ID, 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation — reject session belonging to different merchant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-other',
        merchantId: 'different-merchant-id',
        totalMessages: 0,
      });

      await expect(
        service.handleMessage(MERCHANT_ID, SESSION_ID, 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return a shipping-related reply for shipping questions', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-003',
        merchantId: MERCHANT_ID,
        totalMessages: 0,
      });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.handleMessage(MERCHANT_ID, SESSION_ID, 'track my shipment');
      expect(result.reply.toLowerCase()).toContain('track');
    });
  });

  // ── startConversation ──────────────────────────────────────────────────────

  describe('startConversation', () => {
    it('should return existing conversation when sessionId already exists', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-existing',
      });

      const result = await service.startConversation(MERCHANT_ID, SESSION_ID);

      expect(result.id).toBe('conv-existing');
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create a new conversation when none exists for the session', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-new' });

      const result = await service.startConversation(MERCHANT_ID, SESSION_ID);

      expect(result.id).toBe('conv-new');
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

    it('should scope conversation to correct merchantId (tenant isolation)', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-tenant' });

      await service.startConversation('merchant-a', SESSION_ID);

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ merchantId: 'merchant-a' }),
        }),
      );
    });
  });

  // ── saveMessage ────────────────────────────────────────────────────────────

  describe('saveMessage', () => {
    it('should create a message and increment totalMessages', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'conv-001' });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.saveMessage(SESSION_ID, 'user', 'Hello');

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-001',
            role: 'user',
            content: 'Hello',
          }),
        }),
      );
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalMessages: { increment: 1 } }),
        }),
      );
    });

    it('should save assistant messages', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'conv-001' });
      mockPrisma.message.create.mockResolvedValue({});
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.saveMessage(SESSION_ID, 'assistant', 'AI reply');

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'assistant', content: 'AI reply' }),
        }),
      );
    });

    it('should skip persist gracefully when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.saveMessage(SESSION_ID, 'user', 'Hello')).resolves.not.toThrow();
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });
  });

  // ── endConversation ────────────────────────────────────────────────────────

  describe('endConversation', () => {
    it('should update conversation status to closed with endedAt timestamp', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({ id: 'conv-001' });
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.endConversation(SESSION_ID);

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-001' },
          data: expect.objectContaining({
            status: 'closed',
            endedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should do nothing when no conversation exists for the session', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.endConversation(SESSION_ID)).resolves.not.toThrow();
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });
});
