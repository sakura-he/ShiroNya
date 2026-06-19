import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { SPICEDB_MODULE_OPTIONS } from './constant.js';
import type { SpiceDbModuleOptions, SpiceDbModuleAsyncOptions, SpiceDbModuleOptionsFactory } from './interfaces.js';
import { SpiceDbService } from './service.js';
import { SpiceDbGuard } from './guard.js';

@Global()
@Module({})
export class SpiceDbModule {
  static forRoot(options: SpiceDbModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: SPICEDB_MODULE_OPTIONS,
      useValue: options,
    };

    return {
      module: SpiceDbModule,
      providers: [optionsProvider, SpiceDbService, SpiceDbGuard],
      exports: [SpiceDbService, SpiceDbGuard, SPICEDB_MODULE_OPTIONS],
    };
  }

  static forRootAsync(options: SpiceDbModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: SpiceDbModule,
      imports: options.imports ?? [],
      providers: [...asyncProviders, SpiceDbService, SpiceDbGuard],
      exports: [SpiceDbService, SpiceDbGuard, SPICEDB_MODULE_OPTIONS],
    };
  }

  private static createAsyncProviders(options: SpiceDbModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: SPICEDB_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ];
    }

    const useClass = options.useClass ?? options.useExisting;
    if (!useClass) {
      throw new Error('SpiceDbModule.forRootAsync() requires useFactory, useClass, or useExisting');
    }

    return [
      {
        provide: SPICEDB_MODULE_OPTIONS,
        useFactory: async (factory: SpiceDbModuleOptionsFactory) => factory.createSpiceDbOptions(),
        inject: [useClass],
      },
      ...(options.useClass ? [{ provide: useClass, useClass } as Provider] : []),
    ];
  }
}
