// *-*-*-*-*-*-* 设置 *-*-*-*-*-*-*
// 动画时长、镜头高度与场地主题。这里只放可调的值，不含任何逻辑。
import {} from "@minecraft/server";
// #endregion
// #region 设置
/** 游戏设置。 */
export class Settings {
    /** 动画设置。 */
    animation = {
        enabled: true,
        playerCameraFadeInTime: 0.25,
        playerCameraHoldTime: 0.5,
        playerCameraFadeOutTime: 0.25,
        showCellAnimationTime: 1,
        holdCellTime: 2,
        holdEraseTime: 4,
        holdFigureTime: 8,
        cameraMaxHeight: 35,
        cameraMinHeight: 8,
    };
}
/** 当前使用的设置。 */
export const settings = new Settings();
/** 黄金矿场主题。 */
export const goldRush = {
    structureId: "picross:map_goldrush",
    structureLocation: { x: -31, y: -42, z: -31 },
    boardCenter: { x: 0, y: -41, z: 0 },
};
// #endregion
