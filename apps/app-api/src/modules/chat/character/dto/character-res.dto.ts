/**
 * Character Response DTOs
 * 角色卡响应 DTO - 导出纯业务 Schema，供 @ApiOkResByZod 使用
 */

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 深度提示配置 Schema
 */
export const DepthPromptSchema = z.object({
    prompt: z.string().describe('提示内容'),
    depth: z.number().describe('插入深度'),
    role: z.enum(['system', 'user', 'assistant']).describe('角色类型')
});
export class DepthPromptDto extends createZodDto(DepthPromptSchema) {}

/**
 * 正则脚本配置 Schema
 */
export const RegexScriptSchema = z.object({
    name: z.string().optional().describe('脚本名称'),
    pattern: z.string().optional().describe('匹配模式'),
    replacement: z.string().optional().describe('替换内容'),
    enabled: z.boolean().optional().describe('是否启用')
});
export class RegexScriptDto extends createZodDto(RegexScriptSchema) {}

/**
 * 角色卡扩展配置 Schema
 */
export const CharacterExtensionsSchema = z.object({
    talkativeness: z.number().describe('话痨程度 0-1'),
    fav: z.boolean().describe('是否收藏'),
    depth_prompt: DepthPromptSchema.describe('深度提示配置'),
    regex_scripts: z.array(RegexScriptSchema).describe('正则脚本')
});
export class CharacterExtensionsDto extends createZodDto(CharacterExtensionsSchema) {}

/**
 * 角色卡主数据 Schema (V3 规范)
 */
export const CharacterDataResponseSchema = z.object({
    name: z.string().describe('角色名称'),
    description: z.string().describe('角色描述/人设'),
    personality: z.string().describe('人格/性格设定'),
    scenario: z.string().describe('场景/背景设定'),
    first_mes: z.string().describe('第一条消息（开场白）'),
    mes_example: z.string().describe('示例对话'),
    creator_notes: z.string().describe('创建者备注'),
    system_prompt: z.string().describe('系统提示词'),
    post_history_instructions: z.string().describe('历史后指令'),
    tags: z.array(z.string()).describe('标签'),
    creator: z.string().describe('创建者'),
    character_version: z.string().describe('角色版本'),
    alternate_greetings: z.array(z.string()).describe('备选开场白'),
    group_only_greetings: z.array(z.string()).describe('群聊专用开场白'),
    extensions: CharacterExtensionsSchema.describe('扩展配置')
});
export class CharacterDataResponseDto extends createZodDto(CharacterDataResponseSchema) {}

/**
 * 角色卡响应 Schema
 * 基于 Mongoose Character Document 定义
 */
export const CharacterSchema = z.object({
    _id: z.string().describe('角色ID'),
    spec: z.string().describe('规范类型'),
    spec_version: z.string().describe('规范版本'),
    name: z.string().describe('角色名称'),
    description: z.string().describe('角色描述'),
    personality: z.string().describe('人格设定'),
    scenario: z.string().describe('场景设定'),
    first_mes: z.string().describe('开场白'),
    mes_example: z.string().describe('示例对话'),
    creatorcomment: z.string().describe('创建者备注'),
    post_history_instructions: z.string().describe('历史后指令'),
    tags: z.array(z.string()).describe('标签'),
    create_date: z.string().optional().describe('创建日期'),
    avatar: z.string().describe('头像路径'),
    talkativeness: z.number().describe('话痨程度'),
    fav: z.boolean().describe('是否收藏'),
    data: CharacterDataResponseSchema.describe('完整数据（V3规范）'),
    user_id: z.string().optional().describe('所属用户ID'),
    is_public: z.boolean().describe('是否公开'),
    createdAt: z.string().describe('创建时间'),
    updatedAt: z.string().describe('更新时间')
});
export class CharacterDto extends createZodDto(CharacterSchema) {}

/**
 * 单个角色卡响应 Schema（使用 z.any() 接收 Mongoose Document 类型）
 */
export const CharacterResSchema = z.any().describe('角色卡数据');
export class CharacterResDto extends createZodDto(CharacterResSchema) {}

/**
 * 分页数据 Schema
 */
export const CharacterListDataSchema = z.object({
    items: z.array(z.any()).describe('角色列表'),
    total: z.number().describe('总数'),
    page: z.number().describe('当前页'),
    limit: z.number().describe('每页数量'),
    totalPages: z.number().describe('总页数')
});
export class CharacterListDataDto extends createZodDto(CharacterListDataSchema) {}

/**
 * 删除角色卡响应 Schema
 */
export const DeleteCharacterResSchema = z.object({
    message: z.string().describe('删除结果消息')
});
export class DeleteCharacterResDto extends createZodDto(DeleteCharacterResSchema) {}

/**
 * V3 角色卡导出响应 Schema（使用 z.any() 接收复杂导出结构）
 */
export const V3CharacterExportResSchema = z.any().describe('V3 格式角色卡数据');
export class V3CharacterExportResDto extends createZodDto(V3CharacterExportResSchema) {}
