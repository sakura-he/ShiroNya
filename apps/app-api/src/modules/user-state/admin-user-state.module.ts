import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma-app';
import { AdminUserStateService } from './admin-user-state.service';

/** admin 端用户状态版本号模块，提供并导出 AdminUserStateService */
@Module({
    imports: [PrismaModule],
    providers: [AdminUserStateService],
    exports: [AdminUserStateService]
})
export class AdminUserStateModule {}
