import { RbacStatus } from '@app/prisma-app/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    CORE_MANAGER_RELATION_TYPES,
    CORE_MANAGER_RESOURCE_TYPES
} from '../../spicedb/core-manager-authz.constants';
import { SpiceDbSchemaDefinitionSchema } from '../../system/spicedb-data/dto/spicedb-data.dto';

export const AuthzPermissionCoreManagerResourceTypeSchema = z.enum(CORE_MANAGER_RESOURCE_TYPES);
export const AuthzPermissionCoreManagerRelationSchema = z.enum(CORE_MANAGER_RELATION_TYPES);

export const AuthzPermissionRoleSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable(),
    status: z.enum(RbacStatus),
    viewerCanUpdate: z.boolean(),
    viewerCanAssignTaskCapability: z.boolean(),
    viewerCanAssignTaskResource: z.boolean()
});
export class AuthzPermissionRoleDto extends createZodDto(AuthzPermissionRoleSchema) {}

export const AuthzPermissionSchemaDefinitionSchema = SpiceDbSchemaDefinitionSchema.extend({
    configurable: z.boolean(),
    displayName: z.string(),
    authorizationEnabled: z.boolean()
});
export class AuthzPermissionSchemaDefinitionDto extends createZodDto(AuthzPermissionSchemaDefinitionSchema) {}

export const AuthzPermissionRelationAssignmentSchema = z.object({
    relation: AuthzPermissionCoreManagerRelationSchema,
    label: z.string(),
    roleIds: z.array(z.number().int().positive()),
    editableRoleIds: z.array(z.number().int().positive())
});
export class AuthzPermissionRelationAssignmentDto extends createZodDto(AuthzPermissionRelationAssignmentSchema) {}

export const AuthzPermissionManagerModuleSchema = z.object({
    resourceType: AuthzPermissionCoreManagerResourceTypeSchema,
    displayName: z.string(),
    relations: z.array(AuthzPermissionRelationAssignmentSchema)
});
export class AuthzPermissionManagerModuleDto extends createZodDto(AuthzPermissionManagerModuleSchema) {}

export const AuthzPermissionMatrixSchema = z.object({
    definitions: z.array(AuthzPermissionSchemaDefinitionSchema),
    roles: z.array(AuthzPermissionRoleSchema),
    modules: z.array(AuthzPermissionManagerModuleSchema)
});
export class AuthzPermissionMatrixDto extends createZodDto(AuthzPermissionMatrixSchema) {}

export const AuthzPermissionMatrixChangeSchema = z.object({
    resourceType: AuthzPermissionCoreManagerResourceTypeSchema,
    relation: AuthzPermissionCoreManagerRelationSchema,
    previousRoleIds: z.array(z.coerce.number().int().positive()),
    nextRoleIds: z.array(z.coerce.number().int().positive())
});

export const AuthzPermissionImpactModeSchema = z.enum(['summary', 'precise']);

export const PreviewAuthzPermissionMatrixSchema = z.object({
    changes: z.array(AuthzPermissionMatrixChangeSchema).min(1).max(100),
    impactMode: AuthzPermissionImpactModeSchema.default('summary')
});
export class PreviewAuthzPermissionMatrixDto extends createZodDto(PreviewAuthzPermissionMatrixSchema) {}

export const ApplyAuthzPermissionMatrixSchema = PreviewAuthzPermissionMatrixSchema.extend({
    confirmedLargeChange: z.boolean().optional()
});
export class ApplyAuthzPermissionMatrixDto extends createZodDto(ApplyAuthzPermissionMatrixSchema) {}

export const AuthzPermissionNormalizedMatrixChangeSchema = AuthzPermissionMatrixChangeSchema.extend({
    createRoleIds: z.array(z.number().int().positive()),
    deleteRoleIds: z.array(z.number().int().positive())
});

export const AuthzPermissionAffectedUserSampleSchema = z.object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string()
});

export const AuthzPermissionMatrixPreviewSchema = z.object({
    normalizedChanges: z.array(AuthzPermissionNormalizedMatrixChangeSchema),
    impactMode: AuthzPermissionImpactModeSchema,
    createCount: z.number().int().min(0),
    deleteCount: z.number().int().min(0),
    affectedRoleCount: z.number().int().min(0),
    affectedUserCount: z.number().int().min(0).nullable(),
    affectedGroupCount: z.number().int().min(0),
    directUserAssignmentCount: z.number().int().min(0),
    affectedUserEstimate: z.number().int().min(0),
    affectedRolesSample: z.array(AuthzPermissionRoleSchema),
    affectedUsersSample: z.array(AuthzPermissionAffectedUserSampleSchema),
    confirmationReasons: z.array(z.string()),
    requiresConfirmation: z.boolean()
});
export class AuthzPermissionMatrixPreviewDto extends createZodDto(AuthzPermissionMatrixPreviewSchema) {}

export const RenameAuthzPermissionResourceSchema = z.object({
    resourceType: z.string().trim().min(1).max(64),
    displayName: z.string().trim().min(1).max(191),
    authorizationEnabled: z.boolean().optional()
});
export class RenameAuthzPermissionResourceDto extends createZodDto(RenameAuthzPermissionResourceSchema) {}

export type AuthzPermissionCoreManagerResourceType = z.infer<typeof AuthzPermissionCoreManagerResourceTypeSchema>;
export type AuthzPermissionCoreManagerRelation = z.infer<typeof AuthzPermissionCoreManagerRelationSchema>;
export type PreviewAuthzPermissionMatrixType = z.infer<typeof PreviewAuthzPermissionMatrixSchema>;
export type ApplyAuthzPermissionMatrixType = z.infer<typeof ApplyAuthzPermissionMatrixSchema>;
export type RenameAuthzPermissionResourceType = z.infer<typeof RenameAuthzPermissionResourceSchema>;
