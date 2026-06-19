import { MenuLayoutTypeEnum, MenuStatusEnum, MenuTypeEnum, PageTypeEnum } from '@app/prisma-app/generated/client';
import { CreateMenuSchema, UpdateMenuSchema } from './menu.dto';

describe('menu dto schemas', () => {
    it('允许创建和更新菜单时显式清空 icon', () => {
        const basePage = {
            type: MenuTypeEnum.Page,
            pid: 1,
            title: '用户管理',
            description: '用户关系管理页',
            requiredPermissionCode: 'system.user.view',
            icon: null,
            order: 0,
            status: MenuStatusEnum.ENABLE,
            path: 'user',
            componentPath: 'system/user/User',
            componentName: 'User',
            layout: MenuLayoutTypeEnum.LAYOUT_SIDE,
            pageType: PageTypeEnum.PAGE,
            isResident: false,
            isCache: false,
            isMenuVisible: true,
            isTabVisible: true
        };

        expect(CreateMenuSchema.safeParse(basePage).success).toBe(true);
        expect(UpdateMenuSchema.safeParse({ id: 79, ...basePage }).success).toBe(true);
    });
});
