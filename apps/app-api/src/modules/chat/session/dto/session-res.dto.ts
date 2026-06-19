/**
 * Session Response DTOs
 * 聊天会话响应 DTO - 纯业务 Schema
 * 遵循项目规范：只导出纯业务 Schema，不需要 { data } 包装
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 定时世界信息 Schema
 */
export const TimedWorldInfoSchema = z.object({
    sticky: z.record(z.string(), z.unknown()).describe('粘性触发器'),
    cooldown: z.record(z.string(), z.unknown()).describe('冷却触发器')
});
export class TimedWorldInfoDto extends createZodDto(TimedWorldInfoSchema) {}

/**
 * 聊天元数据 Schema
 */
export const ChatMetadataSchema = z.object({
    integrity: z.string().describe('会话唯一标识(ULID)'),
    chat_id_hash: z.number().describe('聊天ID哈希值'),
    note_prompt: z.string().describe('作者注释提示词'),
    note_interval: z.number().describe('注释插入间隔'),
    note_position: z.number().describe('注释位置'),
    note_depth: z.number().describe('注释深度'),
    note_role: z.number().describe('注释角色'),
    tainted: z.boolean().describe('是否被修改过'),
    timedWorldInfo: TimedWorldInfoSchema.describe('定时世界信息配置'),
    lastInContextMessageId: z.number().describe('上下文中最后一条消息的ID')
});
export class ChatMetadataDto extends createZodDto(ChatMetadataSchema) {}

/**
 * 关联角色信息 Schema (用于列表展示)
 */
export const SessionCharacterSchema = z.object({
    _id: z.string().describe('角色ID'),
    name: z.string().describe('角色名称'),
    avatar: z.string().describe('角色头像')
});
export class SessionCharacterDto extends createZodDto(SessionCharacterSchema) {}

/**
 * 会话响应 Schema
 * 基于 Mongoose ChatSession Document 定义
 */
export const SessionSchema = z.object({
    _id: z.string().describe('会话ID'),
    user_id: z.string().describe('用户ID'),
    character_id: z.string().describe('角色卡ID'),
    user_name: z.string().describe('用户名快照'),
    character_name: z.string().describe('角色名快照'),
    chat_metadata: ChatMetadataSchema.describe('会话元数据'),
    character: SessionCharacterSchema.optional().describe('关联角色信息'),
    createdAt: z.string().describe('创建时间'),
    updatedAt: z.string().describe('更新时间')
});
export class SessionDto extends createZodDto(SessionSchema) {}

/**
 * 单个会话响应 Schema
 * 使用 z.any() 接收 Mongoose Document 类型
 */
export const SessionResSchema = z.any().describe('会话数据');
export class SessionResDto extends createZodDto(SessionResSchema) {}

/**
 * 分页数据 Schema
 */
export const SessionListDataSchema = z.object({
    items: z.array(z.any()).describe('会话列表'),
    total: z.number().describe('总数'),
    page: z.number().describe('当前页'),
    limit: z.number().describe('每页数量'),
    totalPages: z.number().describe('总页数')
});
export class SessionListDataDto extends createZodDto(SessionListDataSchema) {}

/**
 * 会话列表响应 Schema（纯业务 Schema）
 */
export const SessionListResSchema = SessionListDataSchema;
export class SessionListResDto extends createZodDto(SessionListResSchema) {}

/**
 * 删除会话响应 Schema
 */
export const DeleteSessionResSchema = z.object({
    message: z.string().describe('删除结果消息')
});
export class DeleteSessionResDto extends createZodDto(DeleteSessionResSchema) {}
