import { PrismaService } from '@app/prisma-admin';
import { Injectable } from '@nestjs/common';
import {
    ADMIN_PREFERENCE_DEFINITIONS,
    ADMIN_PREFERENCE_KEYS,
    type AdminPreferenceKey,
    type AdminPreferenceValue
} from './admin-preference.constants';
import type { UpdateAdminPreferencePolicyDto, UpdateMyAdminPreferencesDto } from './dto/admin-preference.dto';

type PreferencePolicyView = {
    key: AdminPreferenceKey;
    label: string;
    group: string;
    sort: number;
    value: AdminPreferenceValue;
    userEditable: boolean;
};

const PREFERENCE_KEY_SET = new Set<string>(ADMIN_PREFERENCE_KEYS);

@Injectable()
export class AdminPreferencesService {
    constructor(private readonly prismaService: PrismaService) {}

    async queryMyPreferences(userId: string) {
        const policies = await this.ensurePolicies();
        const userValues = await this.queryUserValues(userId);
        const effective: Record<AdminPreferenceKey, AdminPreferenceValue> = {} as Record<
            AdminPreferenceKey,
            AdminPreferenceValue
        >;

        for (const policy of policies) {
            // 管理员关闭 userEditable 后，系统默认值强制生效，个人偏好只保留但不参与计算。
            effective[policy.key] = policy.userEditable ? (userValues[policy.key] ?? policy.value) : policy.value;
        }

        return {
            effective,
            userValues,
            policies: Object.fromEntries(policies.map((policy) => [policy.key, policy])) as Record<
                AdminPreferenceKey,
                PreferencePolicyView
            >
        };
    }

    async updateMyPreferences(userId: string, data: UpdateMyAdminPreferencesDto) {
        const policies = await this.ensurePolicies();
        const editableKeys = new Set(policies.filter((policy) => policy.userEditable).map((policy) => policy.key));
        const entries = Object.entries(data.values).filter(
            (entry): entry is [AdminPreferenceKey, AdminPreferenceValue] =>
                PREFERENCE_KEY_SET.has(entry[0]) && editableKeys.has(entry[0] as AdminPreferenceKey)
        );

        await this.prismaService.$transaction(
            entries.map(([key, value]) =>
                this.prismaService.adminUserPreference.upsert({
                    where: {
                        userId_key: {
                            userId,
                            key
                        }
                    },
                    create: {
                        userId,
                        key,
                        value
                    },
                    update: {
                        value
                    }
                })
            )
        );

        return null;
    }

    async queryPolicies() {
        return await this.ensurePolicies();
    }

    async updatePolicies(data: UpdateAdminPreferencePolicyDto) {
        await this.ensurePolicies();
        const updates = data.policies.filter((policy) => PREFERENCE_KEY_SET.has(policy.key));

        await this.prismaService.$transaction(
            updates.map((policy) =>
                this.prismaService.adminPreferencePolicy.update({
                    where: {
                        key: policy.key
                    },
                    data: {
                        value: policy.value,
                        userEditable: policy.userEditable
                    }
                })
            )
        );

        return null;
    }

    private async ensurePolicies(): Promise<PreferencePolicyView[]> {
        const existing = await this.prismaService.adminPreferencePolicy.findMany({
            orderBy: [{ group: 'asc' }, { sort: 'asc' }]
        });
        const existingKeys = new Set(existing.map((item) => item.key));
        const missingDefinitions = ADMIN_PREFERENCE_DEFINITIONS.filter(
            (definition) => !existingKeys.has(definition.key)
        );

        if (missingDefinitions.length > 0) {
            await this.prismaService.adminPreferencePolicy.createMany({
                data: missingDefinitions.map((definition) => ({
                    key: definition.key,
                    label: definition.label,
                    group: definition.group,
                    sort: definition.sort,
                    value: definition.defaultValue,
                    userEditable: definition.userEditable
                })),
                skipDuplicates: true
            });
        }

        const records =
            missingDefinitions.length > 0
                ? await this.prismaService.adminPreferencePolicy.findMany({
                      orderBy: [{ group: 'asc' }, { sort: 'asc' }]
                  })
                : existing;

        return ADMIN_PREFERENCE_DEFINITIONS.map((definition) => {
            const record = records.find((item) => item.key === definition.key);
            return {
                key: definition.key,
                label: record?.label ?? definition.label,
                group: record?.group ?? definition.group,
                sort: record?.sort ?? definition.sort,
                value: this.normalizeValue(definition.key, record?.value ?? definition.defaultValue),
                userEditable: record?.userEditable ?? definition.userEditable
            };
        }).sort((left, right) => left.sort - right.sort);
    }

    private async queryUserValues(userId: string): Promise<Partial<Record<AdminPreferenceKey, AdminPreferenceValue>>> {
        const rows = await this.prismaService.adminUserPreference.findMany({
            where: {
                userId,
                key: {
                    in: [...ADMIN_PREFERENCE_KEYS]
                }
            }
        });

        return Object.fromEntries(
            rows.map((row) => [row.key, this.normalizeValue(row.key as AdminPreferenceKey, row.value)])
        ) as Partial<Record<AdminPreferenceKey, AdminPreferenceValue>>;
    }

    private normalizeValue(key: AdminPreferenceKey, value: unknown): AdminPreferenceValue {
        const definition = ADMIN_PREFERENCE_DEFINITIONS.find((item) => item.key === key)!;

        if (typeof definition.defaultValue === 'boolean') {
            return typeof value === 'boolean' ? value : definition.defaultValue;
        }
        if (typeof definition.defaultValue === 'number') {
            return typeof value === 'number' && Number.isFinite(value) ? value : definition.defaultValue;
        }
        return typeof value === 'string' ? value : definition.defaultValue;
    }
}
