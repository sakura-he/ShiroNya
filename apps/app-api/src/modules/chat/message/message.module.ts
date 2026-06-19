/**
 * ChatMessage Module
 * 聊天消息管理模块
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatMessage, ChatMessageSchema } from '@app/mongodb/schemas/chat-message.schema';
import { ChatSession, ChatSessionSchema } from '@app/mongodb/schemas/chat-session.schema';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ChatMessage.name, schema: ChatMessageSchema },
            { name: ChatSession.name, schema: ChatSessionSchema }
        ])
    ],
    controllers: [MessageController],
    providers: [MessageService],
    exports: [MessageService]
})
export class MessageModule {}
