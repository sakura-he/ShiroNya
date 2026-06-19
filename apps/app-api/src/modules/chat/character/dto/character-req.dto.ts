/**
 * Character Request DTOs
 * 角色卡请求 DTO - 使用 Zod schema 定义验证规则
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 角色卡嵌套数据 Schema (V3 规范)
 * 用于创建时传入完整的 V3 数据结构
 */
export const CharacterDataSchema = z.object({
    name: z.string().min(1).describe('角色名称'),
    description: z.string().optional().default('').describe('角色描述/人设'),
    personality: z.string().optional().default('').describe('人格/性格设定'),
    scenario: z.string().optional().default('').describe('场景/背景设定'),
    first_mes: z.string().optional().default('').describe('第一条消息（开场白）'),
    mes_example: z.string().optional().default('').describe('示例对话'),
    creator_notes: z.string().optional().default('').describe('创建者备注'),
    system_prompt: z.string().optional().default('').describe('系统提示词'),
    post_history_instructions: z.string().optional().default('').describe('历史后指令'),
    tags: z.array(z.string()).optional().default([]).describe('标签'),
    creator: z.string().optional().default('').describe('创建者'),
    character_version: z.string().optional().default('1.0').describe('角色版本'),
    alternate_greetings: z.array(z.string()).optional().default([]).describe('备选开场白'),
    group_only_greetings: z.array(z.string()).optional().default([]).describe('群聊专用开场白')
});

/**
 * 创建角色卡请求 Schema
 * Requirements: 1.1, 1.2
 */
export const CreateCharacterSchema = z.object({
    name: z.string().min(1).describe('角色名称'),
    description: z.string().optional().default('').describe('角色描述'),
    personality: z.string().optional().default('').describe('人格设定'),
    scenario: z.string().optional().default('').describe('场景设定'),
    first_mes: z.string().optional().default('').describe('开场白'),
    mes_example: z.string().optional().default('').describe('示例对话'),
    tags: z.array(z.string()).optional().default([]).describe('标签'),
    is_public: z.boolean().optional().default(false).describe('是否公开'),
    data: CharacterDataSchema.optional().describe('完整数据（V3规范）')
});

export class CreateCharacterDto extends createZodDto(CreateCharacterSchema) {}

/**
 * 更新角色卡请求 Schema
 * 所有字段均为可选
 */
export const UpdateCharacterSchema = CreateCharacterSchema.partial();

export class UpdateCharacterDto extends createZodDto(UpdateCharacterSchema) {}

/**
 * 查询角色卡列表请求 Schema
 * Requirements: 2.3, 2.4, 2.5
 */
export const QueryCharacterSchema = z.object({
    page: z.coerce.number().int().positive().optional().default(1).describe('页码'),
    limit: z.coerce.number().int().positive().max(100).optional().default(20).describe('每页数量'),
    search: z.string().optional().describe('搜索关键词（搜索 name 和 description）'),
    tags: z.string().optional().describe('标签筛选（逗号分隔）'),
    is_public: z.coerce.boolean().optional().describe('是否只查询公开角色')
});

export class QueryCharacterDto extends createZodDto(QueryCharacterSchema) {}
