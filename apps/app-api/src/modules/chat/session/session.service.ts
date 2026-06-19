/**
 * ChatSession Service
 * 聊天会话管理服务 - 处理会话业务逻辑
 *
 * Requirements: 8.1-8.5, 9.1-9.4, 10.1-10.3, 11.1-11.3
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ulid } from 'ulid';
import { ChatSession, ChatSessionDocument } from '@app/mongodb/schemas/chat-session.schema';
import { Character, CharacterDocument } from '@app/mongodb/schemas/character.schema';
import { ChatMessage, ChatMessageDocument } from '@app/mongodb/schemas/chat-message.schema';
import { BusinessException, ErrorCodes } from '@app/common';
import { CreateSessionDto, QuerySessionDto } from './dto/session-req.dto';

/**
 * 分页结果接口
 */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class SessionService {
    constructor(
        @InjectModel(ChatSession.name)
        private sessionModel: Model<ChatSessionDocument>,
        @InjectModel(Character.name)
        private characterModel: Model<CharacterDocument>,
        @InjectModel(ChatMessage.name)
        private messageModel: Model<ChatMessageDocument>
    ) {}

    /**
     * 创建会话
     * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
     *
     * @param userId - 当前用户ID
     * @param dto - 创建会话数据
     * @returns 创建的会话文档
     */
    async create(userId: string, dto: CreateSessionDto): Promise<ChatSessionDocument> {
        // 验证 character_id 格式
        if (!Types.ObjectId.isValid(dto.character_id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 8.5: 验证角色是否存在
        const character = await this.characterModel.findById(dto.character_id).exec();
        if (!character) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 8.2: 生成唯一 ULID
        const integrity = this.generateULID();

        // 生成 chat_id_hash (简单哈希)
        const chatIdHash = this.generateChatIdHash(userId, dto.character_id);

        // Requirement 8.3: 快照用户名和角色名
        const userName = dto.user_name || 'User';
        const characterName = character.name;

        // Requirement 8.1, 8.4: 创建会话，初始化 chat_metadata 默认值
        const session = new this.sessionModel({
            user_id: userId,
            character_id: new Types.ObjectId(dto.character_id),
            user_name: userName,
            character_name: characterName,
            chat_metadata: {
                integrity,
                chat_id_hash: chatIdHash,
                note_prompt: '',
                note_interval: 1,
                note_position: 1,
                note_depth: 4,
                note_role: 0,
                tainted: false,
                timedWorldInfo: {
                    sticky: {},
                    cooldown: {}
                },
                lastInContextMessageId: 0
            }
        });

        return session.save();
    }

    /**
     * 查询会话列表
     * Requirements: 9.1, 9.2, 9.3, 9.4
     *
     * @param userId - 当前用户ID
     * @param query - 查询参数
     * @returns 分页会话列表
     */
    async findAll(userId: string, query: QuerySessionDto): Promise<PaginatedResult<ChatSessionDocument>> {
        const { page = 1, limit = 20, character_id } = query;
        const skip = (page - 1) * limit;

        // Requirement 9.1: 构建查询条件，只返回用户自己的会话
        const filter: Record<string, any> = {
            user_id: userId
        };

        // 按角色筛选
        if (character_id) {
            if (!Types.ObjectId.isValid(character_id)) {
                throw new BusinessException(ErrorCodes.BAD_REQUEST);
            }
            filter.character_id = new Types.ObjectId(character_id);
        }

        // Requirement 9.2, 9.3, 9.4: 分页查询，按 updatedAt 降序排序，populate 角色信息
        const [items, total] = await Promise.all([
            this.sessionModel
                .find(filter)
                .sort({ updatedAt: -1 }) // Requirement 9.3: 按 updatedAt 降序
                .skip(skip)
                .limit(limit)
                .populate({
                    path: 'character_id',
                    select: 'name avatar', // Requirement 9.4: 只返回 name 和 avatar
                    model: Character.name
                })
                .exec(),
            this.sessionModel.countDocuments(filter).exec()
        ]);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * 获取会话详情
     * Requirements: 10.1, 10.2, 10.3
     *
     * @param userId - 当前用户ID
     * @param id - 会话ID
     * @returns 会话文档
     */
    async findOne(userId: string, id: string): Promise<ChatSessionDocument> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 10.1: 获取会话并 populate 角色数据
        const session = await this.sessionModel
            .findById(id)
            .populate({
                path: 'character_id',
                select: 'name avatar description personality scenario first_mes',
                model: Character.name
            })
            .exec();

        // Requirement 10.2: 不存在返回 404
        if (!session) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 10.3: 验证所有权
        await this.validateOwnership(userId, session);

        return session;
    }

    /**
     * 删除会话（级联删除消息）
     * Requirements: 11.1, 11.2, 11.3
     *
     * @param userId - 当前用户ID
     * @param id - 会话ID
     */
    async remove(userId: string, id: string): Promise<void> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        const session = await this.sessionModel.findById(id).exec();

        if (!session) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 11.3: 验证所有权
        await this.validateOwnership(userId, session);

        // Requirement 11.2: 级联删除所有关联消息
        await this.messageModel
            .deleteMany({
                session_id: new Types.ObjectId(id)
            })
            .exec();

        // Requirement 11.1: 删除会话
        await this.sessionModel.findByIdAndDelete(id).exec();
    }

    /**
     * 生成 ULID
     * ULID 提供时间有序的唯一标识符
     * Requirement 8.2
     *
     * @returns ULID 字符串
     */
    private generateULID(): string {
        return ulid();
    }

    /**
     * 生成 chat_id_hash
     * 简单哈希函数，用于快速查找
     *
     * @param userId - 用户ID
     * @param characterId - 角色ID
     * @returns 哈希值
     */
    private generateChatIdHash(userId: string, characterId: string): number {
        const str = `${userId}-${characterId}-${Date.now()}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * 验证所有权
     * 检查用户是否拥有该会话
     *
     * @param userId - 当前用户ID
     * @param session - 会话文档
     */
    private async validateOwnership(userId: string, session: ChatSessionDocument): Promise<void> {
        if (session.user_id !== userId) {
            throw new BusinessException(ErrorCodes.FORBIDDEN);
        }
    }
}
