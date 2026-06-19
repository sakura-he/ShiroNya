import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AdminPreferencesController } from './admin-preferences.controller';
import { AdminPreferencesService } from './admin-preferences.service';

@Module({
    imports: [PrismaModule],
    controllers: [AdminPreferencesController],
    providers: [AdminPreferencesService],
    exports: [AdminPreferencesService]
})
export class AdminPreferencesModule {}
