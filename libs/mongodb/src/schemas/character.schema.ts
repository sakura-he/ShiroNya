import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDocument = HydratedDocument<Character>;

/**
 * 深度提示角色类型
 */
export type DepthPromptRole = 'system' | 'user' | 'assistant';

/**
 * 深度提示配置
 * 用于在特定深度插入系统提示
 */
@Schema({ _id: false })
export class DepthPrompt {
    /** 提示内容 */
    @Prop({ default: '' })
    prompt!: string;

    /** 插入深度 */
    @Prop({ default: 4 })
    depth!: number;

    /** 角色类型 */
    @Prop({ type: String, default: 'system', enum: ['system', 'user', 'assistant'] })
    role!: DepthPromptRole;
}

/**
 * 正则脚本配置
 */
@Schema({ _id: false })
export class RegexScript {
    /** 脚本名称 */
    @Prop()
    name?: string;

    /** 匹配模式 */
    @Prop()
    pattern?: string;

    /** 替换内容 */
    @Prop()
    replacement?: string;

    /** 是否启用 */
    @Prop({ default: true })
    enabled?: boolean;
}

/**
 * 角色卡扩展配置
 */
@Schema({ _id: false })
export class CharacterExtensions {
    /** 话痨程度 0-1 */
    @Prop({ default: 0.5 })
    talkativeness!: number;

    /** 是否收藏 */
    @Prop({ default: false })
    fav!: boolean;

    /** 深度提示配置 */
    @Prop({ type: DepthPrompt, default: () => ({}) })
    depth_prompt!: DepthPrompt;

    /** 正则脚本 */
    @Prop({ type: [RegexScript], default: [] })
    regex_scripts!: RegexScript[];
}

/**
 * 角色卡主数据
 * 符合 chara_card_v3 规范
 */
@Schema({ _id: false })
export class CharacterData {
    /** 角色名称 */
    @Prop({ required: true })
    name!: string;

    /** 角色描述/人设 */
    @Prop({ default: '' })
    description!: string;

    /** 人格/性格设定 */
    @Prop({ default: '' })
    personality!: string;

    /** 场景/背景设定 */
    @Prop({ default: '' })
    scenario!: string;

    /** 第一条消息（开场白） */
    @Prop({ default: '' })
    first_mes!: string;

    /** 示例对话 */
    @Prop({ default: '' })
    mes_example!: string;

    /** 创建者备注 */
    @Prop({ default: '' })
    creator_notes!: string;

    /** 系统提示词 */
    @Prop({ default: '' })
    system_prompt!: string;

    /** 历史后指令 */
    @Prop({ default: '' })
    post_history_instructions!: string;

    /** 标签 */
    @Prop({ type: [String], default: [] })
    tags!: string[];

    /** 创建者 */
    @Prop({ default: '' })
    creator!: string;

    /** 角色版本 */
    @Prop({ default: '1.0' })
    character_version!: string;

    /** 备选开场白 */
    @Prop({ type: [String], default: [] })
    alternate_greetings!: string[];

    /** 群聊专用开场白 */
    @Prop({ type: [String], default: [] })
    group_only_greetings!: string[];

    /** 扩展配置 */
    @Prop({ type: CharacterExtensions, default: () => ({}) })
    extensions!: CharacterExtensions;
}

/**
 * 角色卡
 * 存储 AI 角色的完整设定，符合 chara_card_v3 规范
 */
@Schema({ collection: 'characters', timestamps: true })
export class Character {
    /** 规范类型 */
    @Prop({ default: 'chara_card_v3' })
    spec!: string;

    /** 规范版本 */
    @Prop({ default: '3.0' })
    spec_version!: string;

    /** 角色名称 (顶层快捷访问) */
    @Prop({ required: true })
    name!: string;

    /** 角色描述 (顶层快捷访问) */
    @Prop({ default: '' })
    description!: string;

    /** 人格设定 (顶层快捷访问) */
    @Prop({ default: '' })
    personality!: string;

    /** 场景设定 (顶层快捷访问) */
    @Prop({ default: '' })
    scenario!: string;

    /** 第一条消息 (顶层快捷访问) */
    @Prop({ default: '' })
    first_mes!: string;

    /** 示例对话 (顶层快捷访问) */
    @Prop({ default: '' })
    mes_example!: string;

    /** 创建者备注 */
    @Prop({ default: '' })
    creatorcomment!: string;

    /** 历史后指令 (顶层快捷访问) */
    @Prop({ default: '' })
    post_history_instructions!: string;

    /** 标签 (顶层快捷访问) */
    @Prop({ type: [String], default: [] })
    tags!: string[];

    /** 创建日期 */
    @Prop({ type: Date })
    create_date!: Date;

    /** 头像路径 */
    @Prop({ default: 'none' })
    avatar!: string;

    /** 话痨程度 (顶层快捷访问) */
    @Prop({ default: 0.5 })
    talkativeness!: number;

    /** 是否收藏 (顶层快捷访问) */
    @Prop({ default: false })
    fav!: boolean;

    /** 完整数据 (符合 V3 规范) */
    @Prop({ type: CharacterData, required: true })
    data!: CharacterData;

    /** 所属用户ID (系统扩展字段) */
    @Prop()
    user_id?: string;

    /** 是否公开 (系统扩展字段) */
    @Prop({ default: false })
    is_public!: boolean;
}

export const CharacterSchema = SchemaFactory.createForClass(Character);

// 索引: 按名称搜索
CharacterSchema.index({ 'name': 'text', 'data.description': 'text' });
// 索引: 按用户查询
CharacterSchema.index({ user_id: 1 });
// 索引: 按标签筛选
CharacterSchema.index({ tags: 1 });
// 索引: 公开角色列表
CharacterSchema.index({ is_public: 1, createdAt: -1 });
