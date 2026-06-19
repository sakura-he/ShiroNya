import { readFileSync } from 'node:fs';
import { CORE_MANAGER_RELATIONS } from './core-manager-authz.constants';
import { AUTHZ_OBJECT_EXCEPTION_RELATIONS } from './object-exception-authz.constants';

const schema = readFileSync('spicedb/schema.zed', 'utf8');

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDefinitionBlock(definitionName: string): string {
    const match = schema.match(
        new RegExp(`^definition\\s+${escapeRegExp(definitionName)}\\s*\\{([\\s\\S]*?)^\\}`, 'm')
    );
    if (!match?.[1]) {
        throw new Error(`schema definition not found: ${definitionName}`);
    }
    return match[1];
}

function getDefinitionNames(): string[] {
    return Array.from(schema.matchAll(/^definition\s+(\w+)\s*\{/gm), (match) => match[1]);
}

function getRelationNames(definitionName: string): string[] {
    return Array.from(getDefinitionBlock(definitionName).matchAll(/^\s*relation\s+(\w+):/gm), (match) => match[1]);
}

function getPermissionNames(definitionName: string): string[] {
    return Array.from(getDefinitionBlock(definitionName).matchAll(/^\s*permission\s+(\w+)\s*=/gm), (match) => match[1]);
}

function sortStrings(values: readonly string[]): string[] {
    return [...values].sort((a, b) => a.localeCompare(b));
}

describe('SpiceDB schema 与 TS 权限常量防漂移', () => {
    it('schema 中的核心 manager definition 应与 CORE_MANAGER_RELATIONS 完全一致', () => {
        const managerDefinitions = getDefinitionNames().filter((definitionName) => definitionName.endsWith('_manager'));

        expect(sortStrings(managerDefinitions)).toEqual(sortStrings(Object.keys(CORE_MANAGER_RELATIONS)));

        for (const [resourceType, relations] of Object.entries(CORE_MANAGER_RELATIONS)) {
            const schemaRelations = getRelationNames(resourceType).filter((relation) => relation !== 'system');

            expect(sortStrings(schemaRelations)).toEqual(sortStrings(relations));
        }
    });

    it('核心 manager schema 应统一提供 list = view 语义', () => {
        for (const resourceType of Object.keys(CORE_MANAGER_RELATIONS)) {
            expect(getPermissionNames(resourceType)).toContain('list');
            expect(getDefinitionBlock(resourceType)).toMatch(/^\s*permission\s+list\s*=\s*view\s*$/m);
        }
    });

    it('对象例外授权 relation 白名单应全部存在于对应 schema definition', () => {
        for (const [resourceType, config] of Object.entries(AUTHZ_OBJECT_EXCEPTION_RELATIONS)) {
            const schemaRelations = new Set(getRelationNames(resourceType));

            expect(Object.keys(CORE_MANAGER_RELATIONS)).toContain(config.managerResourceType);
            for (const relation of config.relations) {
                expect(schemaRelations.has(relation)).toBe(true);
            }
        }
    });
});
