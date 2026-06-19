import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { CerbosAbacControlPlaneService } from '@app/cerbos-abac';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';

@RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PAGE)
@Controller('system/abac')
export class SystemAbacControlController {
    constructor(private readonly abacControlPlaneService: CerbosAbacControlPlaneService) {}

    @Get('health')
    async health() {
        return await this.abacControlPlaneService.getHealth();
    }

    @Get('fields')
    async fields() {
        return await this.abacControlPlaneService.getFieldRegistry();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_FIELD_READ)
    @Post('field-registry/query')
    async fieldRegistry(@Body() query: Record<string, unknown>) {
        return await this.abacControlPlaneService.listFieldRegistry(query);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_FIELD_WRITE)
    @Post('field-registry')
    async upsertField(@Session() session: BetterAuthSession, @Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.upsertField(body, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_FIELD_WRITE)
    @Delete('field-registry/:id')
    async deleteField(@Session() session: BetterAuthSession, @Param('id') id: string) {
        return await this.abacControlPlaneService.deleteField(id, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_READ)
    @Post('policy-groups/rbac-permission-options/query')
    async rbacPermissionOptions(@Body() query: Record<string, unknown>) {
        return await this.abacControlPlaneService.listRbacPermissionOptions(query);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_READ)
    @Get('policy-groups')
    async policyGroups() {
        return await this.abacControlPlaneService.listPolicyGroups();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_WRITE)
    @Post('policy-groups')
    async upsertPolicyGroup(@Session() session: BetterAuthSession, @Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.upsertPolicyGroup(body, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_WRITE)
    @Delete('policy-groups/:id')
    async deletePolicyGroup(@Session() session: BetterAuthSession, @Param('id') id: string) {
        return await this.abacControlPlaneService.deletePolicyGroup(id, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_READ)
    @Get('manual-policies')
    async manualPolicies() {
        return await this.abacControlPlaneService.listManualPolicies();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_WRITE)
    @Post('manual-policies/validate')
    async validateManualPolicy(@Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.validateManualPolicy(body);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_WRITE)
    @Post('manual-policies')
    async upsertManualPolicy(@Session() session: BetterAuthSession, @Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.upsertManualPolicy(body, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_WRITE)
    @Delete('manual-policies/:id')
    async deleteManualPolicy(@Session() session: BetterAuthSession, @Param('id') id: string) {
        return await this.abacControlPlaneService.deleteManualPolicy(id, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PREVIEW)
    @Get('compile-preview')
    async compilePreview() {
        return await this.abacControlPlaneService.compilePreview();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PUBLISH)
    @Post('publish/preview')
    async previewPublish() {
        return await this.abacControlPlaneService.previewPublish();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PUBLISH)
    @Post('publish')
    async publish(@Session() session: BetterAuthSession, @Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.publish(body as { reason?: string }, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PUBLISH)
    @Get('releases')
    async releases() {
        return await this.abacControlPlaneService.listReleases();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_PUBLISH)
    @Post('rollback/:revision')
    async rollback(@Session() session: BetterAuthSession, @Param('revision') revision: string) {
        return await this.abacControlPlaneService.rollback(revision, session.user.id);
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_ABAC_RUNTIME_TEST)
    @Post('runtime-test')
    async runtimeTest(@Body() body: Record<string, unknown>) {
        return await this.abacControlPlaneService.runtimeTest(body);
    }
}
