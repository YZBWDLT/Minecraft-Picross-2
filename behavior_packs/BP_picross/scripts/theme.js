// *-*-*-*-*-*-* 主题 *-*-*-*-*-*-*
// 包含地图中的多项主题的设定。
// 下面的 themes 是一个主题的注册表。其中键名是主题的 ID，应用在设置和翻译中。
// 请务必在语言文件添加对应的键名，格式为`theme.(ID)`。
/** 所有的主题。这里，键名对应主题的 ID。 */
export const themes = {
    /** 淘金热。 */
    goldRush: {
        structureId: "picross:map_goldrush",
        structureLocation: { x: -31, y: -42, z: -31 },
        boardCenter: { x: 0, y: -41, z: 0 },
    },
};
// ===== 常用方法 =====
/** 获取当前设置正在使用的主题设定。 */
export function getCurrentTheme(settings) {
    const firstThemeId = Object.keys(themes)[0];
    if (!firstThemeId)
        throw new Error("错误：目前不存在任何主题设定。");
    return themes[settings.theme.id] ?? themes[firstThemeId];
}
