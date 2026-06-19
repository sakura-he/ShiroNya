import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ADMIN_PREFERENCE_KEYS } from '../admin-preference.constants';

const AdminPreferenceKeySchema = z.enum(ADMIN_PREFERENCE_KEYS);
const AdminPreferenceValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const AdminPreferencePolicySchema = z.object({
    key: AdminPreferenceKeySchema,
    label: z.string(),
    group: z.string(),
    sort: z.number(),
    value: AdminPreferenceValueSchema,
    userEditable: z.boolean()
});

export const AdminPreferenceEffectiveSchema = z.object({
    effective: z.record(AdminPreferenceKeySchema, AdminPreferenceValueSchema),
    userValues: z.partialRecord(AdminPreferenceKeySchema, AdminPreferenceValueSchema),
    policies: z.record(AdminPreferenceKeySchema, AdminPreferencePolicySchema)
});

export const UpdateMyAdminPreferencesSchema = z.object({
    values: z.partialRecord(AdminPreferenceKeySchema, AdminPreferenceValueSchema)
});

export const QueryAdminPreferencePolicySchema = z.object({});

export const UpdateAdminPreferencePolicySchema = z.object({
    policies: z.array(
        z.object({
            key: AdminPreferenceKeySchema,
            value: AdminPreferenceValueSchema,
            userEditable: z.boolean()
        })
    )
});

export const AdminPreferenceNullSchema = z.null();
export const AdminPreferencePolicyListSchema = z.array(AdminPreferencePolicySchema);

export class AdminPreferencePolicyDto extends createZodDto(AdminPreferencePolicySchema) {}
export class AdminPreferenceEffectiveDto extends createZodDto(AdminPreferenceEffectiveSchema) {}
export class UpdateMyAdminPreferencesDto extends createZodDto(UpdateMyAdminPreferencesSchema) {}
export class QueryAdminPreferencePolicyDto extends createZodDto(QueryAdminPreferencePolicySchema) {}
export class UpdateAdminPreferencePolicyDto extends createZodDto(UpdateAdminPreferencePolicySchema) {}
export class AdminPreferencePolicyListDto extends createZodDto(AdminPreferencePolicyListSchema) {}
export class AdminPreferenceNullDto extends createZodDto(AdminPreferenceNullSchema) {}
