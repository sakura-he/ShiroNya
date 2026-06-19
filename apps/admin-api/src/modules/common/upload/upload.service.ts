import { BusinessException, createRuntimeLogger, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { FileMergeStatus, FileChunk } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { ClearChunksTaskService } from '../../../tasks/clear_chunks_task';

/**
 * 文件上传服务，负责切片校验、切片复用与文件合并。
 */
@Injectable()
export class UploadService {
    private readonly logger = createRuntimeLogger(UploadService.name, {
        module: 'upload',
        domain: 'upload',
        resource: { type: 'upload' }
    });

    constructor(
        private readonly prismaService: PrismaService,
        private readonly clearChunksTaskService: ClearChunksTaskService
    ) {}

    /**
     * 根据用户与合并记录主键查询可访问的合并文件信息。
     */
    async getFileMergeInfo(userId: string | undefined, fileMergeId: number) {
        return await this.prismaService.fileMerge.findFirst({
            where: { id: fileMergeId, userId, isDelete: false },
            omit: {
                createdAt: true,
                isDelete: true,
                refFileId: true
            }
        });
    }

    /**
     * 保存文件切片，并在命中重复切片时复用已有物理文件。
     */
    async saveFileChunk(chunkInfo: any, userId: string) {
        const chunkFilePath = path.join(process.cwd(), 'chunks', chunkInfo.chunk_path);
        await this.validateChunkHash(chunkFilePath, chunkInfo.chunk_hash);
        const existedChunk = await this.findExistedChunk(chunkInfo.chunk_hash);
        const createChunkData = {
            id: undefined,
            userId,
            chunkIndex: chunkInfo.chunk_index,
            chunkHash: chunkInfo.chunk_hash,
            chunkSize: chunkInfo.chunk_size,
            chunkPath: existedChunk ? existedChunk.chunkPath : chunkInfo.chunk_path,
            chunkName: existedChunk ? existedChunk.chunkName : chunkInfo.chunk_name,
            fileSize: chunkInfo.file_size,
            fileType: chunkInfo.file_type,
            fileHash: chunkInfo.file_hash,
            fileChunksLength: chunkInfo.file_chunks_length,
            fileName: chunkInfo.file_name,
            fileUid: chunkInfo.file_uid,
            isDelete: false,
            refChunkId: existedChunk ? existedChunk.id : null
        };

        return await this.prismaService.fileChunk.create({
            data: createChunkData,
            omit: {
                createdAt: true,
                fileMergeId: true,
                fileUid: true,
                isDelete: true,
                refChunkId: true
            }
        });
    }

    /**
     * 根据切片哈希查找首个原始切片，用于跨用户复用相同切片文件。
     */
    private async findExistedChunk(chunkHash: string) {
        return this.prismaService.fileChunk.findFirst({
            where: {
                chunkHash,
                refChunkId: null
            },
            omit: {
                createdAt: true,
                fileMergeId: true,
                fileName: true,
                fileUid: true,
                isDelete: true,
                refChunkId: true
            }
        });
    }

    /**
     * 读取磁盘切片并校验前端声明的哈希值。
     */
    private async validateChunkHash(chunkPath: string, expectedHash: string): Promise<void> {
        const chunkBuffer = await fsp.readFile(chunkPath);
        const actualHash = createHash('md5').update(chunkBuffer).digest('hex');

        if (actualHash !== expectedHash) {
            throw new BusinessException(ErrorCodes.FILE.CHUNK_HASH_NOT_MATCH);
        }
    }

    /**
     * 合并指定用户的全部切片记录，并在可复用时直接复用已完成的合并文件。
     */
    async mergeFileChunks(userId: string, fileUID: string) {
        const fileChunks = await this.getChunkByFileUID(userId, fileUID);
        const chunksToConnect = [...fileChunks];
        const lastChunk = fileChunks[fileChunks.length - 1];
        const fileHash = lastChunk.fileHash;

        if (fileChunks.length !== fileChunks[0].fileChunksLength) {
            throw new BusinessException(ErrorCodes.FILE.CHUNK_NOT_UPLOADED);
        }

        const existedMergedFile = await this.prismaService.fileMerge.findFirst({
            where: { fileHash, refFileId: null, status: FileMergeStatus.MERGE_SUCCESS },
            omit: {
                createdAt: true,
                fileName: true,
                isDelete: true,
                refFileId: true,
                userId: true
            }
        });

        if (existedMergedFile) {
            const mergedFileRef = await this.prismaService.fileMerge.create({
                data: {
                    ...existedMergedFile,
                    id: undefined,
                    userId,
                    fileName: lastChunk.fileName,
                    isDelete: false,
                    fileUid: lastChunk.fileUid,
                    refFileId: existedMergedFile.id,
                    fileChunks: {
                        connect: chunksToConnect.map((chunk) => ({ id: chunk.id }))
                    }
                },
                omit: {
                    createdAt: true,
                    isDelete: true,
                    refFileId: true
                }
            });

            await this.clearMergeChunks(fileUID);
            return mergedFileRef;
        }

        const chunksDir = path.join(process.cwd(), 'chunks');
        const uploadDateTime = dayjs(lastChunk.createdAt);
        const mergePath = path.join('merge', uploadDateTime.format('YYYY/MM/DD'));
        const mergeDirFullPath = path.resolve(process.cwd(), mergePath);
        const mergedFileName = `${uploadDateTime.format('HH:mm:ss')}-${Math.floor(Math.random() * 10000)}-${lastChunk.fileName}`;
        const mergeFileFullPath = path.join(mergeDirFullPath, mergedFileName);
        if (!fs.existsSync(mergeDirFullPath)) {
            fs.mkdirSync(mergeDirFullPath, { recursive: true });
        }

        const mergeFile = await this.prismaService.fileMerge.create({
            data: {
                fileHash: lastChunk.fileHash,
                fileName: lastChunk.fileName,
                filePath: path.join(mergePath, mergedFileName),
                fileSize: lastChunk.fileSize,
                fileType: lastChunk.fileType,
                fileUid: fileUID,
                refFileId: null,
                userId,
                status: FileMergeStatus.MERGE_ING
            }
        });

        const mergeStream = fs.createWriteStream(mergeFileFullPath);
        const pendingChunks = [...fileChunks];

        /**
         * 递归顺序写入切片，并实时刷新合并进度。
         */
        const processChunk = async (): Promise<void> => {
            try {
                if (pendingChunks.length === 0) {
                    mergeStream.end();
                    return;
                }

                const chunk = pendingChunks.shift();
                if (!chunk) {
                    mergeStream.end();
                    return;
                }

                const mergeProgress = Math.floor(
                    ((chunksToConnect.length - pendingChunks.length) / chunksToConnect.length) * 100
                );
                await this.prismaService.fileMerge.update({
                    where: { id: mergeFile.id },
                    data: { mergeProgress }
                });

                const chunkPath = path.join(chunksDir, chunk.chunkPath);
                const readStream = fs.createReadStream(chunkPath);

                // 读取切片失败时直接标记合并失败，避免留下“进行中”的脏状态。
                readStream.on('error', async (error) => {
                    await this.prismaService.fileMerge.update({
                        where: { id: mergeFile.id },
                        data: {
                            status: FileMergeStatus.MERGE_FAILED,
                            errorMsg: `切片 ${chunk.chunkPath} 读取失败: ${error.message}`
                        }
                    });
                    mergeStream.destroy(error);
                });

                readStream.pipe(mergeStream, { end: false });
                readStream.on('end', () => {
                    void processChunk();
                });
            } catch (error) {
                // 保留完整调用：error 级别且 context 含 error 字段，需要落盘 error.stack 进 RuntimeLogEntry.error
                this.logger.error('处理切片过程出错', {
                    error
                });
                await this.prismaService.fileMerge.update({
                    where: { id: mergeFile.id },
                    data: {
                        status: FileMergeStatus.MERGE_FAILED,
                        errorMsg: error instanceof Error ? error.message : '未知错误'
                    }
                });
                mergeStream.destroy(error instanceof Error ? error : undefined);
            }
        };

        // 合并输出流失败时更新数据库状态，避免前端反复轮询。
        mergeStream.on('error', async (error) => {
            await this.prismaService.fileMerge.update({
                where: { id: mergeFile.id },
                data: {
                    status: FileMergeStatus.MERGE_FAILED,
                    errorMsg: error.message
                }
            });
            mergeStream.destroy();
        });

        // 合并完成后回填成功状态并清理临时切片。
        mergeStream.on('finish', async () => {
            try {
                const fileInfo = await this.prismaService.fileMerge.update({
                    where: { id: mergeFile.id },
                    data: {
                        status: FileMergeStatus.MERGE_SUCCESS,
                        mergeProgress: 100,
                        fileChunks: {
                            connect: chunksToConnect.map((chunk) => ({ id: chunk.id }))
                        }
                    }
                });
                await this.clearMergeChunks(fileInfo.fileUid);
            } catch (error) {
                // 保留完整调用：error 级别且 context 含 error 字段，需要落盘 error.stack 进 RuntimeLogEntry.error
                this.logger.error('更新合并文件状态失败', {
                    error
                });
                await this.prismaService.fileMerge.update({
                    where: { id: mergeFile.id },
                    data: {
                        status: FileMergeStatus.MERGE_FAILED,
                        errorMsg: `文件合并成功但更新数据库失败:${(error as Error).message}`
                    }
                });
            }
        });

        await processChunk();
        return mergeFile;
    }

    /**
     * 查询当前用户某个文件 UID 对应的全部切片。
     */
    async getChunkByFileUID(userId: string, fileUID: string): Promise<FileChunk[]> {
        const fileChunks = await this.prismaService.fileChunk.findMany({
            where: { fileUid: fileUID, userId },
            orderBy: { chunkIndex: 'asc' }
        });

        if (fileChunks.length === 0) {
            throw new BusinessException(ErrorCodes.FILE.CHUNK_NOT_FOUND);
        }
        return fileChunks;
    }

    /**
     * 清理合并完成后对应的切片记录与磁盘文件。
     */
    async clearMergeChunks(fileUID: string) {
        const currentFileChunks = await this.prismaService.fileChunk.findMany({
            where: { fileUid: fileUID }
        });

        if (!currentFileChunks.length) {
            return;
        }

        const chunkGroups: {
            originChunks: FileChunk[];
            refChunks: FileChunk[];
        } = {
            originChunks: [],
            refChunks: []
        };

        currentFileChunks.forEach((chunk) => {
            if (chunk.refChunkId !== null) {
                chunkGroups.refChunks.push(chunk);
                return;
            }
            chunkGroups.originChunks.push(chunk);
        });

        this.logger.debug.title('切片分组结果', {
            chunkGroups
        });

        if (chunkGroups.refChunks.length) {
            await this.prismaService.fileChunk.deleteMany({
                where: { id: { in: chunkGroups.refChunks.map((chunk) => chunk.id) } }
            });
        }

        if (chunkGroups.originChunks.length) {
            const referencingOriginChunks = await this.prismaService.fileChunk.findMany({
                where: {
                    refChunkId: { in: chunkGroups.originChunks.map((chunk) => chunk.id) }
                },
                select: {
                    refChunkId: true
                }
            });
            const referencingOriginChunkIds = [...new Set(referencingOriginChunks.map((chunk) => chunk.refChunkId))];
            this.logger.debug.title('原始切片被引用情况', {
                referencingOriginChunkIds
            });

            if (referencingOriginChunkIds.length) {
                await this.prismaService.fileChunk.updateMany({
                    where: { id: { in: referencingOriginChunkIds.filter((id): id is number => id !== null) } },
                    data: {
                        isDelete: true
                    }
                });
            }

            const notReferencingOriginChunks = chunkGroups.originChunks.filter(
                (chunk) => !referencingOriginChunkIds.includes(chunk.id)
            );
            if (notReferencingOriginChunks.length) {
                const deletedChunks = await this.prismaService.fileChunk.deleteMany({
                    where: { id: { in: notReferencingOriginChunks.map((chunk) => chunk.id) } }
                });
                notReferencingOriginChunks.forEach((chunk) => {
                    const chunkPath = path.join(process.cwd(), 'chunks', chunk.chunkPath);
                    if (fs.existsSync(chunkPath)) {
                        fs.unlinkSync(chunkPath);
                    }
                });
                this.logger.debug.title('切片删除成功', {
                    deletedChunks
                });
            }
        }
    }

    /**
     * 预留上传服务的调试入口。
     */
    async test(fileHash: string) {
        return {
            fileHash,
            scheduled: Boolean(this.clearChunksTaskService)
        };
    }
}
