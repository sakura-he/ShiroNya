# admin-web Codex Rules

本文件是 `apps/admin-web` 前端项目的 AI 协作规则。处理本目录内代码时，除仓库根目录 `.kiro/steering/project-overview.md` 外，还必须遵守以下约束。

## Arco Design Vue 使用约束

- 页面级卡片、表格外壳、关系面板、空状态外壳、图谱画布外壳等需要卡片视觉时，必须优先使用 Arco 原生 `<a-card>`。
- 禁止用 `div`、`section` 或自定义组件手写 card 效果，例如自行组合 `background: var(--color-bg-1)`、`border`、`border-radius`、`padding`、`box-shadow` 来模拟卡片。
- 禁止新增 `relation-block`、`surface`、`dict-surface`、`dict-empty`、`task-table-shell` 这类仅用于模拟 card 外观的样式类。
- 如果只是布局容器、表单栅格、代码块、图谱节点、VueFlow/G6 内部节点或领域专用可视化元素，可以保留自定义样式；不要为了套 `a-card` 破坏图布局、连线锚点或语义颜色。
- Arco Card 头部高度在 `src/styles/global.scss` 统一使用同尺寸 `min-height`。不要在页面里局部写死 `.arco-card-header` 高度。
- 所有 Arco Select 输入框都必须显式使用 `triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true }`，包括模板 `<a-select>`、`resolveComponent("a-select")`/`h(Select, ...)` 渲染函数、form-create 的 `type: "select"` 规则，以及已有 `createSelectRule` 返回的 `props`。
- 不要为了 Select 弹层宽度规则新增封装组件、公共 util、共享常量或全局抽象；在当前 Select 的 props 或已有规则函数返回值里直接内联写这两个配置。
- 动态 `<component :is="...">` 如果可能渲染为 `a-select`，必须在渲染 Select 的分支传入同样的 `triggerProps`；不要把该规则漏在动态控件里。

## form-create 表单约束

- 不要把 `@form-create/arco-design` 的 `$f.clearValidateState()` 当作中性“清校验状态”使用；它会把 Arco Form 字段写成 `success` 状态，导致空输入框出现绿色成功态边框。
- 需要清掉上一次校验状态时，在当前页面直接通过 `$f.formEl()` 拿到底层 Arco Form 实例调用 `clearValidate()`；不要为了这类问题新增公共封装工具、公共 util 或通用抽象层。
- form-create 表单项默认响应式列宽在 `src/main.ts` 的 `app.use(formCreate, { col: ... })` 插件级配置里统一维护；不要新增 `formCreateGrid`、`createResponsiveSearchCol`、共享 layout util，也不要在每个表单 `option` 里重复写同一套 `col` 断点。只有单个字段需要覆盖默认列宽时，才在该字段规则上直接写 `col: { span: 12 }` 或 `col: { span: 24 }`。
- 删除、软删除、禁用、重置密码等确认弹窗，每次点击操作都先重置对应表单数据、表单 API 值、校验状态、目标对象和操作模式；确认按钮里先复制当前 `targetId`，再 `await validate()` 和请求接口，避免连续操作读到上一次目标。
- form-create 自定义控件保持受控组件语义：只传 `modelValue` 与 `onUpdate:modelValue`，不要同时传会随输入变化的动态 `defaultValue`，避免输入后内部状态重置、光标跳动或失焦。
- 编辑弹窗如果表格行已经包含可编辑字段，直接用当前行快照填充表单并对比变更；不要为了打开编辑弹窗再次请求详情接口。详情抽屉、只读详情或缺字段场景才请求详情。
- 搜索表单尽量覆盖主要可筛选列，例如 ID、姓名、昵称、邮箱、手机号、状态、角色、验证状态、创建时间、更新时间等，并由 `GiTable :request` 走后端分页筛选。
- 排查 form-create 绿色空态或焦点异常时，先在当前页面直接搜索 `clearValidateState`、动态 `defaultValue`、弹窗 target/form reset 顺序，再做最小修复。

## 关系管理页面约束

- 角色、用户组、菜单等系统关系管理区域必须使用 `<a-card>` 承载。
- 关系表达式（例如 `role:5#assignee@user_group:<groupId>#active_member`）应放在 Card 的 `#title` 插槽内，并使用 Arco `<a-typography-text code>` 展示。
- 保存、授权、分配等操作按钮应放在 Card 的 `#extra` 插槽内。
- `GiTable` 顶部工具栏操作按钮应放在 `#custom-extra` 插槽内；不要把表格工具栏按钮写成普通表格内容或自行手写 toolbar。
- 不要在关系管理页面使用自定义组件或自定义样式去实现 Card header、hint、relationship tag 的卡片效果；优先使用 Arco 原生 Card、Space、Typography。
- 主列表下方不要默认添加展开行摘要来展示关系焦点、计数或关系路径。关系详情应通过操作列打开抽屉承载，除非用户明确要求展开行。
- 系统关系表的筛选和分页必须走后端分页接口，由 `GiTable :request` 请求当前页数据；不要在浏览器侧维护完整候选数组后自行处理筛选或页码。
- 关系抽屉保存前的草稿选择态通过 `draftUserIds`、`draftUserGroupIds`、`draftRoleIds` 等参数传给后端，由后端合成当前页的选中/禁用状态。

## 后台菜单同步约束

- 新增或修复后台前端菜单入口时，以当前数据库菜单树为准，不通过 seed 脚本、计划文档或静态路由猜测。
- 必须先从当前数据库读取最新 `rbac_menu` 数据，确认现有目录、排序、`pid`、`path`、`requiredPermissionCode`、`componentPath`、`isMenuVisible` 和 `status`。
- 在最新数据库菜单结构基础上补充目标菜单和对应权限记录，再重建 RBAC effective 可见菜单读模型，并刷新菜单/用户状态版本。
- 静态隐藏路由只服务直达访问；要让登录后的侧边栏显示页面，必须写入 `rbac_menu` 并让当前用户拥有该菜单 `requiredPermissionCode`。

## 抽屉加载顺序

- 点击“编辑关系”“查看关系”等需要远程加载数据的抽屉时，必须先打开抽屉，再请求数据。
- 推荐顺序：清空上一次关系数据或设置当前 ID -> `drawerVisible = true` -> `await loadRelations(...)`。
- 不要先 `await loadRelations(...)` 再打开抽屉；网络慢时会造成点击无反馈，也可能让用户误以为操作失败。
- 打开新关系抽屉前应避免显示上一个对象的数据；可以先将当前关系对象置为 `null`，让抽屉内已有的 loading/empty 状态接管。

## 修改后的检查

- 修改系统页面卡片或关系管理 UI 后，至少运行：
    - `pnpm --filter ./apps/admin-web exec prettier --write <changed files>`
    - `pnpm --filter ./apps/admin-web exec vue-tsc --noEmit`
- 如果改动涉及图谱组件、全局样式或多个页面结构，继续运行：
    - `pnpm --filter ./apps/admin-web build`
- 提交前用 `rg` 扫描 `apps/admin-web/src/views/system`，确认没有重新引入 `relation-block`、`SpiceDBRelationshipTag` 页面用法、手写 card 外壳类或表格关系展开摘要。
