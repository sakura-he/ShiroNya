/**
 * Session Request DTOs
 * 聊天会话请求 DTO - 使用 Zod schema 定义验证规则
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 创建会话请求 Schema
 * Requirements: 8.1
 */
export const CreateSessionSchema = z.object({
    character_id: z.string().min(1).describe('角色卡ID'),
    user_name: z.string().min(1).optional().default('User').describe('用户名称')
});

export class CreateSessionDto extends createZodDto(CreateSessionSchema) {}

/**
 * 查询会话列表请求 Schema
 * Requirements: 9.2
 */
export const QuerySessionSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1).describe('页码'),
    limit: z.coerce.number().int().positive().max(100).optional().default(20).describe('每页数量'),
    character_id: z.string().optional().describe('按角色筛选')
});

export class QuerySessionDto extends createZodDto(QuerySessionSchema) {}
