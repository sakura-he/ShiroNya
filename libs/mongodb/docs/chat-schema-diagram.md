# Chat Schema 关系图

本文档描述了聊天系统的 MongoDB 数据模型，用于存储 AI 角色扮演对话。

## 概述

聊天系统由三个主要集合组成：
- **Character**: 存储 AI 角色卡的完整设定
- **ChatSession**: 存储会话级别的配置和元数据
- **ChatMessage**: 存储具体的对话消息

同时与 PostgreSQL 的用户系统关联。

## 实体关系图

```mermaid
erDiagram
    AppAccount ||--o{ Character : "创建"
    AppAccount ||--o{ ChatSession : "拥有"
    Character ||--o{ ChatSession : "使用"
    ChatSession ||--o{ ChatMessage : "包含"
    
    AppAccount {
        string id PK "PostgreSQL 用户ID"
        string username "用户名"
        string email "邮箱"
    }
    
    Character {
        ObjectId _id PK "主键"
        string name "角色名称"
        string description "角色描述"
        string personality "人格设定"
        string scenario "场景设定"
        string first_mes "开场白"
        string user_id FK "创建者ID"
        boolean is_public "是否公开"
        CharacterData data "完整数据"
    }
    
    ChatSession {
        ObjectId _id PK "主键"
        string user_id FK "用户ID"
        ObjectId character_id FK "角色卡ID"
        string user_name "用户名快照"
        string character_name "角色名快照"
        ChatMetadata chat_metadata "会话元数据"
    }
    
    ChatMessage {
        ObjectId _id PK "主键"
        ObjectId session_id FK "所属会话"
        string name "发送者名称"
        boolean is_user "是否用户消息"
        string mes "消息内容"
        MessageExtra extra "扩展信息"
        array swipes "候选回复"
    }
```

## 跨数据库关系图

```mermaid
flowchart TB
    subgraph PostgreSQL
        PG_User[AppAccount<br/>用户账户]
    end
    
    subgraph MongoDB
        MG_Char[Character<br/>角色卡]
        MG_Session[ChatSession<br/>聊天会话]
        MG_Message[ChatMessage<br/>聊天消息]
    end
    
    PG_User -->|user_id| MG_Char
    PG_User -->|user_id| MG_Session
    MG_Char -->|character_id| MG_Session
    MG_Session -->|session_id| MG_Message
```

## 类图 - 嵌入文档结构

```mermaid
classDiagram
    class Character {
        角色卡主文档
        collection: characters
        --
        +ObjectId _id
        +string spec 规范类型
        +string spec_version 规范版本
        +string name 角色名称
        +string description 角色描述
        +string personality 人格设定
        +string scenario 场景设定
        +string first_mes 开场白
        +string mes_example 示例对话
        +string avatar 头像路径
        +number talkativeness 话痨程度
        +boolean fav 是否收藏
        +string[] tags 标签
        +Date create_date 创建日期
        +CharacterData data 完整数据
        +string user_id 创建者ID
        +boolean is_public 是否公开
    }
    
    class CharacterData {
        V3规范完整数据
        --
        +string name
        +string description
        +string personality
        +string scenario
        +string first_mes
        +string mes_example
        +string creator_notes
        +string system_prompt
        +string post_history_instructions
        +string[] tags
        +string creator
        +string character_version
        +string[] alternate_greetings
        +string[] group_only_greetings
        +CharacterExtensions extensions
    }
    
    class CharacterExtensions {
        扩展配置
        --
        +number talkativeness
        +boolean fav
        +DepthPrompt depth_prompt
        +RegexScript[] regex_scripts
    }
    
    class DepthPrompt {
        深度提示配置
        --
        +string prompt
        +number depth
        +string role
    }
    
    class ChatSession {
        会话主文档
        collection: chat_sessions
        --
        +ObjectId _id
        +string user_id 用户ID
        +ObjectId character_id 角色卡ID
        +string user_name 用户名快照
        +string character_name 角色名快照
        +ChatMetadata chat_metadata 元数据
    }
    
    class ChatMetadata {
        会话配置和状态
        --
        +string integrity ULID唯一标识
        +number chat_id_hash 聊天ID哈希
        +string note_prompt 作者注释
        +number note_interval 注释间隔
        +number note_position 注释位置
        +number note_depth 注释深度
        +number note_role 注释角色
        +boolean tainted 是否被修改
        +TimedWorldInfo timedWorldInfo
        +number lastInContextMessageId
    }
    
    class ChatMessage {
        消息主文档
        collection: chat_messages
        --
        +ObjectId _id
        +ObjectId session_id 会话引用
        +string name 发送者
        +boolean is_user 用户消息标记
        +boolean is_system 系统消息标记
        +Date send_date 发送时间
        +string mes 消息内容
        +MessageExtra extra 扩展信息
        +string[] swipes 候选回复
        +number swipe_id 选中索引
        +SwipeInfo[] swipe_info 候选详情
    }
    
    class MessageExtra {
        AI生成元数据
        --
        +string api API提供商
        +string model 模型名称
        +string reasoning 推理过程
        +number reasoning_duration 推理耗时
    }
    
    Character "1" *-- "1" CharacterData : 嵌入
    CharacterData "1" *-- "1" CharacterExtensions : 嵌入
    CharacterExtensions "1" *-- "1" DepthPrompt : 嵌入
    Character "1" --o "*" ChatSession : character_id
    ChatSession "1" *-- "1" ChatMetadata : 嵌入
    ChatSession "1" --o "*" ChatMessage : session_id
    ChatMessage "1" *-- "1" MessageExtra : 嵌入
```

## 索引说明

### Character 集合

| 索引字段 | 类型 | 用途 |
|----------|------|------|
| name, data.description | text | 全文搜索角色 |
| user_id | normal | 查询用户创建的角色 |
| tags | normal | 按标签筛选 |
| is_public, createdAt | compound | 公开角色列表排序 |

### ChatSession 集合

| 索引字段 | 类型 | 用途 |
|----------|------|------|
| chat_metadata.integrity | unique | 通过 ULID 定位唯一会话 |
| user_id | normal | 查询用户的所有会话 |
| character_id | normal | 查询角色的所有会话 |
| user_id, character_id | compound | 查询用户与特定角色的会话 |

### ChatMessage 集合

| 索引字段 | 类型 | 用途 |
|----------|------|------|
| session_id, send_date | compound | 按时间顺序获取会话消息 |
| session_id, is_user | compound | 筛选会话中的用户或AI消息 |

## 时序图 - 创建会话并发送消息

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant API as API服务
    participant PG as PostgreSQL
    participant MG as MongoDB

    U->>API: 选择角色开始对话
    API->>PG: 验证用户身份
    PG-->>API: 返回 AppAccount
    
    API->>MG: 查询 Character
    MG-->>API: 返回角色卡数据
    
    Note over API: 创建会话
    API->>MG: 创建 ChatSession
    Note right of MG: user_id = AppAccount.id<br/>character_id = Character._id<br/>user_name = 快照<br/>character_name = 快照
    MG-->>API: 返回 session_id
    
    U->>API: 发送消息
    API->>MG: 创建 ChatMessage (is_user=true)
    
    API->>MG: 查询历史消息构建上下文
    API->>API: 调用 AI API
    
    API->>MG: 创建 ChatMessage (is_user=false)
    API-->>U: 返回 AI 回复
```

## 时序图 - 重新生成回复

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant API as API服务
    participant MG as MongoDB
    participant AI as AI API

    U->>API: 请求重新生成
    API->>MG: 查询原 ChatMessage
    MG-->>API: 返回消息数据
    
    API->>MG: 查询 ChatSession
    MG-->>API: 返回会话 (含 character_id)
    
    API->>MG: 查询 Character 获取设定
    MG-->>API: 返回角色卡
    
    API->>MG: 查询历史消息
    MG-->>API: 返回上下文
    
    API->>AI: 发送生成请求
    AI-->>API: 返回新回复
    
    API->>MG: 更新 ChatMessage
    Note right of MG: swipes.push(新内容)<br/>swipe_info.push(新详情)<br/>swipe_id++
    
    API-->>U: 返回新回复
```

## 状态图 - 会话生命周期

```mermaid
stateDiagram-v2
    [*] --> 创建中: 选择角色开始对话
    
    创建中 --> 活跃: 会话创建成功
    note right of 创建中: 生成 ULID<br/>记录名称快照
    
    活跃 --> 活跃: 发送/接收消息
    活跃 --> 活跃: 重新生成回复
    活跃 --> 已修改: 手动编辑消息
    note right of 已修改: tainted = true
    
    已修改 --> 已修改: 继续对话
    活跃 --> 已归档: 归档会话
    已修改 --> 已归档: 归档会话
    
    已归档 --> 活跃: 恢复会话
    活跃 --> 已删除: 删除会话
    已归档 --> 已删除: 永久删除
    
    已删除 --> [*]
```

## 流程图 - 消息处理流程

```mermaid
flowchart TD
    A[接收用户消息] --> B{会话存在?}
    
    B -->|否| C[查询角色卡]
    C --> D[创建 ChatSession]
    D --> E[记录名称快照]
    E --> F[保存用户消息]
    
    B -->|是| F
    
    F --> G[查询 Character 获取设定]
    G --> H[查询历史消息]
    H --> I[构建上下文]
    
    I --> J[添加系统提示]
    J --> K[添加角色人设]
    K --> L[添加作者注释]
    
    L --> M{检查世界信息}
    M -->|有触发| N[注入世界信息]
    M -->|无触发| O[调用 AI API]
    N --> O
    
    O --> P{生成成功?}
    P -->|是| Q[保存 AI 回复]
    P -->|否| R[记录错误]
    
    Q --> S[更新 lastInContextMessageId]
    S --> T[返回响应]
    
    R --> U{重试?}
    U -->|是| O
    U -->|否| V[返回错误]
```

## 思维导图 - 系统功能模块

```mermaid
mindmap
    root((聊天系统))
        角色管理
            创建角色卡
            编辑角色设定
            导入/导出 V3 格式
            公开/私有设置
            标签分类
        会话管理
            创建会话
            会话列表
            会话详情
            删除/归档
        消息管理
            发送消息
            接收回复
            查询历史
            编辑消息
        AI 生成
            调用 API
            流式输出
            重新生成
            候选切换
        上下文构建
            角色人设
            系统提示
            历史消息
            作者注释
            世界信息
```

## 用户旅程图

```mermaid
journey
    title 用户与 AI 角色对话旅程
    section 准备阶段
        登录系统: 5: 用户
        浏览角色列表: 4: 用户
        选择/创建角色: 5: 用户
    section 开始对话
        创建新会话: 4: 系统
        查看开场白: 5: 用户
        发送第一条消息: 5: 用户
    section 进行对话
        等待 AI 回复: 3: 用户
        阅读 AI 回复: 5: 用户
        继续对话: 5: 用户
    section 调整回复
        对回复不满意: 2: 用户
        重新生成: 4: 用户
        切换候选: 4: 用户
        选择满意回复: 5: 用户
    section 结束
        保存会话: 4: 用户
        下次继续: 5: 用户
```
