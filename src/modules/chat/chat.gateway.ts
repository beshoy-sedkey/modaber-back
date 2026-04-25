import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { ChatAgentService } from './services/chat-agent.service';
import { ChatService } from './chat.service';

// ── Payloads ───────────────────────────────────────────────────────────────────

interface ConnectHandshake {
  auth?: {
    apiKey?: string;
    sessionId?: string;
  };
  query?: {
    apiKey?: string;
    sessionId?: string;
  };
}

interface MessagePayload {
  message: string;
}

interface TypingPayload {
  isTyping: boolean;
}

// Extend Socket.data to hold per-connection state
interface SocketData {
  merchantId: string;
  sessionId: string;
}

type ChatSocket = Socket & { data: SocketData };

// ── Gateway ────────────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatAgent: ChatAgentService,
    private readonly chatService: ChatService,
  ) {}

  // ── Connection lifecycle ───────────────────────────────────────────────────

  async handleConnection(client: ChatSocket): Promise<void> {
    const handshake = client.handshake as ConnectHandshake;

    const apiKey =
      handshake.auth?.apiKey ?? handshake.query?.apiKey ?? '';
    const sessionId =
      handshake.auth?.sessionId ?? handshake.query?.sessionId ?? client.id;

    // Validate merchant (apiKey == merchant.id per existing widget design)
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: apiKey },
      select: { id: true, isActive: true },
    });

    if (!merchant || !merchant.isActive) {
      this.logger.warn(
        `Connection rejected — invalid apiKey=${apiKey} socketId=${client.id}`,
      );
      client.disconnect();
      return;
    }

    // Store tenant context on the socket so handlers never trust client-sent IDs
    client.data.merchantId = merchant.id;
    client.data.sessionId = sessionId;

    // Join a room scoped to this session so typing events stay isolated
    await client.join(`session:${sessionId}`);

    // Start / find conversation record
    await this.chatService.startConversation(merchant.id, sessionId);

    this.logger.log(
      `Client connected socketId=${client.id} merchantId=${merchant.id} session=${sessionId}`,
    );
  }

  handleDisconnect(client: ChatSocket): void {
    const { merchantId, sessionId } = client.data ?? {};
    this.logger.log(
      `Client disconnected socketId=${client.id} merchantId=${merchantId ?? 'unknown'} session=${sessionId ?? 'unknown'}`,
    );
  }

  // ── Message handler ────────────────────────────────────────────────────────

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: MessagePayload,
  ): Promise<void> {
    const { merchantId, sessionId } = client.data;
    const userMessage = (payload?.message ?? '').trim();

    if (!userMessage) {
      client.emit('error', { message: 'Message cannot be empty' });
      return;
    }

    this.logger.log(
      `message event merchantId=${merchantId} session=${sessionId} len=${userMessage.length}`,
    );

    try {
      // Stream tokens from the AI agent.
      // ChatAgentService.processMessage already persists the user message,
      // assistant reply, and increments totalMessages — do not double-write here.
      const tokenStream = this.chatAgent.processMessage(
        merchantId,
        sessionId,
        userMessage,
      );

      let fullResponse = '';

      for await (const token of tokenStream) {
        fullResponse += token;
        client.emit('response_token', { token });
      }

      client.emit('response_complete', {
        sessionId,
        message: fullResponse,
      });
    } catch (err) {
      this.logger.error(
        `Error processing message merchantId=${merchantId} session=${sessionId}: ${String(err)}`,
      );
      client.emit('error', { message: 'Failed to process your message. Please try again.' });
    }
  }

  // ── Typing indicator ───────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() payload: TypingPayload,
  ): void {
    const { sessionId } = client.data;
    const isTyping = payload?.isTyping ?? false;

    // Broadcast to all other sockets in this session room
    client.to(`session:${sessionId}`).emit('typing', { isTyping });
  }
}
