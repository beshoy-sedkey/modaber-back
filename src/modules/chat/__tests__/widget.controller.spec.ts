import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { WidgetController } from '../widget/widget.controller';
import { ChatService } from '../chat.service';

// ── Mock ChatService ──────────────────────────────────────────────────────────

const MERCHANT_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID   = 'sess-controller-001';
const MOCK_SCRIPT  = '(function(){/* widget */})();';

const mockChatService = {
  getWidgetScript: jest.fn(),
  handleMessage: jest.fn(),
};

// ── Test app setup ────────────────────────────────────────────────────────────

describe('WidgetController (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /widget/:apiKey/chat.js ───────────────────────────────────────────

  describe('GET /widget/:apiKey/chat.js', () => {
    it('should return 200 with application/javascript content-type for a valid apiKey', async () => {
      mockChatService.getWidgetScript.mockResolvedValue(MOCK_SCRIPT);

      const res = await request(app.getHttpServer())
        .get(`/widget/${MERCHANT_ID}/chat.js`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/javascript/);
      expect(res.text).toBe(MOCK_SCRIPT);
    });

    it('should return 404 when the apiKey does not exist', async () => {
      mockChatService.getWidgetScript.mockRejectedValue(
        new NotFoundException('Widget not found'),
      );

      await request(app.getHttpServer())
        .get('/widget/nonexistent-key/chat.js')
        .expect(404);
    });

    it('should pass the correct apiKey to ChatService', async () => {
      mockChatService.getWidgetScript.mockResolvedValue(MOCK_SCRIPT);

      await request(app.getHttpServer())
        .get(`/widget/${MERCHANT_ID}/chat.js`)
        .expect(200);

      expect(mockChatService.getWidgetScript).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('should set Cache-Control header', async () => {
      mockChatService.getWidgetScript.mockResolvedValue(MOCK_SCRIPT);

      const res = await request(app.getHttpServer())
        .get(`/widget/${MERCHANT_ID}/chat.js`)
        .expect(200);

      expect(res.headers['cache-control']).toMatch(/max-age/);
    });

    it('should set Access-Control-Allow-Origin header', async () => {
      mockChatService.getWidgetScript.mockResolvedValue(MOCK_SCRIPT);

      const res = await request(app.getHttpServer())
        .get(`/widget/${MERCHANT_ID}/chat.js`)
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  // ── POST /widget/:apiKey/message ──────────────────────────────────────────

  describe('POST /widget/:apiKey/message', () => {
    it('should return 200 with a reply when request is valid', async () => {
      mockChatService.handleMessage.mockResolvedValue({
        reply: 'Hello! How can I help you?',
        conversationId: 'conv-001',
        sessionId: SESSION_ID,
      });

      const res = await request(app.getHttpServer())
        .post(`/widget/${MERCHANT_ID}/message`)
        .send({ sessionId: SESSION_ID, message: 'Hello' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reply).toBe('Hello! How can I help you?');
      expect(res.body.data.conversationId).toBe('conv-001');
    });

    it('should return 400 when sessionId is missing', async () => {
      await request(app.getHttpServer())
        .post(`/widget/${MERCHANT_ID}/message`)
        .send({ message: 'Hello' })
        .expect(400);
    });

    it('should return 400 when message is missing', async () => {
      await request(app.getHttpServer())
        .post(`/widget/${MERCHANT_ID}/message`)
        .send({ sessionId: SESSION_ID })
        .expect(400);
    });

    it('should return 400 when body is empty', async () => {
      await request(app.getHttpServer())
        .post(`/widget/${MERCHANT_ID}/message`)
        .send({})
        .expect(400);
    });

    it('should return 404 when merchant apiKey is invalid', async () => {
      mockChatService.handleMessage.mockRejectedValue(
        new NotFoundException('Widget not found'),
      );

      await request(app.getHttpServer())
        .post('/widget/bad-key/message')
        .send({ sessionId: SESSION_ID, message: 'Hello' })
        .expect(404);
    });

    it('should pass apiKey, sessionId, and message to ChatService', async () => {
      mockChatService.handleMessage.mockResolvedValue({
        reply: 'Thanks!',
        conversationId: 'conv-001',
        sessionId: SESSION_ID,
      });

      await request(app.getHttpServer())
        .post(`/widget/${MERCHANT_ID}/message`)
        .send({ sessionId: SESSION_ID, message: 'What are your hours?' })
        .expect(200);

      expect(mockChatService.handleMessage).toHaveBeenCalledWith(
        MERCHANT_ID,
        SESSION_ID,
        'What are your hours?',
      );
    });
  });
});
