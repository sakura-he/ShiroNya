import { UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../constants/error-code.constant';

export class UnauthException extends UnauthorizedException {
    bizCode: number;
    bizMessage: string;

    constructor(error: ErrorCode) {
        super(error.message);
        this.message = error.message;
        this.bizCode = error.code;
        this.bizMessage = error.message;
    }
}
