import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { SystemRbacEffectiveService } from './effective.service';

describe('SystemRbacEffectiveService', () => {
    let authzService: any;
    let graphService: any;
    let service: SystemRbacEffectiveService;

    beforeEach(() => {
        authzService = {
            assertPermission: jest.fn().mockResolvedValue(undefined)
        };
        graphService = {
            getOverview: jest.fn().mockResolvedValue({
                sources: {},
                effective: {}
            }),
            getUserEffectiveState: jest.fn().mockResolvedValue({
                userId: 'u1',
                roleIds: [1],
                permissionIds: [2],
                visibleMenuIds: [3],
                isSuperAdmin: false
            }),
            previewRebuild: jest.fn().mockResolvedValue({
                userCount: 1,
                effectiveRoleCount: 1,
                effectivePermissionCount: 1,
                visibleMenuCount: 1,
                superAdminUserCount: 0,
                sample: []
            }),
            applyRebuild: jest.fn().mockResolvedValue({
                userCount: 1,
                effectiveRoleCount: 1,
                effectivePermissionCount: 1,
                visibleMenuCount: 1,
                superAdminUserCount: 0,
                version: '01HX',
                sample: []
            })
        };
        service = new SystemRbacEffectiveService(
            authzService as RbacAuthorizationService,
            graphService as SystemRbacGraphService
        );
    });

    it('查询 overview 和用户 effective 状态只需要 view 权限', async () => {
        await expect(service.getOverview('operator_1')).resolves.toEqual({
            sources: {},
            effective: {}
        });
        await expect(service.queryUserEffectiveState({ userId: 'u1' }, 'operator_1')).resolves.toMatchObject({
            userId: 'u1',
            roleIds: [1]
        });

        expect(authzService.assertPermission).toHaveBeenCalledWith('operator_1', RBAC_PERMISSIONS.EFFECTIVE_VIEW);
        expect(graphService.getUserEffectiveState).toHaveBeenCalledWith('u1');
    });

    it('预览和应用 rebuild 必须使用 rebuild 权限并透传 userIds', async () => {
        await expect(service.previewRebuild({ userIds: ['u1'] }, 'operator_1')).resolves.toMatchObject({
            userCount: 1
        });
        await expect(service.applyRebuild({ userIds: ['u1'] }, 'operator_1')).resolves.toMatchObject({
            version: '01HX'
        });

        expect(authzService.assertPermission).toHaveBeenCalledWith('operator_1', RBAC_PERMISSIONS.EFFECTIVE_REBUILD);
        expect(graphService.previewRebuild).toHaveBeenCalledWith(['u1']);
        expect(graphService.applyRebuild).toHaveBeenCalledWith(['u1']);
    });
});
