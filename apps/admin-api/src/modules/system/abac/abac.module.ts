import { CerbosAbacModule } from '@app/cerbos-abac';
import { PrismaModule, PrismaService } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { SystemAbacControlController } from './abac-control.controller';

@Module({
    imports: [
        PrismaModule,
        CerbosAbacModule.forRoot({
            appName: 'admin-api',
            cerbosEnvPrefix: 'ADMIN_',
            prismaServiceToken: PrismaService,
            imports: [PrismaModule]
        })
    ],
    controllers: [SystemAbacControlController]
})
export class SystemAbacModule {}
