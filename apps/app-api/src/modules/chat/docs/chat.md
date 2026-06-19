# chat 模块说明

## 1. 依据代码清单
- `apps/app-api/src/modules/chat/chat.module.ts`
- `apps/app-api/src/modules/chat/character/character.module.ts`
- `apps/app-api/src/modules/chat/character/character.service.ts`
- `apps/app-api/src/modules/chat/session/session.module.ts`
- `apps/app-api/src/modules/chat/session/session.service.ts`
- `apps/app-api/src/modules/chat/message/message.module.ts`
- `apps/app-api/src/modules/chat/message/message.service.ts`
- `libs/mongodb/src/schemas/character.schema.ts`
- `libs/mongodb/src/schemas/chat-session.schema.ts`
- `libs/mongodb/src/schemas/chat-message.schema.ts`

## 2. 模块定位
`chat` 是聊天业务聚合壳模块，负责把角色卡、聊天会话和消息三条 Mongo 数据链组织成一个完整会话域。

## 3. 对外入口
- 聚合入口：`ChatModule`
- 实际 HTTP 入口：
  - `character` 控制器
  - `chat/session` 控制器
  - `chat/message` 控制器

## 4. 依赖项
- 子模块：`CharacterModule`、`SessionModule`、`MessageModule`
- 基础设施：MongoDB（`characters`、`chat_sessions`、`chat_messages`）
- 无独立环境变量，复用 `MONGODB_URI`

## 5. 业务边界与调用链
- 角色卡先于会话存在；会话创建时会快照 `character_name` 和 `user_name`。
- 会话先于消息存在；消息发送和 swipes 切换都要求先验证 `session_id` 所属权。
- `SessionService.remove()` 负责级联删除会话下的所有消息。
- `CharacterService.exportV3()` / `importV3()` 负责在内部 schema 与 `chara_card_v3` 之间做映射。

## 6. 数据流与异常流
- 所有 ID 都先校验为 Mongo `ObjectId`；非法格式统一抛 `BAD_REQUEST`。
- 角色卡与会话的访问控制都以“本人拥有或公开可读”为准。
- 消息服务会先校验会话归属，再允许发送、重新生成或切换 swipe。
- 该聚合模块本身不直接处理 AI 推理；消息模块只负责保存消息和候选回复结构。

## 7. 使用示例
```ts
const session = await this.sessionService.create(userId, {
  character_id,
  user_name: 'User',
});
```

## 8. 相关文档
- 关系图：`chat-module-class-diagram.md`
- 角色卡：`../character/docs/character.md`
- 会话：`../session/docs/session.md`
- 消息：`../message/docs/message.md`
