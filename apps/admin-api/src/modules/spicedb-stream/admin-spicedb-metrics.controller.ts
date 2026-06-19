import { Public } from '@app/common';
import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';

@Controller()
export class AdminSpiceDbMetricsController extends PrometheusController {
    /**
     * 复用 nestjs-prometheus 的指标输出逻辑，仅补充项目统一公开路由标记。
     */
    @Public()
    @Get()
    override async index(@Res({ passthrough: true }) response: Response): Promise<string> {
        return await super.index(response);
    }
}
