import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { WidgetController } from './widget/widget.controller';
import { EmbeddingService } from './services/embedding.service';
import { ChatAgentService } from './services/chat-agent.service';

@Module({
  imports: [PrismaModule],
  controllers: [WidgetController],
  providers: [ChatService, ChatGateway, EmbeddingService, ChatAgentService],
  exports: [ChatService, EmbeddingService, ChatAgentService],
})
export class ChatModule {}
