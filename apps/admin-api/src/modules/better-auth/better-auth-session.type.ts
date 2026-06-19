import { BetterAuthUserProfile, RbacRole } from '@app/prisma-admin/generated/client';

/**
 * admin 项目 customSession 返回的会话结构。
 */
export interface BetterAuthSession {
    user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        image?: string | null;
        role?: string | null;
        banned?: boolean | null;
        banReason?: string | null;
        banExpires?: Date | null;
        phoneNumber?: string | null;
        phoneNumberVerified?: boolean | null;
        username?: string | null;
        displayUsername?: string | null;
        createdAt: Date;
        updatedAt: Date;
    };
    session: {
        userId: string;
        token: string;
        expiresAt: Date;
        createdAt: Date;
        updatedAt: Date;
        ipAddress?: string | null;
        userAgent?: string | null;
        impersonatedBy?: string | null;
    };
    roles: RbacRole[];
    profile: BetterAuthUserProfile | null;
}
