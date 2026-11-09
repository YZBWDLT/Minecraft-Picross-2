// *-*-*-*-*-*-* 设置 *-*-*-*-*-*-*
// 动画时长、镜头高度与场地主题。这里只放可调的值，不含任何逻辑。

import { type Vector3 } from "@minecraft/server";

// #region 动画

/** 开场与结束动画共用的设置。
 * @description 两段动画都用同一套黑屏参数和相机高度，只是各自的展示时长不同。
 */
export interface AnimationSettings {
    /** 是否启用动画。关闭后开场直接铺盘，退场直接重置场地。 */
    enabled: boolean;

    /** 玩家镜头淡入黑屏的时长。单位：秒。 */
    playerCameraFadeInTime: number;

    /** 玩家镜头持续黑屏的时长，在黑屏时会传送玩家、设置玩家的镜头在盘面正上方。单位：秒。 */
    playerCameraHoldTime: number;

    /** 玩家镜头淡出黑屏的时长。单位：秒。 */
    playerCameraFadeOutTime: number;

    /** 开场与结束动画中，盘面逐层显现或消除的时长。单位：秒。 */
    showCellAnimationTime: number;

    /** 开场动画中，盘面显现后停留的时长。单位：秒。 */
    holdCellTime: number;

    /** 结束动画中，盘面消除阶段的停留时长。单位：秒。
     * @description 前 `showCellAnimationTime` 秒用于逐层消除，剩下的时间只是等着，
     * 所以这个值小于 `showCellAnimationTime` 时会自动对齐后者。
     */
    holdEraseTime: number;

    /** 结束动画中，图案显示后停留的时长。单位：秒。 */
    holdFigureTime: number;

    /** 俯视镜头的最大高度。 */
    cameraMaxHeight: number;

    /** 俯视镜头的最低高度。 */
    cameraMinHeight: number;
}

// #endregion
// #region 设置

/** 游戏设置。 */
export class Settings {
    /** 动画设置。 */
    animation: AnimationSettings = {
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

// #endregion
// #region 主题

/** 表示一个数织场地的主题。 */
export interface Theme {
    /** 待加载的结构 ID。 */
    readonly structureId: string;

    /** 结构加载的位置。 */
    readonly structureLocation: Vector3;

    /** 盘面的中心位置。它也同时决定允许放置格子方块的高度和初始状态下放置线索方块的高度。 */
    readonly boardCenter: Vector3;
}

/** 黄金矿场主题。 */
export const goldRush: Theme = {
    structureId: "picross:map_goldrush",
    structureLocation: { x: -31, y: -42, z: -31 },
    boardCenter: { x: 0, y: -41, z: 0 },
};

// #endregion
