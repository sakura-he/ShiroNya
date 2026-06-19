# character 模块说明

## 1. 依据代码清单
- `apps/app-api/src/modules/chat/character/character.module.ts`
- `apps/app-api/src/modules/chat/character/character.controller.ts`
- `apps/app-api/src/modules/chat/character/character.service.ts`
- `apps/app-api/src/modules/chat/character/schemas/v3-character-card.schema.ts`
- `libs/mongodb/src/schemas/character.schema.ts`

## 2. 模块定位
`character` 模块负责角色卡 CRUD，以及本项目内部角色卡结构与 `chara_card_v3` 之间的导入导出映射。

## 3. 对外入口
- HTTP Controller：`CharacterController`
- 路由前缀：`/app/character`

## 4. 依赖项与环境变量
- 依赖：`MongooseModule.forFeature(Character)`
- 持久化集合：`characters`
- 无独立环境变量，复用 `MONGODB_URI`

## 5. Provider / Service 与关键方法
- `create()`：同步顶层字段与 `data` 嵌套字段，创建角色卡。
- `findAll()`：支持分页、关键字搜索、标签筛选和公开角色查询。
- `findOne()`：按 `ObjectId` 获取详情，并校验“本人拥有或公开可读”。
- `update()`：只允许所有者更新，并保持顶层字段与 `data.*` 同步。
- `remove()`：删除角色卡，不级联删除会话，只依赖会话侧保留快照。
- `importV3()` / `exportV3()`：完成 V3 JSON 与 Mongo schema 的双向映射。

## 6. 调用链、数据流、异常流
- 所有单条读写都先校验 `ObjectId`。
- V3 导入分两步：解析 JSON / 校验 schema → 映射到 `CharacterData` → 保存到 `characters`。
- 顶层字段如 `name`、`description`、`tags` 与 `data.*` 会双写，兼顾快捷检索与 V3 完整性。
- 权限失败时抛 `FORBIDDEN`，格式错误时抛 `BAD_REQUEST`，找不到对象时抛 `NOT_FOUND`。

## 7. 真实使用示例
```ts
const character = await this.characterService.importV3(userId, v3Card);
const exported = await this.characterService.exportV3(userId, character.id);
```

## 8. 相关文档
- Controller：`character-controller.md`
- 关系图：`character-module-class-diagram.md`
- 聚合模块：`../../docs/chat.md`
