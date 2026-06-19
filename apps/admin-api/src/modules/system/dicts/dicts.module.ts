import { PrismaModule, PrismaService } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { SystemDictsController } from './dicts.controller';
import { SystemDictsService } from './dicts.service';

@Module({
    imports: [PrismaModule],
    controllers: [SystemDictsController],
    providers: [SystemDictsService]
})
export class SystemDictsModule {}
