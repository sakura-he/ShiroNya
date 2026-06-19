import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';

import { UploadModule } from './upload/upload.module';
@Module({
    imports: [
        UploadModule,
        RouterModule.register([
            {
                path: 'common',
                module: CommonModule,
                children: [UploadModule]
            }
        ])
    ],
    exports: []
})
export class CommonModule {
    constructor() {}
}
