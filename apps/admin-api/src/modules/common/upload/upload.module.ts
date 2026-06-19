import { PrismaModule, PrismaService } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ClearChunksTaskService } from '../../../tasks/clear_chunks_task';

@Module({
    imports: [PrismaModule],
    controllers: [UploadController],
    providers: [UploadService, ClearChunksTaskService]
})
export class UploadModule {
    constructor() {}
}
