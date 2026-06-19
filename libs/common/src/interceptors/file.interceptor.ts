import { BadRequestException, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import dayjs from 'dayjs';
import { Request } from 'express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { FileFilterMetadataOptions } from '../decorators/file-filter-metadata.decorator';

export function CustomFileInterceptor(fieldName: string) {
    return FileInterceptor(fieldName, {
        fileFilter: async (req: Request, file, cb) => {
            let fileMetadata = Reflect.getMetadata('__file_filter_metadata__', req) as FileFilterMetadataOptions;
            let canValid = await new FileTypeValidator({
                fileType: fileMetadata.fileType!
            }).isValid(file);
            let error: Error | null = null;
            if (!canValid) {
                error = new BadRequestException(
                    `文件类型错误! 当前上传文件类型: ${file.mimetype} 不满足 ${fileMetadata.fileType} 类型`
                );
            }
            cb(error, canValid);
        },
        storage: diskStorage({
            destination(req, file, cb) {
                let uploadDir = `./uploads/${dayjs().format('YYYY/MM/DD')}`;
                let destinationDir = pathJoin(process.cwd(), uploadDir);
                if (!existsSync(destinationDir)) {
                    mkdirSync(destinationDir, { recursive: true });
                }
                cb(null, destinationDir);
            },
            filename(req, file, cb) {
                let filename = `${file.fieldname}-${dayjs().format('HH:mm:ss')}-${Math.floor(Math.random() * 10000)}-${file.originalname}`;
                cb(null, filename);
            }
        })
    });
}
