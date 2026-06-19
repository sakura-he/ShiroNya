/**
 * ChatMessage Service
 * 聊天消息管理服务 - 处理消息业务逻辑
 *
 * Requirements: 12.1-12.5, 13.1-13.4, 14.1-14.5, 15.1-15.4
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '@app/mongodb/schemas/chat-message.schema';
import { ChatSession, ChatSessionDocument } from '@app/mongodb/schemas/chat-session.schema';
import { BusinessException, ErrorCodes } from '@app/common';
import { SendMessageDto, QueryMessageDto } from './dto/message-req.dto';

/**
 * 游标分页结果接口
 */
export interface CursorPaginatedResult<T> {
    items: T[];
    hasMore: boolean;
    nextCursor?: string;
}

@Injectable()
export class MessageService {
    constructor(
        @InjectModel(ChatMessage.name)
        private messageModel: Model<ChatMessageDocument>,
        @InjectModel(ChatSession.name)
        private sessionModel: Model<ChatSessionDocument>
    ) {}

    /**
     * 发送用户消息
     * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
     *
     * @param userId - 当前用户ID
     * @param dto - 发送消息数据
     * @returns 创建的消息文档
     */
    async send(userId: string, dto: SendMessageDto): Promise<ChatMessageDocument> {
        // 验证 session_id 格式
        if (!Types.ObjectId.isValid(dto.session_id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 12.4, 12.5: 验证会话存在且用户拥有该会话
        const session = await this.validateSessionOwnership(userId, dto.session_id);

        // Requirement 12.1: 创建用户消息，is_user=true
        // Requirement 12.2: 设置 send_date 为当前时间戳
        // Requirement 12.3: 设置 name 为会话的 user_name
        const message = new this.messageModel({
            session_id: new Types.ObjectId(dto.session_id),
            name: session.user_name,
            is_user: true,
            is_system: false,
            send_date: new Date(),
            mes: dto.mes,
            extra: {},
            swipes: [],
            swipe_id: 0,
            swipe_info: []
        });

        return message.save();
    }

    /**
     * 获取会话消息（游标分页）
     * Requirements: 13.1, 13.2, 13.3, 13.4
     *
     * @param userId - 当前用户ID
     * @param sessionId - 会话ID
     * @param query - 查询参数
     * @returns 游标分页消息列表
     */
    async findBySession(
        userId: string,
        sessionId: string,
        query: QueryMessageDto
    ): Promise<CursorPaginatedResult<ChatMessageDocument>> {
        // 验证 sessionId 格式
        if (!Types.ObjectId.isValid(sessionId)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 13.4: 验证会话所有权
        await this.validateSessionOwnership(userId, sessionId);

        const { limit = 50, before, after } = query;

        // 构建查询条件
        const filter: Record<string, any> = {
            session_id: new Types.ObjectId(sessionId)
        };

        // 游标分页：before 表示获取此消息之前的消息
        if (before) {
            if (!Types.ObjectId.isValid(before)) {
                throw new BusinessException(ErrorCodes.BAD_REQUEST);
            }
            // 获取游标消息的 send_date
            const cursorMessage = await this.messageModel.findById(before).exec();
            if (cursorMessage) {
                filter.send_date = { $lt: cursorMessage.send_date };
            }
        }

        // 游标分页：after 表示获取此消息之后的消息
        if (after) {
            if (!Types.ObjectId.isValid(after)) {
                throw new BusinessException(ErrorCodes.BAD_REQUEST);
            }
            // 获取游标消息的 send_date
            const cursorMessage = await this.messageModel.findById(after).exec();
            if (cursorMessage) {
                filter.send_date = { $gt: cursorMessage.send_date };
            }
        }

        // Requirement 13.1: 按 send_date 升序排序
        // Requirement 13.2, 13.3: 支持分页和限制数量
        const items = await this.messageModel
            .find(filter)
            .sort({ send_date: 1 })
            .limit(limit + 1) // 多查一条用于判断是否有更多
            .exec();

        // 判断是否有更多数据
        const hasMore = items.length > limit;
        if (hasMore) {
            items.pop(); // 移除多查的那条
        }

        // 计算下一页游标
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id.toString() : undefined;

        return {
            items,
            hasMore,
            nextCursor
        };
    }

    /**
     * 重新生成 AI 回复
     * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
     *
     * @param userId - 当前用户ID
     * @param messageId - 消息ID
     * @param newContent - 新的回复内容
     * @param extra - 可选的扩展信息（API、模型等）
     * @returns 更新后的消息文档
     */
    async regenerate(
        userId: string,
        messageId: string,
        newContent: string,
        extra?: {
            api?: string;
            model?: string;
            reasoning?: string;
            reasoning_duration?: number;
        }
    ): Promise<ChatMessageDocument> {
        // 验证 messageId 格式
        if (!Types.ObjectId.isValid(messageId)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // 获取消息
        const message = await this.messageModel.findById(messageId).exec();
        if (!message) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // 验证会话所有权
        await this.validateSessionOwnership(userId, message.session_id.toString());

        // Requirement 14.5: 用户消息不能重新生成
        if (message.is_user) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 14.1: 添加新回复到 swipes 数组
        const newSwipes = [...message.swipes, newContent];

        // Requirement 14.2: 更新 swipe_id 指向新回复
        const newSwipeId = newSwipes.length - 1;

        // Requirement 14.3: 添加对应的 SwipeInfo
        const now = new Date();
        const newSwipeInfo = {
            send_date: now,
            gen_started: now,
            gen_finished: now,
            extra: extra || {}
        };
        const newSwipeInfoArray = [...message.swipe_info, newSwipeInfo];

        // Requirement 14.4: 更新 mes 字段为新回复内容
        const updatedMessage = await this.messageModel
            .findByIdAndUpdate(
                messageId,
                {
                    $set: {
                        swipes: newSwipes,
                        swipe_id: newSwipeId,
                        swipe_info: newSwipeInfoArray,
                        mes: newContent
                    }
                },
                { new: true }
            )
            .exec();

        if (!updatedMessage) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        return updatedMessage;
    }

    /**
     * 切换候选回复
     * Requirements: 15.1, 15.2, 15.3, 15.4
     *
     * @param userId - 当前用户ID
     * @param messageId - 消息ID
     * @param swipeId - 目标候选回复索引
     * @returns 更新后的消息文档
     */
    async switchSwipe(userId: string, messageId: string, swipeId: number): Promise<ChatMessageDocument> {
        // 验证 messageId 格式
        if (!Types.ObjectId.isValid(messageId)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // 获取消息
        const message = await this.messageModel.findById(messageId).exec();
        if (!message) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // 验证会话所有权
        await this.validateSessionOwnership(userId, message.session_id.toString());

        // Requirement 15.4: 消息没有 swipes 时返回错误
        if (!message.swipes || message.swipes.length === 0) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 15.3: 验证 swipe_id 边界
        if (swipeId < 0 || swipeId >= message.swipes.length) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 15.1: 更新 swipe_id 到请求的索引
        // Requirement 15.2: 更新 mes 字段为选中的 swipe 内容
        const updatedMessage = await this.messageModel
            .findByIdAndUpdate(
                messageId,
                {
                    $set: {
                        swipe_id: swipeId,
                        mes: message.swipes[swipeId]
                    }
                },
                { new: true }
            )
            .exec();

        if (!updatedMessage) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        return updatedMessage;
    }

    /**
     * 验证会话所有权
     * 检查用户是否拥有该会话
     *
     * @param userId - 当前用户ID
     * @param sessionId - 会话ID
     * @returns 会话文档
     */
    private async validateSessionOwnership(userId: string, sessionId: string): Promise<ChatSessionDocument> {
        const session = await this.sessionModel.findById(sessionId).exec();

        // 会话不存在
        if (!session) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // 验证所有权
        if (session.user_id !== userId) {
            throw new BusinessException(ErrorCodes.FORBIDDEN);
        }

        return session;
    }
}
