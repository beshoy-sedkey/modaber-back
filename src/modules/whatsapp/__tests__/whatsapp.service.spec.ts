import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WhatsAppService, WHATSAPP_QUEUE, JOB_SEND_TEXT } from '../whatsapp.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { EncryptionService } from 'src/shared/encryption/encryption.service';
import { SendMessageType } from '../dto/send-message.dto';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  whatsAppConfig: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  whatsAppMessage: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockEncryption = {
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
};

const mockQueue = {
  add: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, def: string) => def ?? ''),
};

describe('WhatsAppService', () => {
  let service: WhatsAppService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(WHATSAPP_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  // ── saveConfig ─────────────────────────────────────────────────────────────

  describe('saveConfig', () => {
    it('should encrypt accessToken before persisting', async () => {
      mockPrisma.whatsAppConfig.upsert.mockResolvedValue({});

      await service.saveConfig('merchant-1', {
        phoneNumberId: 'pid-1',
        accessToken: 'my-token',
        webhookVerifyToken: 'verify-me',
        businessAccountId: 'waba-1',
        isActive: true,
      });

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('my-token');
      expect(mockPrisma.whatsAppConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: 'merchant-1' },
          create: expect.objectContaining({ accessToken: 'enc:my-token' }),
        }),
      );
    });

    it('should encrypt appSecret when provided', async () => {
      mockPrisma.whatsAppConfig.upsert.mockResolvedValue({});

      await service.saveConfig('merchant-1', {
        phoneNumberId: 'pid-1',
        accessToken: 'token',
        webhookVerifyToken: 'verify',
        businessAccountId: 'waba-1',
        appSecret: 'my-secret',
      });

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('my-secret');
    });
  });

  // ── getConfig ──────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('should return masked access token', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        merchantId: 'merchant-1',
        phoneNumberId: 'pid-1',
        accessToken: 'enc:my-long-token-abcd',
        webhookVerifyToken: 'verify',
        businessAccountId: 'waba-1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getConfig('merchant-1');
      expect(result.accessTokenMasked).toMatch(/^\*{4}/);
      expect(result.accessTokenMasked).not.toContain('my-long-token');
    });

    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue(null);

      await expect(service.getConfig('merchant-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should filter by merchantId (tenant isolation)', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue(null);

      await expect(service.getConfig('other-merchant')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.whatsAppConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'other-merchant' } }),
      );
    });
  });

  // ── verifyWebhookToken ────────────────────────────────────────────────────

  describe('verifyWebhookToken', () => {
    it('should return challenge when mode and token match', () => {
      const result = service.verifyWebhookToken('my-token', 'subscribe', 'abc123', 'my-token');
      expect(result).toBe('abc123');
    });

    it('should throw BadRequestException when token does not match', () => {
      expect(() =>
        service.verifyWebhookToken('wrong', 'subscribe', 'abc123', 'correct'),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when mode is not subscribe', () => {
      expect(() =>
        service.verifyWebhookToken('token', 'unsubscribe', 'abc', 'token'),
      ).toThrow(BadRequestException);
    });
  });

  // ── sendTextMessage ────────────────────────────────────────────────────────

  describe('sendTextMessage', () => {
    beforeEach(() => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue({
        phoneNumberId: 'pid-1',
        accessToken: 'enc:decrypted-token',
        isActive: true,
      });
    });

    it('should throw BadRequestException when outside 24h window', async () => {
      mockPrisma.whatsAppMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.sendTextMessage('merchant-1', '966501234567', 'Hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call Meta API when within 24h window', async () => {
      mockPrisma.whatsAppMessage.findFirst.mockResolvedValue({
        timestamp: new Date(),
      });

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          messaging_product: 'whatsapp',
          contacts: [{ input: '966501234567', wa_id: '966501234567' }],
          messages: [{ id: 'wamid.xxx' }],
        },
      });

      const result = await service.sendTextMessage(
        'merchant-1',
        '966501234567',
        'Hello',
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/pid-1/messages'),
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }),
        }),
      );
      expect(result.messages[0].id).toBe('wamid.xxx');
    });
  });

  // ── sendTemplateMessage ───────────────────────────────────────────────────

  describe('sendTemplateMessage', () => {
    it('should NOT check 24h window for template messages', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue({
        phoneNumberId: 'pid-1',
        accessToken: 'enc:token',
        isActive: true,
      });

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.template' }],
        },
      });

      const result = await service.sendTemplateMessage(
        'merchant-1',
        '966501234567',
        'order_confirmation',
        'ar',
      );

      // Should NOT have called findFirst for 24h window check
      expect(mockPrisma.whatsAppMessage.findFirst).not.toHaveBeenCalled();
      expect(result.messages[0].id).toBe('wamid.template');
    });

    it('should throw NotFoundException when config is inactive', async () => {
      mockPrisma.whatsAppConfig.findUnique.mockResolvedValue({
        phoneNumberId: 'pid-1',
        accessToken: 'enc:token',
        isActive: false,
      });

      await expect(
        service.sendTemplateMessage('merchant-1', '966501234567', 'tmpl', 'en'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── enqueueSendText ────────────────────────────────────────────────────────

  describe('enqueueSendText', () => {
    it('should add job to queue with correct data', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.enqueueSendText('merchant-1', '966501234567', 'Test message');

      expect(mockQueue.add).toHaveBeenCalledWith(
        JOB_SEND_TEXT,
        expect.objectContaining({
          merchantId: 'merchant-1',
          to: '966501234567',
          message: 'Test message',
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  // ── enqueueSendMessage ────────────────────────────────────────────────────

  describe('enqueueSendMessage', () => {
    it('should throw BadRequestException for text type without message', async () => {
      await expect(
        service.enqueueSendMessage('merchant-1', SendMessageType.text, '966501234567', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for template type without templateName', async () => {
      await expect(
        service.enqueueSendMessage('merchant-1', SendMessageType.template, '966501234567', {
          languageCode: 'ar',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for interactive type without payload', async () => {
      await expect(
        service.enqueueSendMessage('merchant-1', SendMessageType.interactive, '966501234567', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── processIncomingWebhook ────────────────────────────────────────────────

  describe('processIncomingWebhook', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550000001',
                  phone_number_id: 'pid-1',
                },
                contacts: [{ profile: { name: 'Test User' }, wa_id: '966501234567' }],
                messages: [
                  {
                    from: '966501234567',
                    id: 'wamid.incoming-1',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'Hello store!' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    it('should persist incoming message and emit event', async () => {
      mockPrisma.whatsAppConfig.findFirst.mockResolvedValue({
        id: 'cfg-1',
        merchantId: 'merchant-1',
        phoneNumberId: 'pid-1',
      });
      mockPrisma.whatsAppMessage.create.mockResolvedValue({});

      await service.processIncomingWebhook('pid-1', payload as never);

      expect(mockPrisma.whatsAppMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: 'merchant-1',
            from: '966501234567',
            content: 'Hello store!',
            direction: 'inbound',
          }),
        }),
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'whatsapp.message.received',
        expect.objectContaining({
          merchantId: 'merchant-1',
          from: '966501234567',
          content: 'Hello store!',
        }),
      );
    });

    it('should do nothing when no config found for phoneNumberId', async () => {
      mockPrisma.whatsAppConfig.findFirst.mockResolvedValue(null);

      await service.processIncomingWebhook('unknown-pid', payload as never);

      expect(mockPrisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
