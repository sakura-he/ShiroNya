# Common 模块关系图

## 1. 建模说明

`CommonModule` 本身不提供 service，只聚合 `UploadModule`，并用 `RouterModule` 为上传能力挂载 `/common` 路由前缀。字典能力已经归入 `system/dicts`，由 `AppModule` 直接导入。

## 2. 模块分层结论

- `UploadModule` 走 `/common/*`
- `SystemDictsModule` 负责 `/dict/*`
- `CommonModule` 只是通用基础设施装配壳

```mermaid
classDiagram
    class CommonModule
    class SystemDictsModule
    class UploadModule

    CommonModule --> UploadModule
    AppModule --> SystemDictsModule
```

```mermaid
flowchart LR
    App["admin-api AppModule"]
    Common["CommonModule"]
    Dict["/dict/*"]
    Upload["/common/*"]

    App --> Common
    App --> Dict
    Common --> Upload
```

```mermaid
sequenceDiagram
    participant App as AppModule
    participant Common as CommonModule
    participant Dict as SystemDictsModule
    participant Upload as UploadModule

    App->>Common: import
    App->>Dict: import
    Common->>Upload: RouterModule.register(path=common)
```
