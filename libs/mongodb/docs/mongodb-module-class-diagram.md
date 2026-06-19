# mongodb 关系图

## 1. 建模说明
当前仓库只有聊天域使用 MongoDB，因此本图只画三套聊天 schema 与注入关系。

## 2. 模块分层结论
- `MongoDBModule` 管理连接。
- `Character`、`ChatSession`、`ChatMessage` 为聊天域三张核心集合。
- `app-api/chat/*` 三个子模块按需消费这些 schema。

```mermaid
classDiagram
    class MongoDBModule
    class Character
    class ChatSession
    class ChatMessage
    class CharacterModule
    class SessionModule
    class MessageModule

    MongoDBModule --> Character
    MongoDBModule --> ChatSession
    MongoDBModule --> ChatMessage
    CharacterModule --> Character
    SessionModule --> ChatSession
    SessionModule --> Character
    SessionModule --> ChatMessage
    MessageModule --> ChatMessage
    MessageModule --> ChatSession
```

```mermaid
flowchart TD
    Mongo["MongoDB URI"]
    Module["MongoDBModule"]
    Character["characters"]
    Session["chat_sessions"]
    Message["chat_messages"]
    Chat["app-api chat/*"]

    Mongo --> Module
    Module --> Character
    Module --> Session
    Module --> Message
    Character --> Chat
    Session --> Chat
    Message --> Chat
```

```mermaid
sequenceDiagram
    participant Chat as Chat Module
    participant Module as MongoDBModule
    participant DB as MongoDB

    Chat->>Module: 注入 Mongoose model
    Module->>DB: 建立连接
    DB-->>Module: connected
    Chat->>DB: 读写角色卡 / 会话 / 消息
```

```mermaid
erDiagram
    CHARACTER ||--o{ CHAT_SESSION : "character_id"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "session_id"
    CHARACTER {
        string name
        string user_id
        boolean is_public
    }
    CHAT_SESSION {
        string user_id
        string character_name
        string integrity
    }
    CHAT_MESSAGE {
        string session_id
        boolean is_user
        date send_date
        string mes
    }
```
