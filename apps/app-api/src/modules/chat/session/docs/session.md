# session 模块说明

## 1. 依据代码清单
- `apps/app-api/src/modules/chat/session/session.module.ts`
- `apps/app-api/src/modules/chat/session/session.controller.ts`
- `apps/app-api/src/modules/chat/session/session.service.ts`
- `libs/mongodb/src/schemas/chat-session.schema.ts`
- `libs/mongodb/src/schemas/character.schema.ts`
- `libs/mongodb/src/schemas/chat-message.schema.ts`

## 2. 模块定位
`session` 模块负责聊天会话生命周期，核心是创建会话时固化角色快照、维护 `chat_metadata`，以及在删除时级联清理消息。

## 3. 对外入口
- HTTP Controller：`SessionController`
- 路由前缀：`/app/chat/session`

## 4. 依赖项
- Mongoose 模型：`ChatSession`、`Character`、`ChatMessage`
- 无独立环境变量

## 5. Provider / Service 与关键方法
- `create()`：验证角色卡存在，生成 `integrity`、`chat_id_hash` 和默认 `chat_metadata`，保存用户/角色名称快照。
- `findAll()`：只返回当前用户的会话，支持按角色分页筛选。
- `findOne()`：返回会话详情并 `populate` 角色卡关键字段。
- `remove()`：删除会话前先删 `chat_messages`。

## 6. 数据流、异常流与关键原理
- 会话创建前必须先存在角色卡。
- `character_name` 和 `user_name` 在创建时即快照，角色卡之后被删或改名也不影响既有会话展示。
- 列表按 `updatedAt` 倒序，详情返回角色卡 `name/avatar/description/personality/scenario/first_mes`。
- 删除时先级联删除消息，再删除会话主记录。

## 7. 真实使用示例
```ts
await this.sessionService.create(userId, {
  character_id: '67d1...',
  user_name: 'User'
});
```

## 8. 相关文档
- Controller：`session-controller.md`
- 关系图：`session-module-class-diagram.md`
- 消息模块：`../../message/docs/message.md`
