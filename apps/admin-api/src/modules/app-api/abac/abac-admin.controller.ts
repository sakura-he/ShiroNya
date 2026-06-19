import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../system/rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../../system/rbac/rbac-permissions';
import { getActor, getRequestId, type ShiroRequest } from '../rbac/rbac-admin.controller-utils';
import { AbacAdminService } from './abac-admin.service';

type AppAbacRpcMethod = Parameters<AbacAdminService['call']>[0];

@RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PAGE)
@Controller('app-api/abac')
export class AbacAdminController {
    constructor(private readonly abacAdminService: AbacAdminService) {}

    @Get('health')
    async health(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('GetAbacHealth', {}, session, request);
    }

    @Get('fields')
    async fields(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('GetAbacFields', {}, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_FIELD_READ)
    @Post('field-registry/query')
    async fieldRegistry(
        @Session() session: BetterAuthSession,
        @Body() query: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('ListAbacFieldRegistry', query, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_FIELD_WRITE)
    @Post('field-registry')
    async upsertField(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('UpsertAbacField', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_FIELD_WRITE)
    @Delete('field-registry/:id')
    async deleteField(@Session() session: BetterAuthSession, @Param('id') id: string, @Req() request: ShiroRequest) {
        return await this.call('DeleteAbacField', { id }, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_READ)
    @Post('policy-groups/rbac-permission-options/query')
    async rbacPermissionOptions(
        @Session() session: BetterAuthSession,
        @Body() query: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('ListAbacRbacPermissionOptions', query, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_READ)
    @Get('policy-groups')
    async policyGroups(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('ListAbacPolicyGroups', {}, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_WRITE)
    @Post('policy-groups')
    async upsertPolicyGroup(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('UpsertAbacPolicyGroup', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_WRITE)
    @Delete('policy-groups/:id')
    async deletePolicyGroup(
        @Session() session: BetterAuthSession,
        @Param('id') id: string,
        @Req() request: ShiroRequest
    ) {
        return await this.call('DeleteAbacPolicyGroup', { id }, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_READ)
    @Get('manual-policies')
    async manualPolicies(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('ListAbacManualPolicies', {}, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_WRITE)
    @Post('manual-policies/validate')
    async validateManualPolicy(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('ValidateAbacManualPolicy', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_WRITE)
    @Post('manual-policies')
    async upsertManualPolicy(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('UpsertAbacManualPolicy', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_WRITE)
    @Delete('manual-policies/:id')
    async deleteManualPolicy(
        @Session() session: BetterAuthSession,
        @Param('id') id: string,
        @Req() request: ShiroRequest
    ) {
        return await this.call('DeleteAbacManualPolicy', { id }, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PREVIEW)
    @Get('compile-preview')
    async compilePreview(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('PreviewAbacCompile', {}, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PUBLISH)
    @Post('publish/preview')
    async previewPublish(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('PreviewAbacPublish', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PUBLISH)
    @Post('publish')
    async publish(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('PublishAbac', body, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PUBLISH)
    @Get('releases')
    async releases(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.call('GetAbacReleases', {}, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_PUBLISH)
    @Post('rollback/:revision')
    async rollback(
        @Session() session: BetterAuthSession,
        @Param('revision') revision: string,
        @Req() request: ShiroRequest
    ) {
        return await this.call('RollbackAbacRelease', { revision }, session, request);
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_ABAC_RUNTIME_TEST)
    @Post('runtime-test')
    async runtimeTest(
        @Session() session: BetterAuthSession,
        @Body() body: Record<string, unknown>,
        @Req() request: ShiroRequest
    ) {
        return await this.call('TestAbacRuntime', body, session, request);
    }

    private async call(
        method: AppAbacRpcMethod,
        payload: Record<string, unknown>,
        session: BetterAuthSession,
        request: ShiroRequest
    ) {
        return await this.abacAdminService.call(method, payload, getActor(session), getRequestId(request));
    }
}
