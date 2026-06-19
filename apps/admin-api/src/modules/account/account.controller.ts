import { AuditLog, Public } from '@app/common';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { AccountService } from './account.service';
import {
    AccountPermissionBatchCheckResultDto,
    ChangePasswordDto,
    CheckAccountPermissionsBatchDto,
    CheckAccountPermissionsBatchSchema,
    RequestPasswordResetDto,
    ResetPasswordDto,
    VerifyResetTokenDto
} from './dto/account.dto';
import type { BetterAuthSession } from '../better-auth/better-auth-session.type';

@ApiTags('Account')
@Controller('account')
export class AccountController {
    constructor(private readonly accountService: AccountService) {}

    /** 请求重置密码（公开接口，无需额外权限校验） */
    @Public()
    @AuditLog({ module: 'auth', action: 'request_reset', summary: '请求重置密码', resourceType: 'account' })
    @Post('request_reset')
    async requestPasswordReset(@Body() data: RequestPasswordResetDto) {
        return await this.accountService.requestPasswordReset(data.email);
    }

    /** 验证重置 Token（公开接口，无需额外权限校验） */
    @Public()
    @AuditLog({ module: 'auth', action: 'verify_reset', summary: '验证重置 Token', resourceType: 'account' })
    @Post('verify_reset')
    async verifyResetToken(@Body() data: VerifyResetTokenDto) {
        return await this.accountService.verifyResetToken(data.token);
    }

    /** 重置密码（公开接口，无需额外权限校验） */
    @Public()
    @Post('reset_password')
    @AuditLog({ module: 'auth', action: 'reset_password', summary: '重置密码', resourceType: 'account' })
    async resetPassword(@Body() data: ResetPasswordDto) {
        return await this.accountService.resetPassword(data.token, data.newPassword);
    }

    /** 修改密码（仅要求已登录会话） */
    @AuditLog({ module: 'auth', action: 'change_password', summary: '修改密码', resourceType: 'account' })
    @Post('change_password')
    async changePassword(@Req() req: Request, @Session() session: BetterAuthSession, @Body() data: ChangePasswordDto) {
        return await this.accountService.changePassword(session, req.headers, data.oldPassword, data.newPassword);
    }

    /** 获取当前用户前端启动所需的菜单、权限和状态版本。 */
    @Get('navigation')
    async getAccountNavigation(@Req() req: Request, @Session() session: BetterAuthSession) {
        return await this.accountService.getAccountNavigation(session, req);
    }

    /** 批量检查当前用户是否拥有指定权限点。 */
    @Post('permissions/check-batch')
    @ApiOkResByZod({ summary: '批量检查当前账户权限点', type: AccountPermissionBatchCheckResultDto })
    async checkAccountPermissionsBatch(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(CheckAccountPermissionsBatchSchema)) data: CheckAccountPermissionsBatchDto
    ) {
        return await this.accountService.checkAccountPermissionsBatch(session, data.permissions);
    }

    /** 获取当前账户信息与当前会话权限点列表。 */
    @Get('info')
    async getAccountInfo(@Req() req: Request, @Session() session: BetterAuthSession) {
        return await this.accountService.getAccountInfo(session, req);
    }
}
