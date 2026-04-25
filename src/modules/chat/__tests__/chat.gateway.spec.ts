import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from '../chat.gateway';
import { ChatService } from '../chat.service';
import { ChatAgentService } from '../services/chat-agent.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { Socket } from 'socket.io';

// ── Helpers ────────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SESSION_ID = 'sess-gw-001';

// Use a loose record type so we don't have to satisfy the full Handshake shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockSocket = Record<string, any> & {
  id: string;
  data: Record<string, unknown>;
  emit: jest.Mock;
  disconnect: jest.Mock;
  join: jest.Mock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  to: jest.Mock<{ emit: jest.Mock }, [room: any]>;
};

function makeMockClient(overrides?: Partial<MockSocket>): MockSocket {
  const toEmit = jest.fn();
  return {
    id: 'socket-test-id',
    data: {},
    handshake: {
      auth: { apiKey: MERCHANT_ID, sessionId: SESSION_ID },
      query: {},
    } as unknown as Socket['handshake'],
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnValue({ emit: toEmit }),
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPrisma = {
  merchant: {
    findUnique: jest.fn(),
  },
};

const mockChatService = {
  startConversation: jest.fn(),
  saveMessage: jest.fn(),
  endConversation: jest.fn(),
};

async function* fakeTokenStream(tokens: string[]): AsyncGenerator<string> {
  for (const t of tokens) {
    yield t;
  }
}

const mockChatAgent = {
  processMessage: jest.fn(),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatService, useValue: mockChatService },
        { provide: ChatAgentService, useValue: mockChatAgent },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  // ── handleConnection ───────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('should accept valid connection and store merchantId/sessionId on client.data', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: true,
      });
      mockChatService.startConversation.mockResolvedValue({ id: 'conv-001' });

      const client = makeMockClient();
      await gateway.handleConnection(client as unknown as ReturnType<typeof makeMockClient> & Socket);

      expect(client.data['merchantId']).toBe(MERCHANT_ID);
      expect(client.data['sessionId']).toBe(SESSION_ID);
      expect(client.join).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(mockChatService.startConversation).toHaveBeenCalledWith(MERCHANT_ID, SESSION_ID);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when merchant is not found', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      const client = makeMockClient();
      await gateway.handleConnection(client as unknown as ReturnType<typeof makeMockClient> & Socket);

      expect(client.disconnect).toHaveBeenCalled();
      expect(mockChatService.startConversation).not.toHaveBeenCalled();
    });

    it('should disconnect when merchant is inactive', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({
        id: MERCHANT_ID,
        isActive: false,
      });

      const client = makeMockClient();
      await gateway.handleConnection(client as unknown as ReturnType<typeof makeMockClient> & Socket);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should fall back to socket.id as sessionId when none is provided', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID, isActive: true });
      mockChatService.startConversation.mockResolvedValue({ id: 'conv-002' });

      const client = makeMockClient({
        handshake: { auth: { apiKey: MERCHANT_ID }, query: {} } as unknown as Socket['handshake'],
      });
      await gateway.handleConnection(client as unknown as ReturnType<typeof makeMockClient> & Socket);

      expect(client.data['sessionId']).toBe(client.id);
    });

    it('should validate merchant using apiKey from query params when auth is empty', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID, isActive: true });
      mockChatService.startConversation.mockResolvedValue({ id: 'conv-003' });

      const client = makeMockClient({
        handshake: { auth: {}, query: { apiKey: MERCHANT_ID, sessionId: SESSION_ID } } as unknown as Socket['handshake'],
      });
      await gateway.handleConnection(client as unknown as ReturnType<typeof makeMockClient> & Socket);

      expect(client.data['merchantId']).toBe(MERCHANT_ID);
      expect(mockPrisma.merchant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MERCHANT_ID } }),
      );
    });
  });

  // ── handleMessage ──────────────────────────────────────────────────────────

  describe('handleMessage', () => {
    function connectedClient(): MockSocket {
      const client = makeMockClient();
      client.data = { merchantId: MERCHANT_ID, sessionId: SESSION_ID };
      return client;
    }

    it('should stream tokens and emit response_complete', async () => {
      const tokens = ['Hello', ' ', 'world', '!'];
      mockChatAgent.processMessage.mockReturnValue(fakeTokenStream(tokens));
      mockChatService.saveMessage.mockResolvedValue(undefined);

      const client = connectedClient();
      await gateway.handleMessage(
        client as unknown as Socket,
        { message: 'Hi there' },
      );

      // Each token should be emitted
      const tokenEmits = (client.emit as jest.Mock).mock.calls.filter(
        (call: unknown[]) => call[0] === 'response_token',
      );
      expect(tokenEmits).toHaveLength(tokens.length);
      expect(tokenEmits[0][1]).toEqual({ token: 'Hello' });

      // response_complete should be emitted once with the full response
      const completeCall = (client.emit as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'response_complete',
      );
      expect(completeCall).toBeDefined();
      expect((completeCall as unknown[])[1]).toMatchObject({
        sessionId: SESSION_ID,
        message: 'Hello world!',
      });
    });

    it('should save user and assistant messages', async () => {
      mockChatAgent.processMessage.mockReturnValue(fakeTokenStream(['reply']));
      mockChatService.saveMessage.mockResolvedValue(undefined);

      const client = connectedClient();
      await gateway.handleMessage(
        client as unknown as Socket,
        { message: 'Question?' },
      );

      expect(mockChatService.saveMessage).toHaveBeenCalledWith(SESSION_ID, 'user', 'Question?');
      expect(mockChatService.saveMessage).toHaveBeenCalledWith(SESSION_ID, 'assistant', 'reply');
    });

    it('should emit error when message is empty', async () => {
      const client = connectedClient();
      await gateway.handleMessage(
        client as unknown as Socket,
        { message: '   ' },
      );

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
      expect(mockChatAgent.processMessage).not.toHaveBeenCalled();
    });

    it('should emit error when agent throws', async () => {
      async function* failingStream(): AsyncGenerator<string> {
        throw new Error('AI failure');
        // eslint-disable-next-line no-unreachable
        yield '';
      }
      mockChatAgent.processMessage.mockReturnValue(failingStream());
      mockChatService.saveMessage.mockResolvedValue(undefined);

      const client = connectedClient();
      await gateway.handleMessage(
        client as unknown as Socket,
        { message: 'Hello' },
      );

      const errorCall = (client.emit as jest.Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'error',
      );
      expect(errorCall).toBeDefined();
    });

    it('should use merchantId from client.data (not from payload — tenant isolation)', async () => {
      mockChatAgent.processMessage.mockReturnValue(fakeTokenStream(['ok']));
      mockChatService.saveMessage.mockResolvedValue(undefined);

      const client = connectedClient();
      await gateway.handleMessage(
        client as unknown as Socket,
        { message: 'Hello' },
      );

      expect(mockChatAgent.processMessage).toHaveBeenCalledWith(
        MERCHANT_ID,
        SESSION_ID,
        'Hello',
      );
    });
  });

  // ── handleTyping ───────────────────────────────────────────────────────────

  describe('handleTyping', () => {
    it('should broadcast typing event to session room excluding sender', () => {
      const toEmit = jest.fn();
      const client = makeMockClient({
        to: jest.fn().mockReturnValue({ emit: toEmit }),
      });
      client.data = { merchantId: MERCHANT_ID, sessionId: SESSION_ID };

      gateway.handleTyping(client as unknown as Socket, { isTyping: true });

      expect(client.to).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(toEmit).toHaveBeenCalledWith('typing', { isTyping: true });
    });

    it('should broadcast isTyping=false when user stops typing', () => {
      const toEmit = jest.fn();
      const client = makeMockClient({
        to: jest.fn().mockReturnValue({ emit: toEmit }),
      });
      client.data = { merchantId: MERCHANT_ID, sessionId: SESSION_ID };

      gateway.handleTyping(client as unknown as Socket, { isTyping: false });

      expect(toEmit).toHaveBeenCalledWith('typing', { isTyping: false });
    });
  });

  // ── handleDisconnect ───────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('should log without throwing when client.data is populated', () => {
      const client = makeMockClient();
      client.data = { merchantId: MERCHANT_ID, sessionId: SESSION_ID };

      expect(() =>
        gateway.handleDisconnect(client as unknown as Socket),
      ).not.toThrow();
    });

    it('should handle disconnect gracefully when client.data is empty', () => {
      const client = makeMockClient();
      client.data = {};

      expect(() =>
        gateway.handleDisconnect(client as unknown as Socket),
      ).not.toThrow();
    });
  });
});
