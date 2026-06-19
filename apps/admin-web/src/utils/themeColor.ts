import { generate, getRgbStr } from "@arco-design/color";
// 引入arco预置颜色避免计算
import _presetColos from "@/config/arco-palette.json";
type presetColosType = {
    dark: Record<string, Array<string>>;
    light: Record<string, Array<string>>;
};
let presetColos: presetColosType = _presetColos;
type primaryColorType = {
    dark: Record<keyof presetColosType["dark"], string>;
    light: Record<keyof presetColosType["light"], string>;
};
//根据传入的新颜色生成主题色，设置给body元素
export function setThemeColor(color: string, isDarkMode: boolean) {
    let colors = previewColor(color, isDarkMode);
    colors.forEach((color: string, index: number) => {
        const rgb = getRgbStr(color);
        document.body.style.setProperty(`--primary-${index + 1}`, rgb);
    });
}
// 根据传入的颜色生成阶梯预览色
export function previewColor(color: string, isDarkMode: boolean): string[] {
    let colors = generate(color, {
        format: "hex",
        dark: isDarkMode,
        list: true,
        index: 1,
    });
    return colors;
}
// 获取根据arco预置颜色组的主色调
export function getPresetPrimaryColors(index: number): primaryColorType {
    if (index > 9 || index < 0) {
        throw Error("颜色梯度应>=0,<=9");
    }

    let primaryColor: primaryColorType = {
        dark: {},
        light: {},
    } as primaryColorType;
    Object.keys(presetColos.dark).forEach((color) => {
        primaryColor.dark[color as keyof primaryColorType["dark"]] =
            presetColos.dark[color as keyof primaryColorType["dark"]][index];
    });
    Object.keys(presetColos.dark).forEach((color) => {
        primaryColor.light[color as keyof primaryColorType["light"]] =
            presetColos.light[color as keyof primaryColorType["light"]][index];
    });
    return primaryColor;
}
6;
