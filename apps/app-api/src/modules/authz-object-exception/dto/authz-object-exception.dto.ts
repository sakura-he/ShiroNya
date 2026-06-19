import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    AUTHZ_OBJECT_EXCEPTION_RESOURCE_TYPES,
    AUTHZ_OBJECT_SUBJECT_KINDS
} from '../../spicedb/object-exception-authz.constants';

export const AuthzObjectExceptionResourceTypeSchema = z.enum(AUTHZ_OBJECT_EXCEPTION_RESOURCE_TYPES);
export const AuthzObjectExceptionSubjectKindSchema = z.enum(AUTHZ_OBJECT_SUBJECT_KINDS);

export const AuthzObjectExceptionSubjectSchema = z.object({
    kind: AuthzObjectExceptionSubjectKindSchema,
    id: z.string().trim().min(1).max(191)
});

export const AuthzObjectExceptionQuerySchema = z.object({
    resourceType: AuthzObjectExceptionResourceTypeSchema,
    resourceId: z.string().trim().min(1).max(191)
});
export class AuthzObjectExceptionQueryDto extends createZodDto(AuthzObjectExceptionQuerySchema) {}

export const AuthzObjectExceptionChangeSchema = z.object({
    relation: z.string().trim().min(1).max(64),
    previousSubjects: z.array(AuthzObjectExceptionSubjectSchema),
    nextSubjects: z.array(AuthzObjectExceptionSubjectSchema)
});

export const AuthzObjectExceptionImpactModeSchema = z.enum(['summary', 'precise']);

export const PreviewAuthzObjectExceptionBindingsSchema = AuthzObjectExceptionQuerySchema.extend({
    changes: z.array(AuthzObjectExceptionChangeSchema).min(1).max(100),
    impactMode: AuthzObjectExceptionImpactModeSchema.default('summary')
});
export class PreviewAuthzObjectExceptionBindingsDto extends createZodDto(
    PreviewAuthzObjectExceptionBindingsSchema
) {}

export const ApplyAuthzObjectExceptionBindingsSchema = PreviewAuthzObjectExceptionBindingsSchema.extend({
    confirmedLargeChange: z.boolean().optional()
});
export class ApplyAuthzObjectExceptionBindingsDto extends createZodDto(ApplyAuthzObjectExceptionBindingsSchema) {}

export const AuthzObjectExceptionRelationViewSchema = z.object({
    relation: z.string(),
    label: z.string(),
    subjects: z.array(AuthzObjectExceptionSubjectSchema),
    preferredSubjectKind: z.literal('role_assigned')
});

export const AuthzObjectExceptionBindingsSchema = AuthzObjectExceptionQuerySchema.extend({
    editable: z.boolean(),
    relations: z.array(AuthzObjectExceptionRelationViewSchema)
});
export class AuthzObjectExceptionBindingsDto extends createZodDto(AuthzObjectExceptionBindingsSchema) {}

export const AuthzObjectExceptionNormalizedChangeSchema = z.object({
    relation: z.string(),
    previousSubjects: z.array(AuthzObjectExceptionSubjectSchema),
    nextSubjects: z.array(AuthzObjectExceptionSubjectSchema),
    createSubjects: z.array(AuthzObjectExceptionSubjectSchema),
    deleteSubjects: z.array(AuthzObjectExceptionSubjectSchema)
});

export const AuthzObjectExceptionAffectedUserSampleSchema = z.object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string()
});

export const AuthzObjectExceptionPreviewSchema = AuthzObjectExceptionQuerySchema.extend({
    normalizedChanges: z.array(AuthzObjectExceptionNormalizedChangeSchema),
    impactMode: AuthzObjectExceptionImpactModeSchema,
    createCount: z.number().int().min(0),
    deleteCount: z.number().int().min(0),
    affectedUserCount: z.number().int().min(0).nullable(),
    affectedRoleCount: z.number().int().min(0),
    affectedGroupCount: z.number().int().min(0),
    directUserAssignmentCount: z.number().int().min(0),
    affectedUserEstimate: z.number().int().min(0),
    affectedUsersSample: z.array(AuthzObjectExceptionAffectedUserSampleSchema),
    confirmationReasons: z.array(z.string()),
    requiresConfirmation: z.boolean(),
    preferredSubjectKind: z.literal('role_assigned')
});
export class AuthzObjectExceptionPreviewDto extends createZodDto(AuthzObjectExceptionPreviewSchema) {}

export type AuthzObjectExceptionSubjectType = z.infer<typeof AuthzObjectExceptionSubjectSchema>;
export type AuthzObjectExceptionQueryType = z.infer<typeof AuthzObjectExceptionQuerySchema>;
export type PreviewAuthzObjectExceptionBindingsType = z.infer<typeof PreviewAuthzObjectExceptionBindingsSchema>;
export type ApplyAuthzObjectExceptionBindingsType = z.infer<typeof ApplyAuthzObjectExceptionBindingsSchema>;
