export const NOT_FOUND = "notFound";
export const LOGIN = "login";
export const HOME = "home";
export const IFRAME = "iframe";
export const LINK = "link";
// 白名单只保留登录页；404 需要经过登录态守卫，确保动态菜单能先完成注册。
export const WHITE_LIST = [LOGIN];
