/**
 * ChatMessage Request DTOs
 * 聊天消息请求 DTO - 使用 Zod schema 定义验证规则
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 发送消息请求 Schema
 * Requirements: 12.1
 */
export const SendMessageSchema = z.object({
    session_id: z.string().min(1).describe('会话ID'),
    mes: z.string().min(1).describe('消息内容')
});

export class SendMessageDto extends createZodDto(SendMessageSchema) {}

/**
 * 查询消息列表请求 Schema
 * 支持游标分页
 * Requirements: 13.2
 */
export const QueryMessageSchema = z.object({
    limit: z.coerce.number().int().positive().max(100).optional().default(50).describe('返回数量'),
    before: z.string().optional().describe('游标：返回此消息ID之前的消息'),
    after: z.string().optional().describe('游标：返回此消息ID之后的消息')
});

export class QueryMessageDto extends createZodDto(QueryMessageSchema) {}

/**
 * 重新生成回复请求 Schema
 * Requirements: 14.1
 */
export const RegenerateMessageSchema = z.object({
    mes: z.string().min(1).describe('新的回复内容'),
    extra: z
        .object({
            api: z.string().optional().describe('API提供商'),
            model: z.string().optional().describe('模型名称'),
            reasoning: z.string().optional().describe('推理过程'),
            reasoning_duration: z.number().optional().describe('推理耗时(ms)')
        })
        .optional()
        .describe('扩展信息')
});

export class RegenerateMessageDto extends createZodDto(RegenerateMessageSchema) {}

/**
 * 切换候选回复请求 Schema
 * Requirements: 15.1
 */
export const SwitchSwipeSchema = z.object({
    swipe_id: z.number().int().min(0).describe('候选回复索引')
});

export class SwitchSwipeDto extends createZodDto(SwitchSwipeSchema) {}
