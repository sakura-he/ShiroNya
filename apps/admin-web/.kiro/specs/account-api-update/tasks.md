# Implementation Plan: Account API Update

## Overview

更新前端账户模块 API 代码，包括安装 Zod 依赖、创建 Schema 定义、更新 API 函数路径和参数。

## Tasks

- [x] 1. 安装 Zod 依赖
  - 执行 `pnpm add zod` 安装 Zod 库
  - _Requirements: 5.1-5.5_

- [x] 2. 创建账户模块 Zod Schema
  - [x] 2.1 创建 `src/api/schemas/account.schema.ts` 文件
    - 定义 LoginParamsSchema
    - 定义 RequestResetParamsSchema
    - 定义 VerifyResetParamsSchema
    - 定义 ResetPasswordParamsSchema（包含密码一致性验证）
    - 定义 ChangePasswordParamsSchema（包含密码一致性验证）
    - 导出所有 Schema 和推导的类型
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. 更新账户 API 函数
  - [x] 3.1 更新 `src/api/account.ts` 中的现有接口
    - 将 `getAccountInfoApi` 路径从 `/account/get_account_info` 改为 `/account/info`
    - 将 `getAccountMenuListApi` 路径从 `/account/get_user_menus` 改为 `/account/menus`
    - 更新 `accountLoginByPasswordApi` 使用 LoginParams 类型
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 新增密码重置三步流程 API 函数
    - 添加 `requestPasswordResetApi` 函数
    - 添加 `verifyResetTokenApi` 函数
    - 添加 `resetPasswordApi` 函数
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.3 新增已登录用户修改密码 API 函数
    - 添加 `changePasswordApi` 函数
    - _Requirements: 4.1_
  - [x] 3.4 清理无用代码
    - 移除 `createMenu` 函数（不属于账户模块）
    - 移除 `getSystemDemoTable` 函数（不属于账户模块）
    - _Requirements: 2.1_

- [x] 4. Checkpoint - 验证 TypeScript 编译
  - 确保所有类型定义正确，无编译错误
  - 确保所有 API 函数签名符合设计文档

## Notes

- 使用 Zod 提供运行时参数验证
- 通过 `z.infer` 从 Schema 推导 TypeScript 类型
- API 函数命名遵循项目现有风格（以 Api 结尾）
