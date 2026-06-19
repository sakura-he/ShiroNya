# Requirements Document

## Introduction

本文档定义了 App 用户管理模块的需求规范。该模块是后台管理系统的一部分，用于管理 App 端的用户、角色和菜单权限。模块包含三个主要页面：App 用户管理、App 角色管理和 App 菜单管理。

**API 路径说明**: 项目的 axios 实例默认 baseURL 已包含 `/admin` 前缀，因此 API 函数中只需使用 `/app/user`、`/app/role`、`/app/menu` 等路径，实际请求会自动拼接为 `/admin/app/user` 等完整路径。

## Glossary

- **App_User_Module**: App 用户管理模块，包含用户、角色、菜单三个子模块
- **App_User**: App 端用户实体，包含用户名、邮箱、手机号、昵称、头像、状态等属性
- **App_Role**: App 端角色实体，包含角色名称、角色代码、描述、状态等属性
- **App_Menu**: App 端菜单实体，包含标题、权限标识、类型、路径、图标、排序、状态等属性
- **NaTable**: 项目中封装的表格组件，支持分页、搜索、过滤等功能
- **NaForm**: 项目中封装的表单组件，支持多种输入类型和验证
- **User_Status**: 用户状态枚举，1=启用，0=禁用
- **Role_Status**: 角色状态枚举，ENABLE=启用，DISABLE=禁用
- **Menu_Type**: 菜单类型枚举，Catalog=目录，Page=页面，Button=按钮

## Requirements

### Requirement 1: App 用户列表展示

**User Story:** As a 系统管理员, I want to 查看 App 用户列表, so that I can 了解和管理所有 App 端用户。

#### Acceptance Criteria

1. WHEN 管理员访问 App 用户管理页面 THEN App_User_Module SHALL 显示用户列表表格，包含 id、username、email、phone、nickname、avatar、status、created_at 字段和操作列
2. WHEN 用户列表数据加载时 THEN App_User_Module SHALL 调用 GET /app/user/list 接口获取分页数据
3. WHEN 管理员输入搜索条件（username、email、phone、status）并提交 THEN App_User_Module SHALL 根据条件过滤用户列表
4. WHEN 管理员点击分页控件 THEN App_User_Module SHALL 加载对应页码的用户数据

### Requirement 2: App 用户增删改操作

**User Story:** As a 系统管理员, I want to 创建、编辑和删除 App 用户, so that I can 维护 App 端用户数据。

#### Acceptance Criteria

1. WHEN 管理员点击"创建新用户"按钮 THEN App_User_Module SHALL 显示用户创建表单弹窗，包含 username、password、email、phone、nickname、avatar、status、roles 字段
2. WHEN 管理员填写用户信息并提交创建表单 THEN App_User_Module SHALL 调用 POST /app/user/create 接口创建用户
3. WHEN 管理员点击用户行的"编辑"按钮 THEN App_User_Module SHALL 显示用户编辑表单弹窗，预填充当前用户数据
4. WHEN 管理员修改用户信息并提交编辑表单 THEN App_User_Module SHALL 调用 POST /app/user/update 接口更新用户
5. WHEN 管理员点击用户行的"删除"按钮并确认 THEN App_User_Module SHALL 调用 POST /app/user/delete 接口软删除用户
6. IF 用户创建或更新操作失败 THEN App_User_Module SHALL 显示错误提示信息

### Requirement 3: App 用户状态和密码管理

**User Story:** As a 系统管理员, I want to 管理用户状态和重置密码, so that I can 控制用户访问权限和帮助用户恢复账户。

#### Acceptance Criteria

1. WHEN 管理员点击用户行的"启用/禁用"操作 THEN App_User_Module SHALL 调用 POST /app/user/update-status 接口切换用户状态
2. WHEN 管理员点击用户行的"重置密码"按钮 THEN App_User_Module SHALL 显示密码重置弹窗
3. WHEN 管理员输入新密码并确认 THEN App_User_Module SHALL 调用 POST /app/user/reset-password 接口重置用户密码

### Requirement 4: App 用户角色分配

**User Story:** As a 系统管理员, I want to 为用户分配角色, so that I can 控制用户的权限范围。

#### Acceptance Criteria

1. WHEN 管理员在用户表单中选择角色 THEN App_User_Module SHALL 调用 GET /app/role/all 接口获取所有可用角色列表
2. WHEN 管理员保存用户信息时包含角色选择 THEN App_User_Module SHALL 将角色 ID 数组包含在创建/更新请求中

### Requirement 5: App 角色列表展示

**User Story:** As a 系统管理员, I want to 查看 App 角色列表, so that I can 了解和管理所有 App 端角色。

#### Acceptance Criteria

1. WHEN 管理员访问 App 角色管理页面 THEN App_User_Module SHALL 显示角色列表表格，包含 id、name、code、description、status、created_at 字段和操作列
2. WHEN 角色列表数据加载时 THEN App_User_Module SHALL 调用 GET /app/role/list 接口获取分页数据
3. WHEN 管理员输入搜索条件（name、code、status）并提交 THEN App_User_Module SHALL 根据条件过滤角色列表

### Requirement 6: App 角色增删改操作

**User Story:** As a 系统管理员, I want to 创建、编辑和删除 App 角色, so that I can 维护 App 端角色数据。

#### Acceptance Criteria

1. WHEN 管理员点击"创建新角色"按钮 THEN App_User_Module SHALL 显示角色创建表单弹窗，包含 name、code、description、status 字段
2. WHEN 管理员填写角色信息并提交创建表单 THEN App_User_Module SHALL 调用 POST /app/role/create 接口创建角色
3. WHEN 管理员点击角色行的"编辑"按钮 THEN App_User_Module SHALL 显示角色编辑表单弹窗，预填充当前角色数据
4. WHEN 管理员修改角色信息并提交编辑表单 THEN App_User_Module SHALL 调用 POST /app/role/update 接口更新角色
5. WHEN 管理员点击角色行的"删除"按钮并确认 THEN App_User_Module SHALL 调用 POST /app/role/delete 接口删除角色

### Requirement 7: App 角色菜单权限分配

**User Story:** As a 系统管理员, I want to 为角色分配菜单权限, so that I can 控制角色可访问的功能范围。

#### Acceptance Criteria

1. WHEN 管理员编辑角色时 THEN App_User_Module SHALL 显示菜单权限树，调用 GET /app/menu/tree 获取菜单树数据
2. WHEN 管理员查看角色详情时 THEN App_User_Module SHALL 调用 GET /app/role/menus?roleId=xxx 获取角色已分配的菜单 ID 列表
3. WHEN 管理员选择菜单权限并保存角色 THEN App_User_Module SHALL 调用 POST /app/role/assign-menus 接口分配菜单权限

### Requirement 8: App 菜单树形列表展示

**User Story:** As a 系统管理员, I want to 查看 App 菜单树形列表, so that I can 了解和管理 App 端菜单结构。

#### Acceptance Criteria

1. WHEN 管理员访问 App 菜单管理页面 THEN App_User_Module SHALL 显示左侧菜单树和右侧菜单详情区域
2. WHEN 菜单数据加载时 THEN App_User_Module SHALL 调用 GET /app/menu/tree 接口获取菜单树数据
3. WHEN 管理员点击菜单树节点 THEN App_User_Module SHALL 在右侧显示该菜单的详细信息

### Requirement 9: App 菜单增删改操作

**User Story:** As a 系统管理员, I want to 创建、编辑和删除 App 菜单, so that I can 维护 App 端菜单结构。

#### Acceptance Criteria

1. WHEN 管理员点击"新增根菜单"按钮 THEN App_User_Module SHALL 显示菜单创建表单，pid 为空
2. WHEN 管理员选中菜单节点后点击"增加菜单"按钮 THEN App_User_Module SHALL 显示菜单创建表单，pid 为当前选中菜单的 id
3. WHEN 管理员填写菜单信息（title、permission、type、path、icon、order、status）并提交 THEN App_User_Module SHALL 调用 POST /app/menu/create 接口创建菜单
4. WHEN 管理员点击"编辑"按钮并修改菜单信息 THEN App_User_Module SHALL 调用 POST /app/menu/update 接口更新菜单
5. WHEN 管理员点击"删除"按钮并确认 THEN App_User_Module SHALL 调用 POST /app/menu/delete 接口删除菜单（级联删除子菜单）

### Requirement 10: 页面样式和组件复用

**User Story:** As a 开发者, I want to 复用现有的 UI 组件和样式, so that I can 保持系统界面一致性。

#### Acceptance Criteria

1. THE App_User_Module SHALL 使用项目现有的 NaTable 组件展示列表数据
2. THE App_User_Module SHALL 使用项目现有的 NaForm 组件构建表单
3. THE App_User_Module SHALL 使用项目现有的 NaPageHeader 组件展示页面标题
4. THE App_User_Module SHALL 遵循现有 system 模块的代码结构和命名规范
5. THE App_User_Module SHALL 使用 Arco Design Vue 组件库的 Modal、Message、Popconfirm 等组件
