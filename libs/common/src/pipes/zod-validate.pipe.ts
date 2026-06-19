import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { BusinessException } from '../exceptions/biz.exception';

export class ZodValidationPipe implements PipeTransform {
    constructor(private schema: ZodSchema) {}

    transform(value: unknown, metadata: ArgumentMetadata) {
        try {
            const parsedValue = this.schema.parse(value);
            return parsedValue;
        } catch (error: any) {
            throw new BusinessException(error.message);
        }
    }
}
