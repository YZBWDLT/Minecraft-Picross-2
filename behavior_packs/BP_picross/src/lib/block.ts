// *-*-*-*-*-*-* 方块 *-*-*-*-*-*-*
// 方块的读取、放置与批量填充。

import * as minecraft from "@minecraft/server";

import { DimensionUtils } from "./dimension";
import { Vector3Utils } from "./vector";

/** 表示一个方块的信息。 */
export interface BlockData {
    /** 方块 ID。 */
    id: string;

    /** 方块位置。 */
    location: minecraft.Vector3;

    /** 方块状态。 */
    states?: Record<string, boolean | number | string | undefined>;
}

/** 表示一个方块匹配的信息。 */
export interface BlockMatchData {
    /** 方块位置。 */
    location: minecraft.Vector3;

    /** 方块 ID。 */
    id?: string;

    /** 方块状态。 */
    states?: Record<string, boolean | number | string | undefined>;
}

/** 表示填充一个方块区域的信息。 */
export interface BlockFillData {
    /** 方块 ID。 */
    id: string;

    /** 方块位置。 */
    from: minecraft.Vector3;

    /** 方块位置。 */
    to: minecraft.Vector3;

    /** 方块状态。 */
    states?: Record<string, boolean | number | string | undefined>;
}

/** 方块操作工具。 */
export class BlockUtils {
    /** 获取某个位置的方块。
     * @returns 当试图获取未加载区块时，返回 undefined。
     */
    static get(location: minecraft.Vector3, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getBlock(location);
    }

    /** 在两个坐标间填充方块。 */
    static fill(blockData: BlockFillData, options?: minecraft.BlockFillOptions, dimension?: string | minecraft.Dimension) {
        const volumes: minecraft.ListBlockVolume[] = [];
        const { from, to, id, states } = blockData;
        DimensionUtils.divideVolume(new minecraft.BlockVolume(from, to)).forEach(volume =>
            volumes.push(DimensionUtils.getDefault(dimension).fillBlocks(volume, id, options)),
        );
        if (states) {
            volumes
                .flatMap(volume => DimensionUtils.getLocationsFromVolume(volume))
                .forEach(location => {
                    const block = DimensionUtils.getDefault(dimension).getBlock(location);
                    if (!block) return;
                    this.setState(block, states);
                });
        }

        return volumes;
    }

    /** 在两个坐标间以镂空的形式填充方块。 */
    static fillHollow(blockData: BlockFillData, options?: minecraft.BlockFillOptions, dimension?: string | minecraft.Dimension) {
        const { from, to, id, states } = blockData;
        const volumeInfo = DimensionUtils.hollowVolume(new minecraft.BlockVolume(from, to));
        // 内部镂空
        const { from: hollowedFrom, to: hollowedTo } = volumeInfo.hollowedVolume;
        this.fill({ from: hollowedFrom, to: hollowedTo, id: "minecraft:air" }, {}, dimension);
        // 外部填充方块
        volumeInfo.borderVolume.forEach(volume => {
            const { from: borderFrom, to: borderTo } = volume;
            this.fill({ from: borderFrom, to: borderTo, id, states }, options, dimension);
        });
    }

    /** 在某个位置放置方块。
     * @throws 当试图在未加载区块放置方块时会报错。
     * @throws 在指定方块状态时，请确保该方块存在这个方块状态！
     */
    static set(blockData: BlockData, dimension?: string | minecraft.Dimension) {
        const { id, location, states } = blockData;
        DimensionUtils.getDefault(dimension).setBlockType(location, id);
        // 设定方块的方块状态
        const placedBlock = this.get(location, dimension);
        if (states && placedBlock) this.setState(placedBlock, states);
        return this.get(location, dimension);
    }

    /** 获取和方块交互后，实际放置的方块位置。
     * @description 专门适用于 interactWithBlock 的前事件和后事件。
     */
    static getPlaceLocation(event: minecraft.PlayerInteractWithBlockAfterEvent | minecraft.PlayerInteractWithBlockBeforeEvent) {
        const { block, blockFace } = event;
        const location = block.location;
        const placeLocation: Record<minecraft.Direction, minecraft.Vector3> = {
            Up: Vector3Utils.up(location),
            Down: Vector3Utils.down(location),
            North: Vector3Utils.north(location),
            South: Vector3Utils.south(location),
            West: Vector3Utils.west(location),
            East: Vector3Utils.east(location),
        };
        return placeLocation[blockFace];
    }

    /** 检查特定位置的方块是否为符合条件的方块。 */
    static match(blockData: BlockMatchData, dimension?: string | minecraft.Dimension): boolean {
        const { id, location, states } = blockData;
        const block = this.get(location, dimension);
        // 如果方块不存在，或者 ID 无法匹配，则返回 false
        if (!block) return false;
        if (id && block.typeId !== id) return false;
        // 检查所有的方块状态，如果存在不能对应的方块状态则返回 false
        if (states) {
            const hasUnmatchedState = Object.entries(states).some(([state, value]) => {
                // @ts-ignore 因为原版的补全文件发疯，没有考虑附加包自定义的状态，所以这里必须忽略报错
                if (block.permutation.getState(state) !== value) return true;
                return false;
            });

            if (hasUnmatchedState) return false;
        }
        return true;
    }

    /** 将方块设定为特定的方块状态。 */
    static setState(block: minecraft.Block, states: Record<string, boolean | number | string | undefined>) {
        Object.entries(states).forEach(([state, value]) => {
            // @ts-ignore 因为原版的补全文件发疯，没有考虑附加包自定义的状态，所以这里必须忽略报错
            block.setPermutation(block.permutation.withState(state, value));
        });
    }
}
