import { PASSWORD_POLICY_MESSAGE } from './password-policy.constant';

/**
 * 错误码接口定义
 */
export interface ErrorCode {
    code: number;
    message: string;
}

/**
 * 动态错误码工厂函数类型
 */
export type ErrorCodeFactory<T extends any[] = []> = (...args: T) => ErrorCode;

/**
 * 错误码常量 - 按模块分组
 *
 * 码段分配：
 *   200-599    通用 HTTP 语义
 *   1000-1099  认证：用户 + Token
 *   1100-1199  访问控制：角色
 *   1200-1299  请求：参数验证
 *   1300-1399  数据持久化：数据库
 *   1400-1499  文件上传
 *   1500-1599  后台任务
 *   1600-1699  操作限制
 *   1800-1899  权限
 *   1900-1999  后台菜单
 *   2000-2099  App 用户
 *   2100-2199  App 角色
 *   2200-2299  App 菜单
 *   2300-2399  日志
 *   2400-2499  短信
 *   2500-2599  App 权限
 *   2600-2699  App 策略
 *   2700-2799  系统运行时
 *   2800-2899  Cerbos 授权运行时
 *
 * 应用专属错误码（不在此文件中）：
 *   3000-3999  app-api   → apps/app-api/src/common/constants/error-code.constant.ts
 *   4000-4999  admin-api → apps/admin-api/src/common/constants/error-code.constant.ts
 */
export const ErrorCodes = {
    // ==================== 通用 HTTP 语义 (200-599) ====================
    SUCCESS: { code: 200, message: 'OK' },
    BAD_REQUEST: { code: 400, message: '请求参数错误' },
    UNAUTHORIZED: { code: 401, message: '未授权访问' },
    FORBIDDEN: { code: 403, message: '权限不足' },
    NOT_FOUND: { code: 404, message: '资源不存在' },
    SERVER_ERROR: { code: 500, message: '服务繁忙，请稍后再试' },
    DEFAULT: { code: 501, message: '未知错误' },

    // ==================== 认证：用户 + Token (1000-1099) ====================
    USER: {
        // ---- 用户 (1001-1006, 1020-1030) ----
        EXISTS: { code: 1001, message: '系统用户已存在' },
        INVALID_VERIFICATION_CODE: { code: 1002, message: '验证码填写有误' },
        INVALID_USERNAME_PASSWORD: { code: 1003, message: '用户名或密码错误' },
        NOT_FOUND: { code: 1004, message: '用户不存在' },
        LOCKED: { code: 1005, message: '用户已被锁定，请联系管理员' },
        DISABLED: { code: 1006, message: '用户已被禁用' },
        PASSWORD_TOO_WEAK: { code: 1020, message: '密码强度不足' },
        OLD_PASSWORD_ERROR: { code: 1021, message: '原密码错误' },
        RESET_TOKEN_INVALID: { code: 1022, message: '重置链接无效或已过期' },
        PASSWORD_TOO_SHORT: { code: 1023, message: PASSWORD_POLICY_MESSAGE },
        PASSWORD_TOO_LONG: { code: 1024, message: PASSWORD_POLICY_MESSAGE },
        PASSWORD_EXPIRED: { code: 1030, message: '密码已过期' }
    },

    TOKEN: {
        // ---- Token (1007-1012，位于 USER 码段内) ----
        EXPIRED: { code: 1007, message: '登录凭证已过期' },
        INVALID: { code: 1008, message: '登录凭证无效' },
        NOT_BEFORE: { code: 1009, message: '登录凭证未到生效时间' },
        UNDEFINED_ERROR: { code: 1010, message: '登录凭证验证过程中出现未知错误' },
        NOT_PROVIDED_USER: { code: 1011, message: '认证信息中没有有效的用户' },
        NOT_FOUND_USER: { code: 1012, message: '未找到认证用户' }
    },

    // ==================== 访问控制：角色 (1100-1199) ====================
    ROLE: {
        PERMISSION_DENIED: { code: 1101, message: '无权限执行此操作' },
        ALREADY_EXISTS: { code: 1102, message: '角色已存在' },
        NOT_FOUND: { code: 1103, message: '角色不存在' },
        INVALID_ASSIGNMENT: { code: 1104, message: '不能分配该角色' },
        MENU_NOT_FOUND: (ids: string) => ({ code: 1105, message: `分配菜单不存在, id 为: ${ids}` }),
        DELETE_FAILED_REF: (users: string) => ({
            code: 1106,
            message: `删除角色失败, 当前角色正在被以下用户使用: ${users}`
        }),
        NAME_ALREADY_EXISTS: { code: 1107, message: '角色名称已存在' },
        NOT_FOUND_IDS: (ids: string) => ({ code: 1108, message: `角色不存在, id 为: ${ids}` })
    },

    // ==================== 请求：参数验证 (1200-1299) ====================
    PARAM: {
        MISSING: { code: 1201, message: '缺少必要参数' },
        INVALID: { code: 1202, message: '参数格式错误' },
        UNSUPPORTED_MEDIA_TYPE: { code: 1203, message: '不支持的媒体类型' }
    },

    // ==================== 数据持久化：数据库 (1300-1399) ====================
    DATABASE: {
        ERROR: { code: 1301, message: '数据库操作失败' },
        ALREADY_EXISTS: { code: 1302, message: '数据已存在' },
        NOT_FOUND: { code: 1303, message: '数据未找到' },
        CONFLICT: { code: 1304, message: '数据冲突' }
    },

    // ==================== 文件上传 (1400-1499) ====================
    FILE: {
        UPLOAD_FAILED: { code: 1401, message: '文件上传失败' },
        TOO_LARGE: { code: 1402, message: '文件大小超出限制' },
        FORMAT_NOT_SUPPORTED: { code: 1403, message: '文件格式不支持' },
        CHUNK_NOT_FOUND: { code: 1404, message: '文件切片不存在' },
        CHUNK_NOT_UPLOADED: { code: 1405, message: '文件切片未上传完成' },
        CHUNK_HASH_NOT_MATCH: { code: 1406, message: '文件切片 hash 值不一致' }
    },

    // ==================== 后台任务 (1500-1599) ====================
    TASK: {
        NOT_FOUND: { code: 1501, message: '任务不存在' },
        HANDLER_NOT_FOUND: { code: 1502, message: '任务 handler 不存在' },
        INVALID_CRON: { code: 1503, message: '任务 CRON 表达式无效' },
        JOB_NOT_REGISTERED: { code: 1504, message: '任务尚未注册到调度器' },
        RUN_FAILED: { code: 1505, message: '任务执行失败' },
        NAME_ALREADY_EXISTS: { code: 1506, message: '任务名称已存在' }
    },

    // ==================== 操作限制 (1600-1699) ====================
    OPERATION: {
        NOT_ALLOWED: { code: 1601, message: '操作不允许' },
        DUPLICATE: { code: 1602, message: '重复操作' },
        RATE_LIMIT_EXCEEDED: { code: 1603, message: '请求过于频繁，请稍后再试' }
    },

    // ==================== 权限 (1800-1899) ====================
    PERMISSION: {
        NAME_ALREADY_EXISTS: { code: 1801, message: '权限名称已存在' },
        NOT_FOUND: { code: 1802, message: '权限不存在' }
    },

    // ==================== 后台菜单 (1900-1999) ====================
    MENU: {
        NAME_ALREADY_EXISTS: { code: 1901, message: '菜单名称已存在' },
        NOT_FOUND: { code: 1902, message: '菜单不存在' },
        PARENT_NOT_FOUND: { code: 1903, message: '上级菜单不存在' },
        PARENT_CIRCULAR: { code: 1904, message: '上级菜单不能是自身' },
        CATALOG_PARENT_MUST_CATALOG_OR_NULL: { code: 1905, message: '上级菜单必须是目录或为根目录' },
        BUTTON_PARENT_MUST_PAGE: { code: 1906, message: '按钮上级菜单必须是页面' },
        PAGE_PARENT_MUST_CATALOG_ROOT: { code: 1907, message: '页面上级菜单必须是目录或者为根目录' }
    },

    // ==================== App 用户 (2000-2099) ====================
    APP_USER: {
        NOT_FOUND: { code: 2001, message: 'App用户不存在' },
        EMAIL_EXISTS: { code: 2003, message: 'App用户邮箱已存在' },
        PHONE_EXISTS: { code: 2004, message: 'App用户手机号已存在' }
    },

    // ==================== App 角色 (2100-2199) ====================
    APP_ROLE: {
        NOT_FOUND: { code: 2101, message: 'App角色不存在' },
        CODE_EXISTS: { code: 2102, message: 'App角色编码已存在' }
    },

    // ==================== App 菜单 (2200-2299) ====================
    APP_MENU: {
        NOT_FOUND: { code: 2201, message: 'App菜单不存在' },
        PERMISSION_EXISTS: { code: 2202, message: 'App菜单权限编码已存在' },
        PARENT_NOT_FOUND: { code: 2203, message: 'App上级菜单不存在' },
        PARENT_CIRCULAR: { code: 2204, message: 'App上级菜单不能是自身' }
    },

    // ==================== 日志 (2300-2399) ====================
    LOG: {
        NOT_FOUND: { code: 2301, message: '日志记录不存在' },
        QUERY_INVALID: { code: 2302, message: '日志查询参数无效' }
    },

    // ==================== 短信 (2400-2499) ====================
    SMS: {
        PHONE_RATE_LIMIT: (ttl: number): ErrorCode => ({ code: 2401, message: `发送过于频繁，请 ${ttl} 秒后重试` }),
        PHONE_DAILY_LIMIT: { code: 2402, message: '该手机号今日发送次数已达上限' },
        IP_DAILY_LIMIT: { code: 2403, message: '当前 IP 今日发送次数已达上限' },
        SEND_FAILED: { code: 2404, message: '短信发送失败' },
        PHONE_INVALID: { code: 2405, message: '手机号格式无效' },
        PROVIDER_NOT_CONFIGURED: { code: 2406, message: '短信服务未配置' }
    },

    // ==================== App 权限 (2500-2599) ====================
    APP_PERMISSION: {
        NOT_FOUND: { code: 2501, message: 'App权限不存在' },
        DUPLICATE: { code: 2502, message: 'App权限名称已存在' }
    },

    // ==================== App 策略 (2600-2699) ====================
    APP_POLICY: {
        NOT_FOUND: { code: 2601, message: 'App策略不存在' },
        PERMISSION_NOT_FOUND: { code: 2602, message: '关联的权限不存在' }
    },

    // ==================== 系统运行时 (2700-2799) ====================
    SYSTEM: {
        DEFAULT_ROLE_NOT_FOUND: { code: 2701, message: '系统默认角色未配置，请联系管理员' },
        SERIALIZATION_FAILED: { code: 2702, message: '响应序列化失败' }
    },

    // ==================== Cerbos 授权运行时 (2800-2899) ====================
    CERBOS: {
        USER_ROLE_MISSING: { code: 2801, message: '当前用户缺少 Cerbos 角色信息' },
        ACCESS_DENIED: { code: 2802, message: 'Cerbos 权限不足' },
        CHECK_FAILED: { code: 2803, message: 'Cerbos 权限检查失败' },
        TLS_CERT_NOT_FOUND: (path: string): ErrorCode => ({
            code: 2804,
            message: `Cerbos TLS 证书文件不存在: ${path}`
        }),
        TLS_ENABLED_INVALID: (key: string): ErrorCode => ({
            code: 2805,
            message: `${key} 必须显式配置为 true 或 false`
        }),
        ENV_PREFIX_REQUIRED: (source: string): ErrorCode => ({
            code: 2806,
            message: `${source} 必须显式提供 Cerbos 环境变量前缀`
        }),
        BOOLEAN_FLAG_INVALID: (key: string): ErrorCode => ({
            code: 2807,
            message: `${key} 必须配置为 true 或 false`
        })
    }
} as const;
