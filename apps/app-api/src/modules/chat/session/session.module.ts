/**
 * ChatSession Module
 * 聊天会话管理模块
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatSession, ChatSessionSchema } from '@app/mongodb/schemas/chat-session.schema';
import { Character, CharacterSchema } from '@app/mongodb/schemas/character.schema';
import { ChatMessage, ChatMessageSchema } from '@app/mongodb/schemas/chat-message.schema';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: ChatSession.name, schema: ChatSessionSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: ChatMessage.name, schema: ChatMessageSchema }
        ])
    ],
    controllers: [SessionController],
    providers: [SessionService],
    exports: [SessionService]
})
export class SessionModule {}
