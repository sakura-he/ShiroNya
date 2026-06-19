# Design Document: CamelCase Field Migration

## Overview

本设计文档描述了将前端代码中的接口响应字段从蛇形命名（snake_case）迁移到驼峰命名（camelCase）的技术方案。此迁移是为了与后端 Prisma 模型的字段命名保持一致，确保前后端数据绑定正确。

## Architecture

本次迁移涉及以下层次的代码修改：

```
┌─────────────────────────────────────────────────────────────┐
│                      前端应用层                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  API Layer  │  │ View Layer  │  │Config Layer │         │
│  │  (Schema)   │  │ (Component) │  │  (Form/Table)│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              字段命名规范 (camelCase)                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端 API                               │
│              (Prisma 模型 - camelCase)                      │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. API Layer 修改

需要修改的 API 文件及其字段映射：

#### src/api/appUser.ts
```typescript
// Before
export const AppUserSchema = z.object({
    is_delete: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
});

// After
export const AppUserSchema = z.object({
    isDelete: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
```

#### src/api/appRole.ts
```typescript
// Before
export const AppRoleSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
});

// After
export const AppRoleSchema = z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
});
```

#### src/api/appMenu.ts
```typescript
// Before
export const AppMenuSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
});

// After
export const AppMenuSchema = z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
});
```

#### src/api/user.ts
```typescript
// Before
export const UserDetailFormSchema = z.object({
    is_lock: z.boolean(),
});

// After
export const UserDetailFormSchema = z.object({
    isLock: z.boolean(),
});
```

#### src/api/role.ts
```typescript
// Before
export const DetailRoleSchema = z.object({
    created_at: z.string(),
    updated_at: z.string(),
});

// After
export const DetailRoleSchema = z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
});
```

#### src/api/task.ts
```typescript
// Before
export interface TaskForm {
    user_id?: number | undefined;
}

// After
export interface TaskForm {
    userId?: number | undefined;
}
```

### 2. View Layer 修改

需要修改的视图组件及其字段引用：

#### App 模块
- `src/views/app/user/User.vue` - 表格列 dataIndex、角色数据处理
- `src/views/app/role/Role.vue` - 表格列 dataIndex
- `src/views/app/menu/Menu.vue` - 无需修改（已使用正确命名）

#### System 模块
- `src/views/system/task/Task.vue` - 表格列 dataIndex
- `src/views/system/user/User.vue` - 表格列 dataIndex（如有）
- `src/views/system/role/Role.vue` - 表格列 dataIndex（如有）

### 3. Config Layer 修改

需要修改的配置文件：

#### App 用户配置
- `src/views/app/user/config/userFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`

#### App 角色配置
- `src/views/app/role/config/roleDetailFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`

#### App 菜单配置
- `src/views/app/menu/config/menuFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`

#### System 用户配置
- `src/views/system/user/config/userFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`
  - `last_login` → `lastLogin`
  - `is_lock` → `isLock`

- `src/views/system/user/config/userTableSearchFormConfig.ts`
  - `created_at` → `createdAt`

#### System 角色配置
- `src/views/system/role/config/roleDetailFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`

#### System 任务配置
- `src/views/system/task/config/taskDetailFormConfig.ts`
  - `created_at` → `createdAt`
  - `updated_at` → `updatedAt`

- `src/views/system/task/config/taskTableSearchFormConfig.ts`
  - `created_at` → `createdAt`

## Data Models

### 字段映射表

| 模块 | 蛇形命名 (Before) | 驼峰命名 (After) |
|------|------------------|------------------|
| 通用 | created_at | createdAt |
| 通用 | updated_at | updatedAt |
| 通用 | created_by | createdBy |
| 用户 | is_lock | isLock |
| 用户 | is_delete | isDelete |
| 用户 | last_login | lastLogin |
| 用户 | last_login_at | lastLoginAt |
| 用户 | last_login_ip | lastLoginIp |
| 用户 | user_id | userId |
| 用户 | role_id | roleId |
| 用户 | account_id | accountId |
| 用户 | password_salt | passwordSalt |
| 菜单 | component_name | componentName |
| 菜单 | component_path | componentPath |
| 菜单 | page_type | pageType |
| 菜单 | is_resident | isResident |
| 菜单 | is_cache | isCache |
| 菜单 | is_menu_visible | isMenuVisible |
| 菜单 | show_children | showChildren |
| 菜单 | is_tab_visible | isTabVisible |
| 任务 | task_id | taskId |
| 分页 | page_size | pageSize |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

由于本次迁移主要是静态代码重构（字段命名规范变更），不涉及运行时行为变化，因此没有可通过属性测试验证的正确性属性。

正确性验证将通过以下方式进行：
1. TypeScript 编译检查 - 确保类型定义正确
2. 应用运行测试 - 确保数据正确绑定和显示
3. 代码审查 - 确保所有字段命名一致

## Error Handling

### 潜在风险

1. **遗漏字段** - 可能存在未被发现的蛇形命名字段
   - 缓解措施：使用全局搜索确保覆盖所有相关文件

2. **类型不匹配** - 修改后可能导致 TypeScript 类型错误
   - 缓解措施：修改后运行 TypeScript 编译检查

3. **运行时错误** - 数据绑定失败导致页面显示异常
   - 缓解措施：修改后进行功能测试

## Testing Strategy

### 验证方法

1. **静态检查**
   - TypeScript 编译通过
   - ESLint 检查通过

2. **功能测试**
   - App 用户管理页面：列表显示、创建、编辑、详情功能正常
   - App 角色管理页面：列表显示、创建、编辑、详情功能正常
   - App 菜单管理页面：树形显示、创建、编辑、详情功能正常
   - 系统任务管理页面：列表显示、创建、编辑、详情功能正常
   - 系统用户管理页面：列表显示、创建、编辑、详情功能正常
   - 系统角色管理页面：列表显示、创建、编辑、详情功能正常

3. **回归测试**
   - 确保修改不影响其他功能模块
