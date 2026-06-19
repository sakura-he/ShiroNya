import type { ExecutionContext, ModuleMetadata, Type } from '@nestjs/common';
import type { SpiceDbClientOptions, SpiceDbToolkitConfig } from '@spicedb-toolkit/core';

// Subject / Resource value types
export interface SpiceDbSubject {
  type: string;
  id: string;
  relation?: string;
}

export interface SpiceDbResource {
  type: string;
  id: string;
}

// Resolver function types
export type SubjectResolver = (ctx: ExecutionContext) => SpiceDbSubject | string | Promise<SpiceDbSubject | string>;
export type ResourceResolver = (ctx: ExecutionContext) => SpiceDbResource | string | Promise<SpiceDbResource | string>;

// Resolvers configuration
export interface SpiceDbResolversConfig {
  subject: SubjectResolver;
  resource?: ResourceResolver;
}

// Permission metadata stored by @SpiceDbPermission.
export interface SpiceDbPermissionMetadata {
  permission: string;
  permissions?: string[];
  mode?: 'AND' | 'OR';
  resourceType?: string;
  resourceId?: string | ((ctx: ExecutionContext) => string | Promise<string>);
  subject?: string | SpiceDbSubject | ((ctx: ExecutionContext) => SpiceDbSubject | string | Promise<SpiceDbSubject | string>);
}

// Module options
export interface SpiceDbModuleOptions {
  // Option 1: Full toolkit config
  config?: SpiceDbToolkitConfig;
  // Option 2: Load from config file
  configFile?: boolean | string;
  // Option 3: Direct client options
  client?: SpiceDbClientOptions;
  // Global resolvers
  resolvers?: SpiceDbResolversConfig;
  // Guard behavior
  defaultGuardBehavior?: 'throw' | 'deny';
}

// Async module options
export interface SpiceDbModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (...args: unknown[]) => SpiceDbModuleOptions | Promise<SpiceDbModuleOptions>;
  inject?: any[];
  useClass?: Type<SpiceDbModuleOptionsFactory>;
  useExisting?: Type<SpiceDbModuleOptionsFactory>;
}

export interface SpiceDbModuleOptionsFactory {
  createSpiceDbOptions(): SpiceDbModuleOptions | Promise<SpiceDbModuleOptions>;
}
