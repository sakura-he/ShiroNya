export type ResponsiveSearchCol = {
    span: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
};

export function createResponsiveSearchCol(span: number): ResponsiveSearchCol {
    const mediumSpan = span === 24 ? 24 : 12;

    return {
        span,
        xs: 24,
        sm: 24,
        md: mediumSpan,
        lg: span,
        xl: span,
        xxl: span,
    };
}
