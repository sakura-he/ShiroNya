# Design Document: Account API Update

## Overview

本设计文档描述如何更新前端账户模块 API 代码以适配后端接口变更。主要涉及：
- 更新现有接口路径
- 新增密码重置三步流程接口
- 新增已登录用户修改密码接口
- 完善 TypeScript 类型定义

## 参考文档

- 后端 Swagger 接口文档：http://localhost:3000/api-docs#/%E8%B4%A6%E6%88%B7%E7%AE%A1%E7%90%86

## Architecture

账户 API 模块位于 `src/api/account.ts`，使用项目统一的 axios 请求封装（`src/api/index.ts`）。

```
src/api/
├── index.ts          # axios 实例和拦截器配置
├── account.ts        # 账户相关 API（本次更新目标）
└── ...
```

## Components and Interfaces

### API 函数接口

```typescript
// 登录
accountLoginByPasswordApi(data: LoginParams): Promise<HttpResponse>

// 获取账户信息（路径更新）
getAccountInfoApi(): Promise<HttpResponse>

// 获取用户菜单（路径更新）
getAccountMenuListApi(): Promise<HttpResponse>

// 密码重置三步流程
requestPasswordResetApi(data: RequestResetParams): Promise<HttpResponse>
verifyResetTokenApi(data: VerifyResetParams): Promise<HttpResponse>
resetPasswordApi(data: ResetPasswordParams): Promise<HttpResponse>

// 已登录用户修改密码
changePasswordApi(data: ChangePasswordParams): Promise<HttpResponse>
```

## Data Models

### Zod Schema 定义

使用 Zod 定义 DTO，提供运行时类型验证和 TypeScript 类型推导。

```typescript
import { z } from 'zod';

// 登录参数
export const LoginParamsSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});
export type LoginParams = z.infer<typeof LoginParamsSchema>;

// 请求密码重置参数
export const RequestResetParamsSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
});
export type RequestResetParams = z.infer<typeof RequestResetParamsSchema>;

// 验证重置 token 参数
export const VerifyResetParamsSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
});
export type VerifyResetParams = z.infer<typeof VerifyResetParamsSchema>;

// 重置密码参数
export const ResetPasswordParamsSchema = z.object({
  token: z.string().min(1, 'Token 不能为空'),
  new_password: z.string().min(6, '密码至少 6 个字符'),
  confirm_password: z.string().min(1, '确认密码不能为空'),
}).refine(data => data.new_password === data.confirm_password, {
  message: '两次输入的密码不一致',
  path: ['confirm_password'],
});
export type ResetPasswordParams = z.infer<typeof ResetPasswordParamsSchema>;

// 修改密码参数（已登录用户）
export const ChangePasswordParamsSchema = z.object({
  old_password: z.string().min(1, '原密码不能为空'),
  new_password: z.string().min(6, '新密码至少 6 个字符'),
  confirm_password: z.string().min(1, '确认密码不能为空'),
}).refine(data => data.new_password === data.confirm_password, {
  message: '两次输入的密码不一致',
  path: ['confirm_password'],
});
export type ChangePasswordParams = z.infer<typeof ChangePasswordParamsSchema>;
```

### Schema 文件结构

```
src/api/
├── index.ts              # axios 实例和拦截器配置
├── account.ts            # 账户相关 API 函数
└── schemas/
    └── account.schema.ts # 账户模块 Zod Schema 定义
```

### API 路径映射

| 函数名 | HTTP 方法 | 路径 |
|--------|-----------|------|
| accountLoginByPasswordApi | POST | /account/login |
| getAccountInfoApi | GET | /account/info |
| getAccountMenuListApi | GET | /account/menus |
| requestPasswordResetApi | POST | /account/request_reset |
| verifyResetTokenApi | POST | /account/verify_reset |
| resetPasswordApi | POST | /account/reset_password |
| changePasswordApi | POST | /account/change_password |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

由于本次更新主要是 API 路径和参数的静态配置变更，所有验收标准都是具体示例验证，不涉及需要属性测试的通用规则。

主要通过以下方式验证：
1. TypeScript 编译器类型检查
2. 代码审查确认路径和参数正确
3. 手动或集成测试验证接口调用

## Error Handling

API 错误处理由 `src/api/index.ts` 中的 axios 响应拦截器统一处理：
- 非 200 状态码显示错误消息
- 网络错误显示请求错误提示
- 所有错误通过 `Promise.reject` 传递给调用方

## Testing Strategy

### 验证方式

1. **Zod 运行时验证** - Schema 提供运行时参数验证和错误提示
2. **TypeScript 编译检查** - 通过 `z.infer` 推导类型，确保类型安全
3. **代码审查** - 确认 API 路径和参数与后端文档一致
4. **集成测试** - 在开发环境中测试各接口调用

### 测试用例

| 测试项 | 验证内容 |
|--------|----------|
| 登录接口 | 路径为 `/account/login`，方法为 POST |
| 获取账户信息 | 路径为 `/account/info`，方法为 GET |
| 获取用户菜单 | 路径为 `/account/menus`，方法为 GET |
| 请求密码重置 | 路径为 `/account/request_reset`，参数包含 email |
| 验证重置 token | 路径为 `/account/verify_reset`，参数包含 token |
| 重置密码 | 路径为 `/account/reset_password`，参数包含 token、new_password、confirm_password |
| 修改密码 | 路径为 `/account/change_password`，参数包含 old_password、new_password、confirm_password |

### Zod Schema 验证测试

| Schema | 验证规则 |
|--------|----------|
| LoginParamsSchema | username 和 password 非空 |
| RequestResetParamsSchema | email 格式有效 |
| VerifyResetParamsSchema | token 非空 |
| ResetPasswordParamsSchema | token 非空，密码至少 6 字符，两次密码一致 |
| ChangePasswordParamsSchema | 原密码非空，新密码至少 6 字符，两次密码一致 |
