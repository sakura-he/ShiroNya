import { Inject, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { assertCerbosEnvPrefix, getCerbosServiceToken } from './cerbos.interface';

export const CERBOS_POLICY_KEY = '__cerbos_policy__';

/** 属性提取函数，接收 req，返回属性对象（支持异步） */
export type AttrFn = (req: Request) => Record<string, any> | Promise<Record<string, any>>;

/** 属性值：静态对象或动态函数 */
export type AttrValue = Record<string, any> | AttrFn;

export interface CerbosPolicyOptions {
    /** 资源类型，对应策略文件中的 resource */
    resource: string;
    /** 操作，对应策略文件中的 action */
    action: string;
    /** 资源属性，用于所有权等条件判断（可选） */
    resourceAttr?: AttrValue;
    /** principal 属性，覆盖全局默认（可选） */
    principalAttr?: AttrValue;
    /** 指定使用哪个 Cerbos 实例的 envPrefix，必须显式提供，禁止隐式走默认实例 */
    prefix: string;
}

/**
 * 标记资源类型、操作和可选的属性提取
 * @example @CerbosPolicy({ prefix: 'APP_', resource: 'character', action: 'read' })
 * @example @CerbosPolicy({ prefix: 'APP_', resource: 'character', action: 'update', resourceAttr: (req) => ({ creatorId: req.body.creatorId }) })
 * @example @CerbosPolicy({ prefix: 'APP_', resource: 'character', action: 'create', principalAttr: { department: 'design' } })
 */
export const CerbosPolicy = (options: CerbosPolicyOptions) => {
    const prefix = assertCerbosEnvPrefix(options.prefix, '@CerbosPolicy');
    return SetMetadata(CERBOS_POLICY_KEY, { ...options, prefix });
};

/**
 * 通过 envPrefix 注入对应的 CerbosService 实例。
 * @example @InjectCerbos('APP_') private readonly cerbos: CerbosService
 * @example @InjectCerbos('ADMIN_') private readonly adminCerbos: CerbosService
 */
export function InjectCerbos(envPrefix: string): ParameterDecorator {
    return Inject(getCerbosServiceToken(assertCerbosEnvPrefix(envPrefix, '@InjectCerbos')));
}
