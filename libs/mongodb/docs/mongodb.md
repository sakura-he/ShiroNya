# mongodb 共享库说明

## 1. 依据代码清单
- `libs/mongodb/src/mongodb.module.ts`
- `libs/mongodb/src/schemas/character.schema.ts`
- `libs/mongodb/src/schemas/chat-session.schema.ts`
- `libs/mongodb/src/schemas/chat-message.schema.ts`
- `libs/mongodb/docs/chat-schema-diagram.md`

## 2. 库定位
`mongodb` 库集中提供聊天域的 Mongoose 连接与三张核心集合模型：`characters`、`chat_sessions`、`chat_messages`。

## 3. 核心能力
- `MongoDBModule` 使用 `MongooseModule.forRootAsync()` 读取 `MONGODB_URI`，并在连接建立/失败时输出运行日志。
- 模块内一次性注册 `Character`、`ChatSession`、`ChatMessage` 三套 schema，`app-api/chat/*` 子模块也会按需再次 `forFeature()` 注入局部模型。
- `CharacterSchema` 面向 `chara_card_v3` 规范，既保存顶层快捷字段，也保存完整 `data` 结构。
- `ChatSessionSchema` 保存角色快照、用户快照和 `chat_metadata`。
- `ChatMessageSchema` 保存消息、AI 生成元数据、swipes 与 `swipe_info`。

## 4. 环境变量
- `MONGODB_URI`

## 5. 真实使用示例
```ts
@InjectModel(ChatMessage.name)
private messageModel: Model<ChatMessageDocument>;

const items = await this.messageModel
  .find({ session_id: new Types.ObjectId(sessionId) })
  .sort({ send_date: 1 })
  .limit(limit + 1)
  .exec();
```

## 6. 相关文档
- 关系图：`mongodb-module-class-diagram.md`
- 聊天 schema 专项：`chat-schema-diagram.md`
