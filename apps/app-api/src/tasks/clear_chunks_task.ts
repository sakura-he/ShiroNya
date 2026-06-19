// 清理切片任务
import { UploadService } from '../modules/common/upload/upload.service';
import { createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FileMergeStatus } from '@app/prisma-app/generated/client';
@Injectable()
export class ClearChunksTaskService implements OnModuleInit {
    private readonly logger = createRuntimeLogger('ClearChunksTask');
    uploadService: any;
    constructor(private readonly moduleRef: ModuleRef) {}
    onModuleInit() {
        this.logger.info.title('[bootstrap] ClearChunksTaskService.onModuleInit start');
        this.prismaService = this.moduleRef.get(PrismaService, { strict: false });
        this.uploadService = this.moduleRef.get(UploadService, { strict: false });
        this.logger.info.title('[bootstrap] ClearChunksTaskService.onModuleInit done');
    }
    private prismaService!: PrismaService;
    clearMergeFilesChunksTask = async () => {
        // 查询所有完成合并的文件 fileUid userId
        const MergeFiles = await this.prismaService.fileMerge.findMany({
            where: {
                status: FileMergeStatus.MERGE_SUCCESS
            },
            select: {
                fileUid: true,
                userId: true
            }
        });
        const ClearChunkTask = MergeFiles.map((mergeFile) => {
            return this.uploadService.clearMergeChunks(mergeFile.userId, mergeFile.fileUid);
        });
        await Promise.all(ClearChunkTask);
    };
}
