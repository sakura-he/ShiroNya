import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { FILE_FILTER_TYPE_METADATA_KEY } from '../constants/auth.constant';

@Injectable()
export class FileFilterMetadataInterceptor implements NestInterceptor {
    constructor(private reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        let request = context.switchToHttp().getRequest();
        let fileMetadata = this.reflector.getAllAndOverride('__file_filter_metadata__', [
            context.getHandler(),
            context.getClass()
        ]);
        if (fileMetadata?.length) {
        }
        Reflect.defineMetadata(FILE_FILTER_TYPE_METADATA_KEY, fileMetadata, request);
        return next.handle();
    }
}
