import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

/**
 * 消息扩展信息
 * 存储 AI 生成相关的元数据
 */
@Schema({ _id: false })
export class MessageExtra {
    /** API 提供商 (如 koboldhorde, openai) */
    @Prop()
    api?: string;

    /** 使用的模型名称 */
    @Prop()
    model?: string;

    /** AI 推理过程 */
    @Prop()
    reasoning?: string;

    /** 推理耗时 (毫秒) */
    @Prop()
    reasoning_duration?: number;

    /** 推理签名 */
    @Prop()
    reasoning_signature?: string;

    /** 是否为小型系统消息 */
    @Prop()
    isSmallSys?: boolean;
}

/**
 * 滑动消息信息
 * 存储同一轮对话中 AI 生成的多个候选回复
 */
@Schema({ _id: false })
export class SwipeInfo {
    /** 发送时间 */
    @Prop({ type: Date })
    send_date!: Date;

    /** 生成开始时间 */
    @Prop({ type: Date })
    gen_started?: Date;

    /** 生成完成时间 */
    @Prop({ type: Date })
    gen_finished?: Date;

    /** 该滑动消息的扩展信息 */
    @Prop({ type: MessageExtra, default: () => ({}) })
    extra!: MessageExtra;
}

/**
 * 聊天消息
 * 存储单条对话消息，支持用户消息和 AI 回复
 */
@Schema({ collection: 'chat_messages', timestamps: true })
export class ChatMessage {
    /** 所属会话ID */
    @Prop({ type: Types.ObjectId, ref: 'ChatSession', required: true })
    session_id!: Types.ObjectId;

    /** 发送者名称 */
    @Prop({ required: true })
    name!: string;

    /** 是否为用户消息 */
    @Prop({ required: true })
    is_user!: boolean;

    /** 是否为系统消息 */
    @Prop({ default: false })
    is_system!: boolean;

    /** 发送时间 */
    @Prop({ type: Date, required: true })
    send_date!: Date;

    /** 消息内容 */
    @Prop({ required: true })
    mes!: string;

    /** 消息标题 (通常显示生成模型信息) */
    @Prop()
    title?: string;

    /** 生成开始时间 */
    @Prop({ type: Date })
    gen_started?: Date;

    /** 生成完成时间 */
    @Prop({ type: Date })
    gen_finished?: Date;

    /** 消息扩展信息 */
    @Prop({ type: MessageExtra, default: () => ({}) })
    extra!: MessageExtra;

    /** 强制使用的头像路径 */
    @Prop()
    force_avatar?: string;

    /** 滑动消息内容列表 (多个候选回复) */
    @Prop({ type: [String], default: [] })
    swipes!: string[];

    /** 当前选中的滑动消息索引 */
    @Prop({ default: 0 })
    swipe_id!: number;

    /** 滑动消息的详细信息 */
    @Prop({ type: [SwipeInfo], default: [] })
    swipe_info!: SwipeInfo[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// 索引: 按会话和时间查询消息
ChatMessageSchema.index({ session_id: 1, send_date: 1 });
// 索引: 按会话筛选用户/AI消息
ChatMessageSchema.index({ session_id: 1, is_user: 1 });
