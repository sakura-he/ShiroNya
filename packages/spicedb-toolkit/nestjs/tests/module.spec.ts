import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpiceDbModule } from '../src/module.js';
import { SPICEDB_MODULE_OPTIONS } from '../src/constant.js';
import { SpiceDbService } from '../src/service.js';
import { SpiceDbGuard } from '../src/guard.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));

describe('SpiceDbModule', () => {
  it('forRoot should return a dynamic module with providers', () => {
    const module = SpiceDbModule.forRoot({
      client: { endpoint: 'localhost:50051', token: 'test' },
    });

    expect(module.module).toBe(SpiceDbModule);
    expect(module.providers).toBeDefined();
    expect(module.exports).toContain(SpiceDbService);
    expect(module.exports).toContain(SpiceDbGuard);
    expect(module.exports).toContain(SPICEDB_MODULE_OPTIONS);
  });

  it('forRootAsync with useFactory', () => {
    const module = SpiceDbModule.forRootAsync({
      useFactory: () => ({
        client: { endpoint: 'localhost:50051', token: 'test' },
      }),
    });

    expect(module.module).toBe(SpiceDbModule);
    expect(module.providers).toBeDefined();
    expect(module.providers!.length).toBeGreaterThanOrEqual(3);
  });

  it('forRootAsync throws without useFactory/useClass/useExisting', () => {
    expect(() => SpiceDbModule.forRootAsync({})).toThrow(
      'SpiceDbModule.forRootAsync() requires useFactory, useClass, or useExisting'
    );
  });

  it('nestjs package build should emit constructor metadata required by Nest dependency injection', () => {
    const nestjsTsconfig = JSON.parse(
      readFileSync(resolve(testDir, '../tsconfig.json'), 'utf8')
    );
    const workspacePackageJson = JSON.parse(
      readFileSync(resolve(testDir, '../../../package.json'), 'utf8')
    );

    expect(nestjsTsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(nestjsTsconfig.compilerOptions.emitDecoratorMetadata).toBe(true);
    expect(workspacePackageJson.devDependencies['@swc/core']).toBeDefined();
  });
});
