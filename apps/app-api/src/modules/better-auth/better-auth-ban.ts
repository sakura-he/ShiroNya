export function isActiveBetterAuthBan(user: { banned?: boolean | null; banExpires?: Date | string | null } | null) {
    if (!user?.banned) {
        return false;
    }

    if (!user.banExpires) {
        return true;
    }

    return new Date(user.banExpires).getTime() > Date.now();
}
