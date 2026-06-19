---
name: remove-compat-wrappers
description: "Use when refactoring code that contains wrapper, adapter, compat, legacy, converter, mapper, normalize, transform, old DTO/type/enum/field-name compatibility layers, shallow forwarding services/helpers, or dual-track interfaces. 清理为了兼容旧接口、旧类型、旧枚举、旧字段、旧模块结构而新增的无意义包装层、转换层、适配层，并优先修改底层实现直接符合当前业务接口。"
---

# 清理兼容层与无意义 Wrapper

## 目标

当代码中出现为了兼容旧接口、旧类型、旧枚举、旧字段、旧模块结构而新增的包装层、转换层、适配层时，优先删除这些中间层，并修改底层实现，使底层代码直接符合上层业务接口。

不要为了让上层继续使用旧写法而不断增加 `wrapper`、`adapter`、`converter`、`mapper`、`compat`、`legacy`、`bridge` 等代码。

核心原则：

> 如果上层接口是当前业务真实需要的接口，就应该让底层代码直接支持它，而不是额外写一层包装代码去兼容底层。

## 适用场景

当发现以下代码时，需要优先考虑清理：

- `xxxWrapper`
- `xxxAdapter`
- `xxxCompat`
- `legacyXxx`
- `normalizeXxx`
- `convertXxx`
- `mapXxxToYyy`
- `fromPrismaEnum`
- `toPrismaEnum`
- `transformOldDtoToNewDto`
- 只做参数转发的 service / helper
- 只改字段名、枚举名、路径名、类型名的中间函数
- 为了兼容旧接口保留的双字段、双枚举、双命名
- “展示值 ↔ 内部值”这类人为制造的转换层
- 为了不改底层而让上层绕一圈调用的包装层

## 核心原则

### 1. 不要新增无意义包装层

不要这样做：

```ts
function createUserCompat(input: NewCreateUserDto) {
  return oldCreateUser({
    user_name: input.username,
    user_status: input.status,
  });
}
```

应该改成：

```ts
function createUser(input: CreateUserDto) {
  // 底层直接使用当前业务需要的字段
}
```

### 2. 上层接口优先

如果上层已经确定使用：

```ts
{
  username: string;
  status: UserStatus;
}
```

底层不应该继续要求：

```ts
{
  user_name: string;
  user_status: OldUserStatus;
}
```

应该直接修改底层 service、repository、schema、DTO、type，让它们统一使用新的接口。

### 3. 不要保留“双轨制”接口

不要同时保留：

```ts
type UserStatus = "enabled" | "disabled";
type PrismaUserStatus = "ENABLE" | "DISABLE";

function toPrismaUserStatus(status: UserStatus): PrismaUserStatus {}
function fromPrismaUserStatus(status: PrismaUserStatus): UserStatus {}
```

如果业务接口已经决定使用 `"enabled" | "disabled"`，则应尽量让数据库 enum、Prisma schema、DTO、service、response 全部统一为这个语义。

除非存在明确的外部系统协议限制，否则不要引入转换层。

### 4. 修改底层，而不是让上层兼容底层

错误方向：

```ts
// 上层为了兼容底层，被迫转换
const result = await userService.createUser(toLegacyCreateUserDto(dto));
```

正确方向：

```ts
// 底层直接接收当前业务 DTO
const result = await userService.createUser(dto);
```

需要改的是 `userService.createUser` 的入参、内部实现、repository 调用，而不是让 controller 或上层业务代码承担兼容成本。

### 5. 删除历史兼容代码

如果旧接口已经没有真实调用方，应删除：

- 旧 DTO
- 旧 type
- 旧 enum
- 旧 service 方法
- 旧 helper
- 旧 adapter
- 旧 mapper
- 旧 compat 文件
- 旧测试快照
- 旧注释说明

不要保留“以后可能用得上”的兼容代码。

## 执行步骤

### 第一步：识别包装层

检查代码中是否存在以下模式：

```ts
function xxxWrapper(...) {
  return realFunction(...);
}
```

```ts
class XxxAdapter {
  constructor(private readonly service: XxxService) {}

  create(input) {
    return this.service.create(convert(input));
  }
}
```

```ts
function normalizeXxx(input) {
  return {
    id: input.id,
    name: input.name,
  };
}
```

如果该层只做以下事情，应视为可疑包装层：

- 字段改名
- enum 转换
- 参数顺序调整
- 类型浅转换
- 简单转发
- 同名方法代理
- try/catch 后重新抛出相同错误
- 没有真实业务规则的封装

### 第二步：判断是否真的需要

只有以下情况可以保留适配层：

1. 对接第三方 API，第三方接口不可控。
2. 对接外部老系统，协议不可控。
3. 数据库字段短期内无法迁移，且有明确迁移计划。
4. 跨边界通信，例如 HTTP、gRPC、消息队列，需要隔离外部协议。
5. 需要防腐层保护核心领域模型，且该层确实包含边界隔离职责。

否则应删除。

### 第三步：统一接口方向

确定当前项目真正应该使用的接口。

优先级如下：

1. 当前业务语义
2. 对外 API 契约
3. 当前 DTO / Schema
4. 当前 service 语义
5. repository / ORM / 数据库实现细节

不要让数据库、ORM、旧命名反过来污染上层业务接口。

### 第四步：改底层实现

如果发现上层为了兼容底层而转换数据，应修改底层。

例如：

```text
# before
controller -> adapter -> service -> repository
```

应该改为：

```text
# after
controller -> service -> repository
```

如果 repository 或 ORM 层字段不一致，应优先修改：

- Prisma schema
- 数据库 enum
- 数据库字段命名
- repository 入参
- service 内部类型
- DTO 类型
- response 类型

让数据模型从入口到出口尽量一致。

### 第五步：删除 wrapper 调用链

清理之后，应该让调用链更短。

例如：

```text
# before
createUserDto
  -> normalizeCreateUserDto()
  -> toPrismaCreateUserInput()
  -> userRepository.create()
```

改为：

```text
# after
createUserDto
  -> userRepository.create()
```

或者：

```text
# after
createUserDto
  -> userService.create()
  -> userRepository.create()
```

中间层只有在包含真实业务逻辑时才保留。

## 判断标准

一个函数或类如果满足以下任意条件，应优先删除或内联：

- 只调用另一个函数
- 只改字段名
- 只做 enum 映射
- 只做类型断言
- 只包一层 try/catch 但没有增加有价值的错误信息
- 只为了兼容旧命名
- 只为了避免修改底层代码
- 文件名中包含 `compat`、`legacy`、`adapter`、`wrapper`，但没有明确边界隔离职责

## 重构要求

重构时必须做到：

1. 优先修改底层接口，让底层直接符合上层业务接口。
2. 删除无意义 wrapper、adapter、converter。
3. 删除不再使用的类型、函数、文件。
4. 更新所有调用方，禁止留下双入口。
5. 更新测试，让测试覆盖新的直接调用链。
6. 保证类型检查通过。
7. 保证 lint 通过。
8. 保证构建通过。
9. 不要通过 `as any`、`unknown as`、临时类型断言绕过问题。
10. 不要新增新的兼容层来替代旧兼容层。

## 禁止行为

禁止做以下事情：

```ts
// 禁止：新增一层兼容函数
function newApiCompat(input) {
  return oldApi(convert(input));
}
```

```ts
// 禁止：保留旧接口，然后让新接口绕过去
function createUser(input: NewDto) {
  return createUserLegacy(toLegacyDto(input));
}
```

```ts
// 禁止：通过 any 逃避类型问题
return oldService.create(input as any);
```

```ts
// 禁止：同时暴露新旧两个方法
createUser();
createUserV2();
createUserCompat();
createUserLegacy();
```

除非用户明确要求保留旧接口，否则应统一为一个当前接口。

## 推荐做法

推荐这样处理：

```ts
// before
export function toInternalAppCode(app: "admin-api" | "app-api") {
  if (app === "admin-api") return "admin_api";
  if (app === "app-api") return "app_api";
  return app;
}
```

如果当前业务接口决定使用：

```ts
"admin-api" | "app-api"
```

那么应该让底层也直接使用：

```ts
"admin-api" | "app-api"
```

而不是保留：

```ts
"admin_api" | "app_api"
```

并在中间转换。

## 输出要求

每次执行清理时，请输出以下内容：

1. 删除了哪些 wrapper / adapter / compat / converter。
2. 修改了哪些底层接口。
3. 哪些调用方被更新为直接调用。
4. 是否还保留了适配层，如果保留，说明原因。
5. 是否通过类型检查、lint、测试或构建。
6. 如果没有运行检查，需要明确说明没有运行。

## 例外说明

不是所有 adapter 都应该删除。

如果 adapter 是真正的边界层，例如：

- 第三方支付 API adapter
- S3 / OSS storage adapter
- OpenAI / Anthropic model adapter
- gRPC client adapter
- 外部系统同步 adapter
- 数据库迁移期间的临时 adapter

可以保留。

但必须满足：

1. 它隔离的是外部不可控系统。
2. 它不是为了偷懒避免修改项目内部底层代码。
3. 它有明确命名和边界职责。
4. 它不污染核心业务模型。

## 最终目标

代码应该从：

```text
上层业务代码
  -> 兼容层
  -> 转换层
  -> 包装层
  -> 旧底层接口
```

变成：

```text
上层业务代码
  -> 当前底层接口
```

或者：

```text
Controller
  -> Service
  -> Repository
```

不要让历史包袱继续扩散。
