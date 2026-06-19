# Implementation Plan: App User Management Module

## Overview

本实现计划将 App 用户管理模块分解为可执行的编码任务。按照 API 层 → 配置层 → 视图层的顺序实现，确保每个任务都能独立完成并可验证。

## Tasks

- [x] 1. 创建 App 用户 API 模块
  - [x] 1.1 创建 `src/api/appUser.ts` 文件，定义用户相关类型和 API 函数
    - 定义 AppUserStatus 枚举、AppUser 类型、CreateAppUserDto、UpdateAppUserDto
    - 实现 getAppUserList、getAppUser、createAppUser、updateAppUser、deleteAppUser 函数
    - 实现 resetAppUserPassword、updateAppUserStatus、getAppUserRoles 函数
    - API 路径使用 `/app/user` 前缀（axios baseURL 已包含 /admin）
    - _Requirements: 1.2, 2.2, 2.4, 2.5, 3.1, 3.3, 4.1_

- [x] 2. 创建 App 角色 API 模块
  - [x] 2.1 创建 `src/api/appRole.ts` 文件，定义角色相关类型和 API 函数
    - 定义 AppRoleStatus 枚举、AppRole 类型、CreateAppRoleDto、UpdateAppRoleDto
    - 实现 getAppRoleList、getAllAppRoles、getAppRole、createAppRole、updateAppRole、deleteAppRole 函数
    - 实现 assignAppRoleMenus、getAppRoleMenus 函数
    - API 路径使用 `/app/role` 前缀
    - _Requirements: 5.2, 6.2, 6.4, 6.5, 7.2, 7.3_

- [x] 3. 创建 App 菜单 API 模块
  - [x] 3.1 创建 `src/api/appMenu.ts` 文件，定义菜单相关类型和 API 函数
    - 定义 AppMenuType、AppMenuStatus 枚举、AppMenu 类型、AppMenuTreeNode 接口
    - 定义 CreateAppMenuDto、UpdateAppMenuDto 类型
    - 实现 getAppMenuTree、getAppMenuList、getAppMenu、createAppMenu、updateAppMenu、deleteAppMenu 函数
    - API 路径使用 `/app/menu` 前缀
    - _Requirements: 8.2, 9.3, 9.4, 9.5_

- [x] 4. Checkpoint - 确保 API 模块编译通过
  - 确保所有 API 文件无 TypeScript 错误，如有问题请询问用户

- [x] 5. 创建 App 用户页面配置文件
  - [x] 5.1 创建 `src/views/app/user/config/userFormConfig.ts`
    - 参考 `src/views/system/user/config/userFormConfig.ts` 的结构
    - 定义用户表单字段：username、password、email、phone、nickname、avatar、status、roles
    - 导出 UserFormInputItemsUserAdd、UserFormInputItemsUserEdit、UserFormInputItemsUserDetail
    - 导出表单布局配置：UserFormLabelProps、UserFormColProps、UserFormProps、UserFormRowProps、UserFormBtnColProps
    - _Requirements: 2.1, 2.3_
  - [x] 5.2 创建 `src/views/app/user/config/userTableSearchFormConfig.ts`
    - 定义搜索表单字段：username、email、phone、status
    - 导出 SearchInputItems、SearchFormColProps、SearchFormLabelProps、SearchFormProps、SearchFormBtnColProps
    - _Requirements: 1.3_

- [x] 6. 创建 App 角色页面配置文件
  - [x] 6.1 创建 `src/views/app/role/config/roleDetailFormConfig.ts`
    - 参考 `src/views/system/role/config/roleDetailFormConfig.ts` 的结构
    - 定义角色表单字段：name、code、description、status
    - 导出 RoleFormAddInputItems、RoleFormEditInputItems、RoleFormDetailInputItems
    - 导出表单布局配置
    - _Requirements: 6.1, 6.3_
  - [x] 6.2 创建 `src/views/app/role/config/roleTableSearchFormConfig.ts`
    - 定义搜索表单字段：name、code、status
    - 导出搜索表单配置
    - _Requirements: 5.3_

- [x] 7. 创建 App 菜单页面配置文件
  - [x] 7.1 创建 `src/views/app/menu/config/menuFormConfig.ts`
    - 参考 `src/views/system/menu/config/menuForm.ts` 的结构
    - 定义菜单表单字段：title、permission、type、path、icon、order、status、pid
    - 根据菜单类型（Catalog/Page/Button）和操作状态（Add/Edit/Detail）导出不同的表单配置
    - 导出表单布局配置
    - _Requirements: 9.1, 9.2_

- [x] 8. Checkpoint - 确保配置文件编译通过
  - 确保所有配置文件无 TypeScript 错误，如有问题请询问用户

- [x] 9. 创建 App 用户管理页面
  - [x] 9.1 创建 `src/views/app/user/User.vue` 页面组件
    - 使用 NaPageHeader 显示页面标题"App 用户管理"
    - 使用 NaTable 组件展示用户列表，配置列：id、username、email、phone、nickname、avatar、status、created_at、操作
    - 实现搜索过滤表单（username、email、phone、status）
    - 实现工具栏按钮：创建新用户
    - 实现操作列：修改、详情、重置密码、删除
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 9.2 实现用户创建/编辑/详情弹窗功能
    - 使用 a-modal 和 NaForm 组件
    - 实现创建用户功能，调用 createAppUser API
    - 实现编辑用户功能，调用 updateAppUser API
    - 实现查看用户详情功能
    - 加载角色列表供用户选择
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_
  - [x] 9.3 实现用户删除和状态管理功能
    - 实现删除用户功能，使用 Popconfirm 确认后调用 deleteAppUser API
    - 实现重置密码弹窗功能，调用 resetAppUserPassword API
    - _Requirements: 2.5, 2.6, 3.1, 3.2, 3.3_

- [x] 10. 创建 App 角色管理页面
  - [x] 10.1 创建 `src/views/app/role/Role.vue` 页面组件
    - 使用 NaPageHeader 显示页面标题"App 角色管理"
    - 使用 NaTable 组件展示角色列表，配置列：id、name、code、description、status、created_at、操作
    - 实现搜索过滤表单（name、code、status）
    - 实现工具栏按钮：创建新角色
    - 实现操作列：详情、编辑、删除
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 10.2 实现角色创建/编辑/详情弹窗功能
    - 使用 a-modal 和 NaForm 组件
    - 实现创建角色功能，调用 createAppRole API
    - 实现编辑角色功能，调用 updateAppRole API
    - 实现查看角色详情功能
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 10.3 实现角色菜单权限分配功能
    - 在弹窗中显示菜单权限树（使用 a-tree 组件）
    - 加载菜单树数据，调用 getAppMenuTree API
    - 加载角色已分配菜单，调用 getAppRoleMenus API
    - 保存时调用 assignAppRoleMenus API 分配菜单权限
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 10.4 实现角色删除功能
    - 使用 Popconfirm 确认后调用 deleteAppRole API
    - _Requirements: 6.5_

- [x] 11. 创建 App 菜单管理页面
  - [x] 11.1 创建 `src/views/app/menu/Menu.vue` 页面组件
    - 使用 NaPageHeader 显示页面标题"App 菜单管理"
    - 左侧区域：使用 a-tree 组件显示菜单树
    - 右侧区域：显示菜单详情/编辑表单
    - 加载菜单树数据，调用 getAppMenuTree API
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 11.2 实现菜单创建功能
    - 实现"新增根菜单"按钮，pid 设为 null
    - 实现"增加子菜单"按钮，pid 设为当前选中菜单的 id
    - 使用 NaForm 组件显示菜单表单
    - 根据菜单类型动态切换表单项
    - 调用 createAppMenu API 创建菜单
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 11.3 实现菜单编辑和删除功能
    - 实现编辑菜单功能，调用 updateAppMenu API
    - 实现删除菜单功能，使用 Popconfirm 确认后调用 deleteAppMenu API
    - _Requirements: 9.4, 9.5_

- [ ] 12. Final Checkpoint - 确保所有页面编译通过并可正常渲染
  - 确保所有 Vue 组件无编译错误
  - 验证页面可以正常渲染
  - 如有问题请询问用户

## Notes

- 任务按照依赖顺序排列：API 层 → 配置层 → 视图层
- 每个 Checkpoint 用于验证阶段性成果
- 所有页面参考 `src/views/system/` 目录下的现有实现
- API 路径使用 `/app/` 前缀，axios baseURL 已包含 `/admin`
