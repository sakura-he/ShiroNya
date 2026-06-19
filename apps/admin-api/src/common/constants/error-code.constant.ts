import type { ErrorCode } from '@app/common';

/**
 * admin-api 专属错误码（4000-4999）
 *
 * 与 libs/common 的 ErrorCodes 互补；仅包含 admin-api 独有的业务场景。
 */
export const AdminErrorCodes = {
    // ==================== 配置校验模块 (4001-4099) ====================
    CONFIG: {
        /** 启动时缺少 ADMIN_SPICEDB_ENDPOINT 或 ADMIN_SPICEDB_TOKEN 环境变量 */
        SPICEDB_CONFIG_MISSING: {
            code: 4001,
            message: '缺少 SpiceDB 连接配置，无法执行后台权限检查'
        } satisfies ErrorCode,
        /** 启动时 ADMIN_BETTER_AUTH_TRUSTED_ORIGINS 为空或未配置 */
        TRUSTED_ORIGINS_MISSING: {
            code: 4002,
            message: 'ADMIN_BETTER_AUTH_TRUSTED_ORIGINS 未配置有效的可信来源'
        } satisfies ErrorCode
    },

    // ==================== SpiceDB 模块 (4101-4199) ====================
    SPICEDB: {
        /** 当前 HTTP 请求缺少后台 Better Auth 会话，无法执行 SpiceDB 校验 */
        SESSION_MISSING: {
            code: 4101,
            message: '当前请求缺少后台会话，无法执行 SpiceDB 权限校验'
        } satisfies ErrorCode,
        /** 当前 SpiceDB 没有已部署 schema */
        DEPLOYED_SCHEMA_NOT_FOUND: {
            code: 4110,
            message: '当前 SpiceDB 没有已部署的 schema'
        } satisfies ErrorCode,
        /** 前端传入的实体类型在当前已部署 schema 中不存在 */
        ENTITY_NOT_FOUND: {
            code: 4111,
            message: 'SpiceDB resource type 不存在'
        } satisfies ErrorCode,
        /** 前端传入的 relation 在当前实体上不存在 */
        RELATION_NOT_FOUND: {
            code: 4112,
            message: 'SpiceDB relation 不存在'
        } satisfies ErrorCode,
        /** relation 允许的 subject target 与当前请求不匹配 */
        SUBJECT_TARGET_INVALID: {
            code: 4113,
            message: 'SpiceDB subject target 不合法'
        } satisfies ErrorCode,
        /** 调用 SpiceDB 上游服务失败 */
        UPSTREAM_FAILED: {
            code: 4116,
            message: 'SpiceDB 上游服务调用失败'
        } satisfies ErrorCode
    },

    // ==================== 用户组模块 (4201-4299) ====================
    USER_GROUP: {
        /** 用户组不存在 */
        NOT_FOUND: {
            code: 4201,
            message: '用户组不存在'
        } satisfies ErrorCode,
        /** 用户组编码已存在 */
        CODE_EXISTS: {
            code: 4202,
            message: '用户组编码已存在'
        } satisfies ErrorCode,
        /** 用户组仍被授权关系引用，不能删除 */
        DELETE_FAILED_REF: {
            code: 4203,
            message: '用户组仍存在成员或角色分配，不能删除'
        } satisfies ErrorCode
    },

    // ==================== 字典模块 (4301-4399) ====================
    DICT: {
        /** 字典不存在 */
        NOT_FOUND: {
            code: 4301,
            message: '字典不存在'
        } satisfies ErrorCode,
        /** 同一分类下字典编码已存在 */
        CODE_EXISTS: {
            code: 4302,
            message: '同一分类下字典编码已存在'
        } satisfies ErrorCode,
        /** 字典项不存在 */
        ITEM_NOT_FOUND: {
            code: 4303,
            message: '字典项不存在'
        } satisfies ErrorCode,
        /** 同一字典下字典项键已存在 */
        ITEM_KEY_EXISTS: {
            code: 4304,
            message: '同一字典下字典项键已存在'
        } satisfies ErrorCode,
        /** 字典分类已存在 */
        CATEGORY_EXISTS: {
            code: 4305,
            message: '字典分类已存在'
        } satisfies ErrorCode,
        /** 字典分类不存在 */
        CATEGORY_NOT_FOUND: {
            code: 4306,
            message: '字典分类不存在'
        } satisfies ErrorCode,
        /** 字典分类仍存在字典，不能删除 */
        CATEGORY_IN_USE: {
            code: 4307,
            message: '字典分类下仍存在字典，不能删除'
        } satisfies ErrorCode
    },

    // ==================== RBAC 模块 (4401-4499) ====================
    RBAC: {
        NOT_FOUND: {
            code: 4401,
            message: 'RBAC 资源不存在'
        } satisfies ErrorCode,
        CODE_EXISTS: {
            code: 4402,
            message: 'RBAC 编码已存在'
        } satisfies ErrorCode,
        BUILTIN_DELETE_FORBIDDEN: {
            code: 4403,
            message: '内置 RBAC 资源不能删除'
        } satisfies ErrorCode,
        ROLE_INHERIT_SELF: {
            code: 4404,
            message: '角色不能继承自身'
        } satisfies ErrorCode,
        ROLE_INHERIT_CYCLE: {
            code: 4405,
            message: '角色继承关系存在循环'
        } satisfies ErrorCode,
        JSON_INVALID: {
            code: 4406,
            message: 'JSON 字段格式无效'
        } satisfies ErrorCode,
        CODE_INVALID: {
            code: 4407,
            message: 'RBAC 权限编码格式无效'
        } satisfies ErrorCode,
        PERMISSION_CONFIG_INVALID: {
            code: 4408,
            message: 'RBAC 权限配置无效'
        } satisfies ErrorCode,
        FIELD_REQUIRED: {
            code: 4409,
            message: 'RBAC 字段级权限检查缺少 field'
        } satisfies ErrorCode,
        RESOURCE_REQUIRED: {
            code: 4410,
            message: 'RBAC 条件权限检查缺少 resource'
        } satisfies ErrorCode
    }
} as const;
