# message 模块说明

## 1. 依据代码清单
- `apps/app-api/src/modules/chat/message/message.module.ts`
- `apps/app-api/src/modules/chat/message/message.controller.ts`
- `apps/app-api/src/modules/chat/message/message.service.ts`
- `libs/mongodb/src/schemas/chat-message.schema.ts`
- `libs/mongodb/src/schemas/chat-session.schema.ts`

## 2. 模块定位
`message` 模块负责会话内消息写入、游标查询、AI 候选回复重生成和 swipe 切换。

## 3. 对外入口
- HTTP Controller：`MessageController`
- 路由前缀：`/app/chat/message`

## 4. 依赖项
- Mongoose 模型：`ChatMessage`、`ChatSession`
- 无独立环境变量

## 5. Provider / Service 与关键方法
- `send()`：写入用户消息，默认 `is_user=true`。
- `findBySession()`：按 `send_date` 升序做游标分页，支持 `before/after`。
- `regenerate()`：给 AI 消息追加新的 `swipes` 候选内容，并同步更新 `swipe_info` 与当前 `mes`。
- `switchSwipe()`：在已有候选之间切换 `swipe_id`，并同步更新当前展示的 `mes`。

## 6. 数据流、异常流与核心原理
- 所有操作都先通过 `validateSessionOwnership()` 确认用户拥有会话。
- `regenerate()` 只允许 AI 消息执行，用户消息会被拒绝。
- `findBySession()` 多查一条记录来判定 `hasMore`，再计算 `nextCursor`。
- `switchSwipe()` 要求消息已有 `swipes` 且索引不越界。

## 7. 真实使用示例
```ts
await this.messageService.regenerate(userId, messageId, '新的 AI 回复', {
  model: 'gpt-4.1',
});
```

## 8. 相关文档
- Controller：`message-controller.md`
- 关系图：`message-module-class-diagram.md`
- 会话模块：`../../session/docs/session.md`
