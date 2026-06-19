import { FileTypeValidatorOptions, MaxFileSizeValidatorOptions, SetMetadata } from '@nestjs/common';

export interface FileFilterMetadataOptions {
    maxSize?: MaxFileSizeValidatorOptions['maxSize'];
    fileType?: FileTypeValidatorOptions['fileType'];
}

export const FileFilterMetadataDecorator = (options: FileFilterMetadataOptions) => {
    return SetMetadata('__file_filter_metadata__', options);
};
