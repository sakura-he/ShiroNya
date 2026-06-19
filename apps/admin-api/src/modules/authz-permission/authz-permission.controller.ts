import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthzObjectExceptionService } from '../authz-object-exception/authz-object-exception.service';
import {
    ApplyAuthzObjectExceptionBindingsDto,
    ApplyAuthzObjectExceptionBindingsSchema,
    AuthzObjectExceptionBindingsDto,
    AuthzObjectExceptionPreviewDto,
    AuthzObjectExceptionQueryDto,
    AuthzObjectExceptionQuerySchema,
    PreviewAuthzObjectExceptionBindingsDto,
    PreviewAuthzObjectExceptionBindingsSchema
} from '../authz-object-exception/dto/authz-object-exception.dto';
import type { BetterAuthSession } from '../better-auth/better-auth-session.type';
import { RbacPermission } from '../system/rbac/rbac-permission.decorator';
import { AuthzPermissionService } from './authz-permission.service';
import {
    ApplyAuthzPermissionMatrixDto,
    ApplyAuthzPermissionMatrixSchema,
    AuthzPermissionMatrixDto,
    AuthzPermissionMatrixPreviewDto,
    PreviewAuthzPermissionMatrixDto,
    PreviewAuthzPermissionMatrixSchema,
    RenameAuthzPermissionResourceDto,
    RenameAuthzPermissionResourceSchema
} from './dto/authz-permission.dto';

/**
 * 提供权限管理页读取权限矩阵和写入角色 manager 授权的接口。
 */
@ApiTags('Authz Permission')
@Controller('authz-permission')
export class AuthzPermissionController {
    /**
     * 注入权限管理和对象例外授权服务。
     */
    constructor(
        private readonly authzPermissionService: AuthzPermissionService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService
    ) {}

    /**
     * 返回 SpiceDB 实体权限探测结果和核心 manager 角色授权矩阵。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.view')
    @Get('matrix')
    @ApiOkResByZod({ summary: '获取权限管理矩阵', type: AuthzPermissionMatrixDto })
    async getMatrix(@Session() session: BetterAuthSession) {
        return await this.authzPermissionService.getMatrix(session.user.id);
    }

    /**
     * 重命名权限管理页中指定 SpiceDB 实体的展示名。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.view')
    @Post('rename-resource')
    @ApiOkResByZod({ summary: '重命名权限实体展示名', type: AuthzPermissionMatrixDto })
    async renameResource(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(RenameAuthzPermissionResourceSchema)) data: RenameAuthzPermissionResourceDto
    ) {
        return await this.authzPermissionService.renameResource(data, session.user.id);
    }

    /**
     * 预览权限矩阵批量变更的 tuple 增量和影响范围。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.update')
    @Post('matrix/preview')
    @ApiOkResByZod({ summary: '预览权限矩阵批量变更', type: AuthzPermissionMatrixPreviewDto })
    async previewMatrixChanges(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(PreviewAuthzPermissionMatrixSchema)) data: PreviewAuthzPermissionMatrixDto
    ) {
        return await this.authzPermissionService.previewMatrixChanges(data, session.user.id);
    }

    /**
     * 应用权限矩阵批量变更，并在大批量变更时要求显式确认。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.update')
    @Post('matrix/apply')
    @ApiOkResByZod({ summary: '应用权限矩阵批量变更', type: AuthzPermissionMatrixDto })
    async applyMatrixChanges(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(ApplyAuthzPermissionMatrixSchema)) data: ApplyAuthzPermissionMatrixDto
    ) {
        return await this.authzPermissionService.applyMatrixChanges(data, session.user.id);
    }

    /**
     * 读取指定核心对象的人工例外授权关系。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.update')
    @Get('object-bindings')
    @ApiOkResByZod({ summary: '获取对象例外授权关系', type: AuthzObjectExceptionBindingsDto })
    async getObjectBindings(
        @Session() session: BetterAuthSession,
        @Query(new ZodValidationPipe(AuthzObjectExceptionQuerySchema)) query: AuthzObjectExceptionQueryDto
    ) {
        return await this.authzObjectExceptionService.getBindings(query, session.user.id);
    }

    /**
     * 预览对象例外授权变更的 tuple 增量和受影响用户数量。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.update')
    @Post('object-bindings/preview')
    @ApiOkResByZod({ summary: '预览对象例外授权变更', type: AuthzObjectExceptionPreviewDto })
    async previewObjectBindings(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(PreviewAuthzObjectExceptionBindingsSchema))
        data: PreviewAuthzObjectExceptionBindingsDto
    ) {
        return await this.authzObjectExceptionService.previewBindings(data, session.user.id);
    }

    /**
     * 应用对象例外授权变更，并在大批量变更时要求显式确认。
     */
    @ApiBearerAuth('bearer')
    @RbacPermission('system.permission.update')
    @Post('object-bindings/apply')
    @ApiOkResByZod({ summary: '应用对象例外授权变更', type: AuthzObjectExceptionBindingsDto })
    async applyObjectBindings(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(ApplyAuthzObjectExceptionBindingsSchema))
        data: ApplyAuthzObjectExceptionBindingsDto
    ) {
        return await this.authzObjectExceptionService.applyBindings(data, session.user.id);
    }
}
