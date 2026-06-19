import type { CSSProperties } from "vue";

/**
 * GiPageLayout 的属性定义，用于复用左右分栏、头部和内容区布局。
 */
export interface PageLayoutProps {
    size?: string | number;
    min?: string | number;
    max?: string | number;
    margin?: boolean;
    inner?: boolean;
    headerBordered?: boolean;
    leftStyle?: CSSProperties;
    headerStyle?: CSSProperties;
    bodyStyle?: CSSProperties;
    collapsed?: boolean;
    bgTransparent?: boolean;
    contentScrollable?: boolean;
    leftScrollable?: boolean;
}
