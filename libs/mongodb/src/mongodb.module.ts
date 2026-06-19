import { createRuntimeLogger } from '@app/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Character, CharacterSchema } from './schemas/character.schema';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';

const mongoLogger = createRuntimeLogger('mongodb_module');

@Module({
    imports: [
        MongooseModule.forRootAsync({
            useFactory: async (configService: ConfigService) => {
                const uri = configService.get<string>('MONGODB_URI');
                mongoLogger.info('MongoDB connecting', { uri });
                return {
                    uri,
                    connectionFactory: (connection) => {
                        connection.on('connected', () => {
                            mongoLogger.info.title('MongoDB connected successfully');
                        });
                        connection.on('error', (err: Error) => {
                            mongoLogger.error('MongoDB connection error', { error: err });
                        });
                        return connection;
                    }
                };
            },
            inject: [ConfigService]
        }),
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: ChatSession.name, schema: ChatSessionSchema },
            { name: ChatMessage.name, schema: ChatMessageSchema }
        ])
    ],
    exports: [MongooseModule]
})
export class MongoDBModule {}
