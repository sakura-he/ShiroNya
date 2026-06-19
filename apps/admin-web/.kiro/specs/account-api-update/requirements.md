# Requirements Document

## Introduction

更新前端账户模块 API 代码以适配后端 Swagger 文档的接口变更。主要包括路径简化、移除不安全接口、新增密码重置三步流程相关接口。

## Glossary

- **Account_API**: 账户模块的 API 请求函数集合
- **Password_Reset_Flow**: 密码重置三步流程（请求重置 → 验证 token → 设置新密码）
- **Request_Function**: 封装 HTTP 请求的 TypeScript 函数

## Requirements

### Requirement 1: 更新现有接口路径

**User Story:** As a 前端开发者, I want 账户 API 路径与后端保持一致, so that 前端能正确调用后端接口

#### Acceptance Criteria

1. THE Account_API SHALL 将 `/account/get_account_info` 路径更新为 `/account/info`
2. THE Account_API SHALL 将 `/account/get_user_menus` 路径更新为 `/account/menus`
3. THE Account_API SHALL 保持 `/account/login` 接口不变

### Requirement 2: 移除不安全接口

**User Story:** As a 系统管理员, I want 移除不安全的密码重置 GET 接口, so that 系统安全性得到保障

#### Acceptance Criteria

1. THE Account_API SHALL 移除 `/account/reset_password` 的 GET 方法请求函数（如存在）

### Requirement 3: 新增密码重置三步流程接口

**User Story:** As a 用户, I want 通过安全的三步流程重置密码, so that 我的账户安全得到保护

#### Acceptance Criteria

1. THE Account_API SHALL 提供 `requestPasswordReset` 函数调用 POST `/account/request_reset`，参数为 `{ email: string }`
2. THE Account_API SHALL 提供 `verifyResetToken` 函数调用 POST `/account/verify_reset`，参数为 `{ token: string }`
3. THE Account_API SHALL 提供 `resetPassword` 函数调用 POST `/account/reset_password`，参数为 `{ token: string, new_password: string, confirm_password: string }`

### Requirement 4: 新增已登录用户修改密码接口

**User Story:** As a 已登录用户, I want 修改我的密码, so that 我可以定期更新密码保护账户安全

#### Acceptance Criteria

1. THE Account_API SHALL 提供 `changePassword` 函数调用 POST `/account/change_password`，参数为 `{ old_password: string, new_password: string, confirm_password: string }`

### Requirement 5: 更新 TypeScript 类型定义

**User Story:** As a 前端开发者, I want 完整的 TypeScript 类型定义, so that 代码具有类型安全性

#### Acceptance Criteria

1. THE Account_API SHALL 定义 `LoginParams` 类型包含 `username` 和 `password` 字段
2. THE Account_API SHALL 定义 `RequestResetParams` 类型包含 `email` 字段
3. THE Account_API SHALL 定义 `VerifyResetParams` 类型包含 `token` 字段
4. THE Account_API SHALL 定义 `ResetPasswordParams` 类型包含 `token`、`new_password`、`confirm_password` 字段
5. THE Account_API SHALL 定义 `ChangePasswordParams` 类型包含 `old_password`、`new_password`、`confirm_password` 字段
