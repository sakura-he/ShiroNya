import type { Request, Response } from 'express';

/** 用户状态响应头写入器注入 token */
export const USER_STATE_HEADER_WRITER = Symbol('USER_STATE_HEADER_WRITER');

/** 用户状态响应头写入器接口 */
export interface UserStateHeaderWriter {
    /** 按请求上下文写入用户状态版本相关响应头 */
    attachUserStateHeaders(request: Request & { session?: any }, response: Response): Promise<void>;
}
