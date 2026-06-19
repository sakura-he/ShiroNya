import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatSessionDocument = HydratedDocument<ChatSession>;

/**
 * 定时世界信息
 * 用于管理角色扮演中的世界设定触发条件
 */
@Schema({ _id: false })
export class TimedWorldInfo {
    /** 粘性触发器 - 持续生效的世界信息 */
    @Prop({ type: Object, default: {} })
    sticky!: Record<string, unknown>;

    /** 冷却触发器 - 有冷却时间的世界信息 */
    @Prop({ type: Object, default: {} })
    cooldown!: Record<string, unknown>;
}

/**
 * 聊天元数据
 * 存储聊天会话的配置和状态信息
 */
@Schema({ _id: false })
export class ChatMetadata {
    /** 会话完整性标识 (ULID) */
    @Prop({ required: true })
    integrity!: string;

    /** 聊天ID哈希值 */
    @Prop({ required: true })
    chat_id_hash!: number;

    /** 作者注释提示词 */
    @Prop({ default: '' })
    note_prompt!: string;

    /** 注释插入间隔 */
    @Prop({ default: 1 })
    note_interval!: number;

    /** 注释位置 */
    @Prop({ default: 1 })
    note_position!: number;

    /** 注释深度 */
    @Prop({ default: 4 })
    note_depth!: number;

    /** 注释角色 (0=系统, 1=用户, 2=助手) */
    @Prop({ default: 0 })
    note_role!: number;

    /** 会话是否被修改过 */
    @Prop({ default: false })
    tainted!: boolean;

    /** 定时世界信息配置 */
    @Prop({ type: TimedWorldInfo, default: () => ({}) })
    timedWorldInfo!: TimedWorldInfo;

    /** 上下文中最后一条消息的ID */
    @Prop({ default: 0 })
    lastInContextMessageId!: number;
}

/**
 * 聊天会话
 * 存储一次完整的 AI 对话会话信息
 */
@Schema({ collection: 'chat_sessions', timestamps: true })
export class ChatSession {
    /** 聊天元数据 */
    @Prop({ type: ChatMetadata, required: true })
    chat_metadata!: ChatMetadata;

    /** 用户名称 (快照，创建时记录) */
    @Prop({ required: true })
    user_name!: string;

    /** AI 角色名称 (快照，创建时记录) */
    @Prop({ required: true })
    character_name!: string;

    /** 关联的系统用户ID (PostgreSQL BetterAuthUser.id) */
    @Prop({ required: true })
    user_id!: string;

    /** 关联的角色卡ID */
    @Prop({ type: Types.ObjectId, ref: 'Character', required: true })
    character_id!: Types.ObjectId;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// 索引: 通过 integrity 快速查找会话
ChatSessionSchema.index({ 'chat_metadata.integrity': 1 }, { unique: true });
// 索引: 查询用户的所有会话
ChatSessionSchema.index({ user_id: 1 });
// 索引: 查询角色的所有会话
ChatSessionSchema.index({ character_id: 1 });
// 索引: 查询用户与特定角色的会话
ChatSessionSchema.index({ user_id: 1, character_id: 1 });
