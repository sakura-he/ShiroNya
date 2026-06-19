import { createRuntimeLogger } from '@app/common';
import {
    Body,
    Controller,
    ParseFilePipeBuilder,
    ParseIntPipe,
    Post,
    Query,
    UploadedFile,
    UploadedFiles,
    UseInterceptors
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import dayjs from 'dayjs';
import { existsSync, mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { join as pathJoin, relative } from 'node:path';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { UploadService } from './upload.service';

/**
 * 复用上传拦截器的磁盘存储配置。
 */
const FileInterceptorOptions = (filePath: string) => ({
    storage: diskStorage({
        /**
         * 按日期创建上传目录，避免文件直接堆在根目录下。
         */
        destination(_req, _file, cb) {
            const uploadDir = `./${filePath}/${dayjs().format('YYYY/MM/DD')}`;
            const destinationDir = pathJoin(process.cwd(), uploadDir);
            if (!existsSync(destinationDir)) {
                mkdirSync(destinationDir, { recursive: true });
            }
            cb(null, destinationDir);
        },

        /**
         * 生成上传文件名，保留原始文件名便于人工排查。
         */
        filename(_req, file, cb) {
            const filename = `${file.fieldname}-${dayjs().format('HH:mm:ss')}-${Math.floor(Math.random() * 10000)}-${file.originalname}`;
            cb(null, filename);
        }
    })
});

/**
 * 文件上传控制器，统一从 Better Auth session 取当前后台用户。
 */
@Controller()
export class UploadController {
    private readonly logger = createRuntimeLogger(UploadController.name, {
        domain: 'upload',
        resource: { type: 'upload' }
    });

    constructor(private readonly uploadService: UploadService) {}

    /**
     * 上传单个完整文件。
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file', FileInterceptorOptions('uploads')))
    uploadFile(
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addMaxSizeValidator({
                    maxSize: 1024 * 1024 * 999,
                    message: '文件大小超过限制'
                })
                .build()
        )
        file: Express.Multer.File
    ) {
        const path = relative(pathJoin(process.cwd(), 'uploads'), file.path);
        return {
            file_url: path
        };
    }

    /**
     * 批量上传多个完整文件。
     */
    @Post('uploads')
    @UseInterceptors(FilesInterceptor('file', 9, FileInterceptorOptions('uploads')))
    uploadFiles(
        @UploadedFiles(
            new ParseFilePipeBuilder()
                .addMaxSizeValidator({
                    maxSize: 1024 * 1024 * 999,
                    message: '文件大小超过限制'
                })
                .build()
        )
        files: Express.Multer.File[]
    ) {
        const paths = files.map((file) => relative(pathJoin(process.cwd(), 'uploads'), file.path));
        return {
            file_url: paths
        };
    }

    /**
     * 上传文件切片并绑定到当前登录后台用户。
     */
    @Post('upload_chunk')
    @UseInterceptors(FileInterceptor('chunk', FileInterceptorOptions('chunks')))
    async uploadFileChunk(
        @Session() session: BetterAuthSession,
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addMaxSizeValidator({
                    maxSize: 1024 * 1024 * 999,
                    message: '文件大小超过限制'
                })
                .build()
        )
        file: Express.Multer.File,
        @Body('chunk_hash') chunkHash: string,
        @Body('chunk_index', ParseIntPipe) chunkIndex: number,
        @Body('file_chunks_length', ParseIntPipe) fileChunksLength: number,
        @Body('file_hash') fileHash: string,
        @Body('file_name') fileName: string,
        @Body('file_size', ParseIntPipe) fileSize: number,
        @Body('file_type') fileType: string,
        @Body('file_uid') fileUid: string
    ) {
        this.logger.debug.title('上传文件切片请求', { fileUid, userId: session.user.id });
        const path = relative(pathJoin(process.cwd(), 'chunks'), file.path);
        const chunkInfo = {
            chunk_hash: chunkHash,
            chunk_index: chunkIndex,
            chunk_name: file.filename,
            chunk_path: path,
            chunk_size: file.size,
            file_hash: fileHash,
            file_name: fileName,
            file_size: fileSize,
            file_type: fileType,
            file_chunks_length: fileChunksLength,
            file_uid: fileUid
        };
        await this.uploadService.saveFileChunk(chunkInfo, session.user.id);

        return {
            file_url: path
        };
    }

    /**
     * 合并当前登录用户已上传的切片。
     */
    @Post('merge_chunks')
    async mergeChunks(@Session() session: BetterAuthSession, @Body('file_uid') fileUid: string) {
        return await this.uploadService.mergeFileChunks(session.user.id, fileUid);
    }

    /**
     * 获取当前登录用户指定文件 UID 的切片信息。
     */
    @Post('get_chunk_by_file_uid')
    async getChunkByFileUID(@Session() session: BetterAuthSession, @Query('file_uid') fileUID: string) {
        return this.uploadService.getChunkByFileUID(session.user.id, fileUID);
    }

    /**
     * 测试上传服务的辅助接口。
     */
    @Post('test')
    async test(@Body('file_hash') fileHash: string) {
        return this.uploadService.test(fileHash);
    }
}
