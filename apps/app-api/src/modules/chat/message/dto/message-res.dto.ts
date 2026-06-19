/**
 * ChatMessage Response DTOs
 * 聊天消息响应 DTO - 纯业务 Schema
 * 遵循项目规范：只导出纯业务 Schema，不需要 { data } 包装
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 消息扩展信息 Schema
 * 存储 AI 生成相关的元数据
 */
export const MessageExtraSchema = z.object({
    api: z.string().optional().describe('API提供商'),
    model: z.string().optional().describe('模型名称'),
    reasoning: z.string().optional().describe('推理过程'),
    reasoning_duration: z.number().optional().describe('推理耗时(ms)'),
    reasoning_signature: z.string().optional().describe('推理签名'),
    isSmallSys: z.boolean().optional().describe('是否为小型系统消息')
});
export class MessageExtraDto extends createZodDto(MessageExtraSchema) {}

/**
 * 滑动消息信息 Schema
 * 存储同一轮对话中 AI 生成的多个候选回复的元数据
 */
export const SwipeInfoSchema = z.object({
    send_date: z.string().describe('发送时间'),
    gen_started: z.string().optional().describe('生成开始时间'),
    gen_finished: z.string().optional().describe('生成完成时间'),
    extra: MessageExtraSchema.describe('该滑动消息的扩展信息')
});
export class SwipeInfoDto extends createZodDto(SwipeInfoSchema) {}

/**
 * 消息响应 Schema
 * 基于 Mongoose ChatMessage Document 定义
 */
export const MessageSchema = z.object({
    _id: z.string().describe('消息ID'),
    session_id: z.string().describe('会话ID'),
    name: z.string().describe('发送者名称'),
    is_user: z.boolean().describe('是否用户消息'),
    is_system: z.boolean().describe('是否系统消息'),
    send_date: z.string().describe('发送时间'),
    mes: z.string().describe('消息内容'),
    title: z.string().optional().describe('消息标题'),
    gen_started: z.string().optional().describe('生成开始时间'),
    gen_finished: z.string().optional().describe('生成完成时间'),
    extra: MessageExtraSchema.optional().describe('扩展信息'),
    force_avatar: z.string().optional().describe('强制使用的头像路径'),
    swipes: z.array(z.string()).describe('候选回复列表'),
    swipe_id: z.number().describe('当前选中索引'),
    swipe_info: z.array(SwipeInfoSchema).optional().describe('滑动消息的详细信息'),
    createdAt: z.string().describe('创建时间'),
    updatedAt: z.string().describe('更新时间')
});
export class MessageDto extends createZodDto(MessageSchema) {}

/**
 * 单个消息响应 Schema
 * 使用 z.any() 接收 Mongoose Document 类型
 */
export const MessageResSchema = z.any().describe('消息数据');
export class MessageResDto extends createZodDto(MessageResSchema) {}

/**
 * 游标分页数据 Schema
 * 用于消息列表的游标分页
 */
export const MessageListDataSchema = z.object({
    items: z.array(z.any()).describe('消息列表'),
    hasMore: z.boolean().describe('是否有更多'),
    nextCursor: z.string().optional().describe('下一页游标')
});
export class MessageListDataDto extends createZodDto(MessageListDataSchema) {}

/**
 * 消息列表响应 Schema（纯业务 Schema）
 */
export const MessageListResSchema = MessageListDataSchema;
export class MessageListResDto extends createZodDto(MessageListResSchema) {}

/**
 * 删除消息响应 Schema
 */
export const DeleteMessageResSchema = z.object({
    message: z.string().describe('删除结果消息')
});
export class DeleteMessageResDto extends createZodDto(DeleteMessageResSchema) {}
