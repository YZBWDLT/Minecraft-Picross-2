// *-*-*-*-*-*-* 定位栏 *-*-*-*-*-*-*
// 定位栏上显示的位置点。

import * as minecraft from "@minecraft/server";

import { DimensionUtils } from "./dimension";

/** 定位栏管理器。 */
export class LocatorBarUtils {
    /** 为玩家添加固定位置定位栏。 */
    static addLocation(
        player: minecraft.Player,
        location: minecraft.Vector3,
        textureSelector: minecraft.WaypointTextureSelector,
        color?: minecraft.RGB,
        dimension?: string | minecraft.Dimension,
    ) {
        const waypoint = new minecraft.LocationWaypoint(
            { ...location, dimension: DimensionUtils.getDefault(dimension) },
            textureSelector,
            color,
        );
        player.locatorBar.addWaypoint(waypoint);
    }

    /** 为玩家添加默认图标的固定位置定位栏。 */
    static addDefaultIconLocation(
        player: minecraft.Player,
        location: minecraft.Vector3,
        range1: number,
        range2: number,
        range3: number,
        range4: number,
        color?: minecraft.RGB,
        dimension?: string | minecraft.Dimension,
    ) {
        this.addLocation(
            player,
            location,
            {
                textureBoundsList: [
                    { texture: minecraft.WaypointTexture.Square, lowerBound: range1, upperBound: range2 },
                    { texture: minecraft.WaypointTexture.Circle, lowerBound: range2, upperBound: range3 },
                    { texture: minecraft.WaypointTexture.SmallSquare, lowerBound: range3, upperBound: range4 },
                    { texture: minecraft.WaypointTexture.SmallStar, lowerBound: range4 },
                ],
            },
            color,
            dimension,
        );
    }

    /** 为玩家添加实体定位栏。 */
    static addEntity(
        player: minecraft.Player,
        entity: minecraft.Entity,
        textureSelector: minecraft.WaypointTextureSelector,
        entityRules: minecraft.EntityVisibilityRules,
        color?: minecraft.RGB,
    ) {
        const waypoint = new minecraft.EntityWaypoint(entity, textureSelector, entityRules, color);
        player.locatorBar.addWaypoint(waypoint);
    }

    /** 为玩家添加实体定位栏。 */
    static addDefaultIconEntity(
        player: minecraft.Player,
        entity: minecraft.Entity,
        range1: number,
        range2: number,
        range3: number,
        range4: number,
        entityRules: minecraft.EntityVisibilityRules,
        color?: minecraft.RGB,
    ) {
        const waypoint = new minecraft.EntityWaypoint(
            entity,
            {
                textureBoundsList: [
                    { texture: minecraft.WaypointTexture.Square, lowerBound: range1, upperBound: range2 },
                    { texture: minecraft.WaypointTexture.Circle, lowerBound: range2, upperBound: range3 },
                    { texture: minecraft.WaypointTexture.SmallSquare, lowerBound: range3, upperBound: range4 },
                    { texture: minecraft.WaypointTexture.SmallStar, lowerBound: range4 },
                ],
            },
            entityRules,
            color,
        );
        player.locatorBar.addWaypoint(waypoint);
    }

    /** 移除玩家的全部定位。 */
    static removeAll(player: minecraft.Player) {
        player.locatorBar.removeAllWaypoints();
    }
}
