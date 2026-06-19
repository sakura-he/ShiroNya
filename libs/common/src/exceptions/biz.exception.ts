import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-code.constant';

export class BusinessException extends HttpException {
    bizCode: number;
    bizMessage: string;
    /** 业务上下文数据，用于错误日志记录 */
    bizContext?: Record<string, any>;

    /**
     * 创建业务异常
     * @param error ErrorCode 对象: { code: 1001, message: '用户不存在' }
     * @param context 业务上下文数据，用于日志记录
     */
    constructor(error: ErrorCode, context?: Record<string, any>) {
        super(error.message, HttpStatus.OK);
        this.message = error.message;
        this.bizCode = error.code;
        this.bizMessage = error.message;
        this.bizContext = context;
    }
}
