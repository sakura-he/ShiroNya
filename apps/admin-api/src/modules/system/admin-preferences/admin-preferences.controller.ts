import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { ADMIN_PREFERENCE_MANAGE_PERMISSION } from './admin-preference.constants';
import { AdminPreferencesService } from './admin-preferences.service';
import {
    AdminPreferenceEffectiveDto,
    AdminPreferenceNullDto,
    AdminPreferencePolicyListDto,
    QueryAdminPreferencePolicyDto,
    QueryAdminPreferencePolicySchema,
    UpdateAdminPreferencePolicyDto,
    UpdateAdminPreferencePolicySchema,
    UpdateMyAdminPreferencesDto,
    UpdateMyAdminPreferencesSchema
} from './dto/admin-preference.dto';

@ApiTags('System/AdminPreference')
@Controller('system/admin-preference')
export class AdminPreferencesController {
    constructor(private readonly adminPreferencesService: AdminPreferencesService) {}

    @Post('query_my_admin_preferences')
    @ApiOkResByZod({ summary: '查询当前用户后台偏好', type: AdminPreferenceEffectiveDto })
    async queryMyAdminPreferences(@Session() session: BetterAuthSession) {
        return await this.adminPreferencesService.queryMyPreferences(session.user.id);
    }

    @Post('update_my_admin_preferences')
    @ApiOkResByZod({ summary: '更新当前用户后台偏好', type: AdminPreferenceNullDto })
    async updateMyAdminPreferences(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(UpdateMyAdminPreferencesSchema)) data: UpdateMyAdminPreferencesDto
    ) {
        return await this.adminPreferencesService.updateMyPreferences(session.user.id, data);
    }

    @RbacPermission(ADMIN_PREFERENCE_MANAGE_PERMISSION)
    @Post('query_admin_preference_policy')
    @ApiOkResByZod({ summary: '查询后台偏好系统策略', type: AdminPreferencePolicyListDto })
    async queryAdminPreferencePolicy(
        @Body(new ZodValidationPipe(QueryAdminPreferencePolicySchema)) _query: QueryAdminPreferencePolicyDto
    ) {
        return await this.adminPreferencesService.queryPolicies();
    }

    @RbacPermission(ADMIN_PREFERENCE_MANAGE_PERMISSION)
    @Post('update_admin_preference_policy')
    @ApiOkResByZod({ summary: '更新后台偏好系统策略', type: AdminPreferenceNullDto })
    async updateAdminPreferencePolicy(
        @Body(new ZodValidationPipe(UpdateAdminPreferencePolicySchema)) data: UpdateAdminPreferencePolicyDto
    ) {
        return await this.adminPreferencesService.updatePolicies(data);
    }
}
