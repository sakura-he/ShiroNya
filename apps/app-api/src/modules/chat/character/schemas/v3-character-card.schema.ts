/**
 * V3 Character Card Schema
 * Zod 验证 schema 用于 V3 格式角色卡导入导出
 *
 * Requirements: 6.1-6.5, 7.1-7.3
 */

import { z } from 'zod';

/**
 * 深度提示配置 Schema
 */
export const DepthPromptSchema = z.object({
    prompt: z.string().default(''),
    depth: z.number().default(4),
    role: z.enum(['system', 'user', 'assistant']).default('system')
});

/**
 * 正则脚本配置 Schema
 */
export const RegexScriptSchema = z.object({
    name: z.string().optional(),
    pattern: z.string().optional(),
    replacement: z.string().optional(),
    enabled: z.boolean().default(true)
});

/**
 * 扩展配置 Schema
 */
export const ExtensionsSchema = z.object({
    talkativeness: z
        .union([z.string(), z.number()])
        .transform((val) => {
            if (typeof val === 'string') {
                const num = parseFloat(val);
                return isNaN(num) ? 0.5 : num;
            }
            return val;
        })
        .default(0.5),
    fav: z.boolean().default(false),
    depth_prompt: DepthPromptSchema.optional().default({
        prompt: '',
        depth: 4,
        role: 'system'
    }),
    regex_scripts: z.array(RegexScriptSchema).optional().default([])
});

/**
 * V3 角色卡数据 Schema
 */
export const V3CharacterDataSchema = z.object({
    name: z.string().min(1, 'name is required'),
    description: z.string().default(''),
    personality: z.string().default(''),
    scenario: z.string().default(''),
    first_mes: z.string().default(''),
    mes_example: z.string().default(''),
    creator_notes: z.string().default(''),
    system_prompt: z.string().default(''),
    post_history_instructions: z.string().default(''),
    tags: z.array(z.string()).default([]),
    creator: z.string().default(''),
    character_version: z.string().default('1.0'),
    alternate_greetings: z.array(z.string()).default([]),
    group_only_greetings: z.array(z.string()).default([]),
    extensions: ExtensionsSchema.optional().default({
        talkativeness: 0.5,
        fav: false,
        depth_prompt: { prompt: '', depth: 4, role: 'system' },
        regex_scripts: []
    })
});

/**
 * V3 角色卡完整 Schema
 * 用于导入验证
 *
 * Requirements: 6.1, 6.3 - 验证 spec 和 spec_version
 */
export const V3CharacterCardSchema = z.object({
    spec: z.literal('chara_card_v3'),
    spec_version: z
        .string()
        .refine((version) => version.startsWith('3.'), { message: 'Unsupported spec version. Expected version 3.x' }),
    name: z.string().min(1, 'name is required'),
    description: z.string().default(''),
    personality: z.string().default(''),
    scenario: z.string().default(''),
    first_mes: z.string().default(''),
    mes_example: z.string().default(''),
    creatorcomment: z.string().default(''),
    post_history_instructions: z.string().default(''),
    tags: z.array(z.string()).default([]),
    create_date: z.string().optional(),
    avatar: z.string().default('none'),
    talkativeness: z
        .union([z.string(), z.number()])
        .transform((val) => {
            if (typeof val === 'string') {
                const num = parseFloat(val);
                return isNaN(num) ? 0.5 : num;
            }
            return val;
        })
        .default(0.5),
    fav: z.boolean().default(false),
    data: V3CharacterDataSchema
});

/**
 * V3 角色卡类型
 */
export type V3CharacterCard = z.infer<typeof V3CharacterCardSchema>;
export type V3CharacterData = z.infer<typeof V3CharacterDataSchema>;
export type V3Extensions = z.infer<typeof ExtensionsSchema>;
export type V3DepthPrompt = z.infer<typeof DepthPromptSchema>;
export type V3RegexScript = z.infer<typeof RegexScriptSchema>;

/**
 * V3 导入结果类型
 */
export interface V3ImportResult {
    success: boolean;
    character?: any;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

/**
 * 验证 V3 JSON 字符串
 *
 * @param jsonString - JSON 字符串
 * @returns 解析结果
 */
export function parseV3Json(jsonString: string): {
    success: boolean;
    data?: V3CharacterCard;
    error?: { code: string; message: string; details?: unknown };
} {
    // Requirement 6.2: 解析 JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        return {
            success: false,
            error: {
                code: 'INVALID_JSON',
                message: 'Failed to parse JSON',
                details: e instanceof Error ? e.message : 'Unknown error'
            }
        };
    }

    // Requirement 6.3: 验证 V3 格式
    const result = V3CharacterCardSchema.safeParse(parsed);

    if (!result.success) {
        const issues = result.error.issues;
        const firstIssue = issues[0];
        const isSpecError = firstIssue?.path.includes('spec') || firstIssue?.path.includes('spec_version');

        return {
            success: false,
            error: {
                code: isSpecError ? 'UNSUPPORTED_SPEC' : 'VALIDATION_ERROR',
                message: firstIssue?.message || 'Validation failed',
                details: issues
            }
        };
    }

    return {
        success: true,
        data: result.data
    };
}

/**
 * 验证 V3 对象
 *
 * @param data - V3 对象
 * @returns 验证结果
 */
export function validateV3Object(data: unknown): {
    success: boolean;
    data?: V3CharacterCard;
    error?: { code: string; message: string; details?: unknown };
} {
    const result = V3CharacterCardSchema.safeParse(data);

    if (!result.success) {
        const issues = result.error.issues;
        const firstIssue = issues[0];
        const isSpecError = firstIssue?.path.includes('spec') || firstIssue?.path.includes('spec_version');

        return {
            success: false,
            error: {
                code: isSpecError ? 'UNSUPPORTED_SPEC' : 'VALIDATION_ERROR',
                message: firstIssue?.message || 'Validation failed',
                details: issues
            }
        };
    }

    return {
        success: true,
        data: result.data
    };
}
