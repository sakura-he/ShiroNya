import type { RbacPermissionKind } from '@app/prisma-app/generated/client';
import { RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY } from '@app/rbac-core';
import { SetMetadata, applyDecorators } from '@nestjs/common';

export const RBAC_PERMISSION_CANDIDATES_METADATA_KEY = Symbol('admin-api.rbac.permission-candidates');

export type RbacPermissionCandidateInput = {
    /**
     * 代码侧声明的稳定权限标识。
     * 当前 RBAC 运行时把它作为 permission code 检查。
     */
    permissionCode: string;
    /**
     * 给权限页面展示的候选名称，不参与运行时鉴权。
     */
    name?: string;
    /**
     * 给权限页面回填的建议描述，不参与运行时鉴权。
     */
    description?: string;
    /**
     * 给权限页面回填的建议类型，不参与运行时鉴权。
     */
    kind?: RbacPermissionKind;
};

export type RbacPermissionCandidateMetadata = Required<Pick<RbacPermissionCandidateInput, 'permissionCode'>> &
    Omit<RbacPermissionCandidateInput, 'permissionCode'>;

function normalizePermissionCode(input: RbacPermissionCandidateInput): string {
    const permissionCode = input.permissionCode.trim();
    if (!permissionCode) {
        throw new Error('RbacDeclarePermissions.permissionCode is required');
    }
    return permissionCode;
}

function toPermissionCandidate(input: RbacPermissionCandidateInput): RbacPermissionCandidateMetadata {
    return {
        permissionCode: normalizePermissionCode(input),
        ...(input.name ? { name: input.name } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.kind ? { kind: input.kind } : {})
    };
}

export function RbacDeclarePermissions(
    ...permissions: RbacPermissionCandidateInput[]
): MethodDecorator & ClassDecorator {
    const candidates = permissions.map(toPermissionCandidate);
    const permissionCodes = candidates.map((candidate) => candidate.permissionCode);

    return applyDecorators(
        // 权限候选 metadata 只服务 RBAC 权限页面；它不会自动落库，也不会自动授权。
        SetMetadata(RBAC_PERMISSION_CANDIDATES_METADATA_KEY, candidates),
        // 运行时 metadata 只服务 RbacGuard；Guard 会按 permission code 检查 effective 权限集合。
        SetMetadata(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, permissionCodes)
    );
}
