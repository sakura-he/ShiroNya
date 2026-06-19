# Implementation Plan: CamelCase Field Migration

## Overview

将前端代码中的接口响应字段从蛇形命名（snake_case）迁移到驼峰命名（camelCase），以匹配后端 Prisma 模型的字段命名规范。

## Tasks

- [x] 1. 更新 App 用户模块
  - [x] 1.1 更新 src/api/appUser.ts 中的 schema 字段命名
    - 将 `is_delete` 改为 `isDelete`
    - 将 `created_at` 改为 `createdAt`
    - 将 `updated_at` 改为 `updatedAt`
    - _Requirements: 1.1_

  - [x] 1.2 更新 src/views/app/user/User.vue 中的表格列和数据引用
    - 将表格列 dataIndex `created_at` 改为 `createdAt`
    - 更新角色数据处理中的 `role_id` 为 `roleId`
    - _Requirements: 1.2, 1.3_

  - [x] 1.3 更新 src/views/app/user/config/userFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - _Requirements: 1.4_

- [x] 2. 更新 App 角色模块
  - [x] 2.1 更新 src/api/appRole.ts 中的 schema 字段命名
    - 将 `created_at` 改为 `createdAt`
    - 将 `updated_at` 改为 `updatedAt`
    - _Requirements: 2.1_

  - [x] 2.2 更新 src/views/app/role/Role.vue 中的表格列
    - 将表格列 dataIndex `created_at` 改为 `createdAt`
    - _Requirements: 2.2, 2.3_

  - [x] 2.3 更新 src/views/app/role/config/roleDetailFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - _Requirements: 2.2_

- [x] 3. 更新 App 菜单模块
  - [x] 3.1 更新 src/api/appMenu.ts 中的 schema 字段命名
    - 将 `created_at` 改为 `createdAt`
    - 将 `updated_at` 改为 `updatedAt`
    - _Requirements: 3.1_

  - [x] 3.2 更新 src/views/app/menu/config/menuFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - _Requirements: 3.2_

- [x] 4. 更新系统任务模块
  - [x] 4.1 更新 src/api/task.ts 中的接口字段命名
    - 将 `user_id` 改为 `userId`
    - 将 `task_id` 改为 `taskId`
    - _Requirements: 4.1_

  - [x] 4.2 更新 src/views/system/task/Task.vue 中的表格列
    - 将表格列 dataIndex `created_at` 改为 `createdAt`
    - 将表格列 dataIndex `updated_at` 改为 `updatedAt`
    - _Requirements: 4.2, 4.3_

  - [x] 4.3 更新 src/views/system/task/config/taskDetailFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - _Requirements: 4.2_

  - [x] 4.4 更新 src/views/system/task/config/taskTableSearchFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - _Requirements: 4.2_

- [x] 5. 更新系统用户模块
  - [x] 5.1 更新 src/api/user.ts 中的 schema 字段命名
    - 将 `is_lock` 改为 `isLock`
    - 将 `user_id` 改为 `userId`
    - _Requirements: 5.1_

  - [x] 5.2 更新 src/views/system/user/config/userFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - 将 `last_login` 字段改为 `lastLogin`
    - 将 `is_lock` 字段改为 `isLock`
    - _Requirements: 5.2, 5.3_

  - [x] 5.3 更新 src/views/system/user/config/userTableSearchFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - _Requirements: 5.2_

- [x] 6. 更新系统角色模块
  - [x] 6.1 更新 src/api/role.ts 中的 schema 字段命名
    - 将 `created_at` 改为 `createdAt`
    - 将 `updated_at` 改为 `updatedAt`
    - 将 `role_id` 改为 `roleId`
    - 将 `menu_ids` 改为 `menuIds`
    - _Requirements: 6.1_

  - [x] 6.2 更新 src/views/system/role/config/roleDetailFormConfig.ts 中的字段命名
    - 将 `created_at` 字段改为 `createdAt`
    - 将 `updated_at` 字段改为 `updatedAt`
    - _Requirements: 6.2, 6.3_

- [x] 7. Checkpoint - 验证修改
  - 运行 TypeScript 编译检查确保无类型错误
  - 确保所有修改完成，如有问题请告知

## Notes

- 本次迁移是静态代码重构，主要涉及字段命名规范变更
- 修改后需要确保 TypeScript 编译通过
- 建议修改完成后进行功能测试，确保数据正确绑定和显示
