import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { createZodDto, ZodSerializerDto, type ZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** 根据传入的 ZodDto 生成 Swagger 响应 DTO 名称 */
function getSwaggerDtoName(type: ZodDto): string {
    const sourceDtoName = type.name?.replace(/_Output$/, '') || 'ApiRes';
    return sourceDtoName;
}

type ApiOkResByTypeOptions = {
    summary?: string;
    description?: string;
};

/**
 * 组合装饰器：ApiOperation + ApiResponse + ZodSerializerDto
 * 传入响应 DTO（createZodDto 创建），Swagger 自动展示 { code, message, data } 结构
 * Controller 方法直接返回业务数据，{ data } 包装由全局拦截器处理
 *
 * @example
 * @ApiOkResByZod({ summary: '获取用户列表', type: UserListResDto })
 * async getUsers() { return { records: [...], pagination: {...} } }
 *
 * @example
 * @ApiOkResByZod({ summary: '获取用户', type: UserResDto })
 * async getUser() { return null }
 */
export function ApiOkResByZod<T extends ZodDto>(
    options: ApiOkResByTypeOptions & { type: T }
): MethodDecorator {
    const { summary, description = '', type } = options;
    const schema = type.schema as z.ZodType;

    // Swagger 展示用：{ code, message, data }
    const swaggerSchema = z.object({
        code: z.number().describe('请求结果码（请求成功返回200，请求失败错误码请查看错误码描述说明）'),
        message: z.string().describe('描述信息'),
        data: schema.describe('数据') as z.ZodType
    });

    return (target, propertyKey, descriptor) => {
        class SwaggerResponseDto extends createZodDto(swaggerSchema) {}
        // 基于传入 DTO 的类名生成响应 DTO 名称，避免手动命名
        Object.defineProperty(SwaggerResponseDto, 'name', {
            value: getSwaggerDtoName(type)
        });

        // 序列化用：直接传响应 DTO
        const decorators: MethodDecorator[] = [
            ZodSerializerDto(type),
            ApiOkResponse({ description, type: SwaggerResponseDto })
        ];

        if (summary) {
            decorators.unshift(ApiOperation({ summary, description }));
        }

        applyDecorators(...decorators)(target, propertyKey as string | symbol, descriptor);
    };
}
