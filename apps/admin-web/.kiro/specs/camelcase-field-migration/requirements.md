# Requirements Document

## Introduction

本功能用于将前端代码中使用的接口响应字段从蛇形命名（snake_case）同步更新为驼峰命名（camelCase），以匹配后端 Prisma 模型的字段命名规范。后端已完成字段命名更新，接口返回的字段现在都是驼峰命名，前端需要同步更新以确保数据正确绑定。

## Glossary

- **Frontend_Code**: 前端 Vue/TypeScript 代码，包括 API 定义、视图组件、表单配置等
- **API_Schema**: API 层的 Zod schema 定义和类型声明
- **View_Component**: Vue 视图组件中使用接口响应数据的地方
- **Form_Config**: 表单配置文件中的字段定义
- **Table_Column**: 表格列配置中的 dataIndex 字段

## Requirements

### Requirement 1: 更新 App 用户模块字段命名

**User Story:** As a developer, I want the App user module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API schema defines user fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`, `isDelete`)
2. WHEN the view component displays user data, THE View_Component SHALL reference camelCase field names
3. WHEN the table column config defines dataIndex, THE Table_Column SHALL use camelCase naming
4. WHEN the form config defines field bindings, THE Form_Config SHALL use camelCase naming

### Requirement 2: 更新 App 角色模块字段命名

**User Story:** As a developer, I want the App role module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API schema defines role fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`)
2. WHEN the view component displays role data, THE View_Component SHALL reference camelCase field names
3. WHEN the table column config defines dataIndex, THE Table_Column SHALL use camelCase naming

### Requirement 3: 更新 App 菜单模块字段命名

**User Story:** As a developer, I want the App menu module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API schema defines menu fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`)
2. WHEN the view component displays menu data, THE View_Component SHALL reference camelCase field names

### Requirement 4: 更新系统任务模块字段命名

**User Story:** As a developer, I want the system task module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API defines task fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`, `userId`)
2. WHEN the view component displays task data, THE View_Component SHALL reference camelCase field names
3. WHEN the table column config defines dataIndex, THE Table_Column SHALL use camelCase naming

### Requirement 5: 更新系统用户模块字段命名

**User Story:** As a developer, I want the system user module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API schema defines user fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`, `isLock`, `lastLogin`, `createdBy`)
2. WHEN the view component displays user data, THE View_Component SHALL reference camelCase field names
3. WHEN the form config defines field bindings, THE Form_Config SHALL use camelCase naming

### Requirement 6: 更新系统角色模块字段命名

**User Story:** As a developer, I want the system role module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the API schema defines role fields, THE API_Schema SHALL use camelCase naming (e.g., `createdAt`, `updatedAt`, `createdBy`)
2. WHEN the view component displays role data, THE View_Component SHALL reference camelCase field names
3. WHEN the table column config defines dataIndex, THE Table_Column SHALL use camelCase naming

### Requirement 7: 更新系统菜单模块字段命名

**User Story:** As a developer, I want the system menu module field names to match the backend API response, so that data binding works correctly.

#### Acceptance Criteria

1. WHEN the view component displays menu data, THE View_Component SHALL reference camelCase field names (e.g., `componentName`, `componentPath`, `pageType`, `isResident`, `isCache`, `isMenuVisible`, `showChildren`, `isTabVisible`, `createdAt`, `updatedAt`)

### Requirement 8: 更新 API 请求参数命名

**User Story:** As a developer, I want the API request parameters to use camelCase naming, so that they match the backend expectations.

#### Acceptance Criteria

1. WHEN sending pagination parameters, THE Frontend_Code SHALL use camelCase naming (e.g., `pageSize` instead of `page_size`)
2. WHEN sending filter parameters, THE Frontend_Code SHALL use camelCase naming where applicable

## Field Mapping Reference

Based on Prisma models, the following fields need to be updated:

### Common Fields (across all models)
| Snake Case | Camel Case |
|------------|------------|
| created_at | createdAt |
| updated_at | updatedAt |
| created_by | createdBy |

### User-specific Fields
| Snake Case | Camel Case |
|------------|------------|
| is_lock | isLock |
| is_delete | isDelete |
| last_login | lastLogin |
| last_login_at | lastLoginAt |
| last_login_ip | lastLoginIp |
| user_id | userId |
| role_id | roleId |
| account_id | accountId |
| password_salt | passwordSalt |

### Menu-specific Fields
| Snake Case | Camel Case |
|------------|------------|
| component_name | componentName |
| component_path | componentPath |
| page_type | pageType |
| is_resident | isResident |
| is_cache | isCache |
| is_menu_visible | isMenuVisible |
| show_children | showChildren |
| is_tab_visible | isTabVisible |

### Task-specific Fields
| Snake Case | Camel Case |
|------------|------------|
| task_id | taskId |

### Pagination Parameters
| Snake Case | Camel Case |
|------------|------------|
| page_size | pageSize |
