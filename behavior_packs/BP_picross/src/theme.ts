// *-*-*-*-*-*-* 主题 *-*-*-*-*-*-*
// 包含地图中的多项主题的设定。

import { type Vector3 } from "@minecraft/server";

/** 表示一个数织场地的主题。 */
export interface Theme {
    /** 待加载的结构 ID。 */
    readonly structureId: string;

    /** 结构加载的位置。 */
    readonly structureLocation: Vector3;

    /** 盘面的中心位置。它也同时决定允许放置格子方块的高度和初始状态下放置线索方块的高度。 */
    readonly boardCenter: Vector3;
}

/** 淘金热主题。 */
export const goldRush: Theme = {
    structureId: "picross:map_goldrush",
    structureLocation: { x: -31, y: -42, z: -31 },
    boardCenter: { x: 0, y: -41, z: 0 },
};
