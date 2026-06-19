/**
 * Chat Module
 * 聊天模块 - 聚合角色卡、会话、消息三个子模块
 *
 * 包含：
 * - CharacterModule: 角色卡管理（CRUD、V3导入导出）
 * - SessionModule: 聊天会话管理（创建、查询、删除）
 * - MessageModule: 聊天消息管理（发送、查询、重新生成、切换回复）
 */

import { Module } from '@nestjs/common';
import { CharacterModule } from './character/character.module';
import { SessionModule } from './session/session.module';
import { MessageModule } from './message/message.module';

@Module({
    imports: [CharacterModule, SessionModule, MessageModule],
    exports: [CharacterModule, SessionModule, MessageModule]
})
export class ChatModule {}
