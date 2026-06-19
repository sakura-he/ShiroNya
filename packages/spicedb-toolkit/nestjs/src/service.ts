import { Injectable, Inject } from '@nestjs/common';
import {
  createSpiceDbToolkit,
  loadConfig,
  type SpiceDbToolkit,
  type CheckPermissionInput,
  type CheckPermissionResult,
  type CheckBulkPermissionsInput,
  type CheckBulkPermissionsResult,
  type LookupResourcesInput,
  type LookupResourcesResult,
  type LookupSubjectsInput,
  type LookupSubjectsResult,
  type WriteRelationshipsInput,
  type WriteRelationshipsResult,
  type ReadRelationshipsInput,
  type ReadRelationshipsResult,
  type DeleteRelationshipsInput,
  type DeleteRelationshipsResult,
  type RelationshipInput,
} from '@spicedb-toolkit/core';
import { SPICEDB_MODULE_OPTIONS } from './constant.js';
import type { SpiceDbModuleOptions } from './interfaces.js';

@Injectable()
export class SpiceDbService {
  private toolkit!: SpiceDbToolkit;
  private initialized = false;

  constructor(
    @Inject(SPICEDB_MODULE_OPTIONS) private readonly options: SpiceDbModuleOptions
  ) {}

  private async ensureInitialized(): Promise<SpiceDbToolkit> {
    if (this.initialized) return this.toolkit;

    if (this.options.config) {
      this.toolkit = createSpiceDbToolkit(this.options.config);
    } else if (this.options.configFile) {
      const configPath = typeof this.options.configFile === 'string' ? this.options.configFile : undefined;
      const config = await loadConfig(configPath);
      this.toolkit = createSpiceDbToolkit(config);
    } else if (this.options.client) {
      this.toolkit = createSpiceDbToolkit(this.options.client);
    } else {
      throw new Error('SpiceDbService: No configuration provided. Use config, configFile, or client option.');
    }

    this.initialized = true;
    return this.toolkit;
  }

  async checkPermission(input: CheckPermissionInput): Promise<CheckPermissionResult> {
    const tk = await this.ensureInitialized();
    return tk.permission.checkPermission(input);
  }

  async checkBulkPermissions(input: CheckBulkPermissionsInput): Promise<CheckBulkPermissionsResult> {
    const tk = await this.ensureInitialized();
    return tk.permission.checkBulkPermissions(input);
  }

  async lookupResources(input: LookupResourcesInput): Promise<LookupResourcesResult> {
    const tk = await this.ensureInitialized();
    return tk.permission.lookupResources(input);
  }

  async lookupSubjects(input: LookupSubjectsInput): Promise<LookupSubjectsResult> {
    const tk = await this.ensureInitialized();
    return tk.permission.lookupSubjects(input);
  }

  async writeRelationships(input: WriteRelationshipsInput): Promise<WriteRelationshipsResult> {
    const tk = await this.ensureInitialized();
    return tk.relationship.writeRelationships(input);
  }

  async readRelationships(input: ReadRelationshipsInput): Promise<ReadRelationshipsResult> {
    const tk = await this.ensureInitialized();
    return tk.relationship.readRelationships(input);
  }

  async deleteRelationships(input: DeleteRelationshipsInput): Promise<DeleteRelationshipsResult> {
    const tk = await this.ensureInitialized();
    return tk.relationship.deleteRelationships(input);
  }

  async touchRelationships(relationships: RelationshipInput[]): Promise<WriteRelationshipsResult> {
    const tk = await this.ensureInitialized();
    return tk.relationship.touchRelationships({ relationships });
  }

  async readSchema(): Promise<string> {
    const tk = await this.ensureInitialized();
    const result = await tk.schema.read();
    return result.schemaText;
  }

  async writeSchema(schema: string): Promise<void> {
    const tk = await this.ensureInitialized();
    await tk.schema.write(schema);
  }

  getToolkit(): SpiceDbToolkit | undefined {
    return this.initialized ? this.toolkit : undefined;
  }
}
