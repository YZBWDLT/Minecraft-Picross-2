// *-*-*-*-*-*-* 面板 *-*-*-*-*-*-*
// 把数织的线索算成一块面板的坐标，并负责把面板写进世界。
// 这里只有几何与方块写入，不含任何时序：什么时候铺、怎么播动画由 animation.ts 决定。

import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import type * as picross from "./picross";
import { goldRush } from "./settings";

// #region 方块 ID

/** 格子方块 ID。 */
export const CellBlockId = "picross:cell_block";

/** 标记的格子方块 ID。 */
export const CellMarkedBlockId = "picross:marked_cell_block";

/** 锁定标记的格子方块 ID。 */
export const CellLockedBlockId = "picross:locked_cell_block";

/** 线索方块 ID 前缀，后面接 0~30。 */
const NumberBlockPrefix = "picross:clue_block_";

/** 是否为格子方块。 */
export function isCellBlock(typeId: string): boolean {
    let permutation: minecraft.BlockPermutation;
    try {
        permutation = minecraft.BlockPermutation.resolve(typeId);
    } catch {
        return false;
    }
    return permutation.hasTag(CellBlockId);
}

// #endregion
// #region 布局

/** 一块矩形区域（含两端），用方块坐标表示。 */
export interface BoardRect {
    readonly from: minecraft.Vector3;
    readonly to: minecraft.Vector3;
}

/** 面板里的一行格子，整行可以一次填充。 */
export interface BoardRowRect {
    readonly row: number;
    readonly from: minecraft.Vector3;
    readonly to: minecraft.Vector3;
}

/** 面板上的一个数字方块。 */
export interface BoardNumber {
    readonly location: minecraft.Vector3;
    readonly value: number;
}

/** 行线索方块，`row` 用于让它跟着所在行一起出现。 */
export interface BoardRowClue extends BoardNumber {
    readonly row: number;
}

/** 面板布局。纯计算的结果，不含任何世界写入。 */
export interface BoardLayout {
    /** 盘面左上角（第 0 行第 0 列）的坐标。 */
    readonly startLocation: minecraft.Vector3;

    /** 格子区（不含线索区）的中心，用于摆放镜头和玩家站位。 */
    readonly cellCenter: minecraft.Vector3;

    /** 整个盘面的矩形，用于一次性铺满。 */
    readonly boardRect: BoardRect;

    /** 整块面板（含线索区）的矩形，用于开场取景。 */
    readonly panelRect: BoardRect;

    /** 每行的格子矩形，用于逐行填充。 */
    readonly rowRects: BoardRowRect[];

    readonly rowClues: BoardRowClue[];
    readonly columnClues: BoardNumber[];

    /** 锁定格的坐标。 */
    readonly locked: minecraft.Vector3[];
}

/** 算出盘面布局。该方法不会放置任何方块。 */
export function getLayout(game: picross.PicrossGame): BoardLayout {
    const rowClues = game.rowClues;
    const columnClues = game.columnClues;
    const height = rowClues.length;
    const width = columnClues.length;
    if (height === 0 || width === 0) throw new Error("盘面尺寸为 0，无法放置面板");

    // 空线索用 0 表示
    const rows = rowClues.map(clue => (clue.length === 0 ? [0] : clue));
    const columns = columnClues.map(clue => (clue.length === 0 ? [0] : clue));

    // 线索区大小取所有行列里最宽的那一条
    const clueColumns = Math.max(...rows.map(clue => clue.length));
    const clueRows = Math.max(...columns.map(clue => clue.length));

    const panelWidth = width + clueColumns;
    const panelHeight = height + clueRows;
    const center = goldRush.boardCenter; // 面板的几何中心，随使用的主题而变化

    // 将盘面放在正中间
    const boardX = center.x - Math.floor(panelWidth / 2) + clueColumns;
    const boardZ = center.z - Math.floor(panelHeight / 2) + clueRows;
    const cellY = center.y;
    const numberY = center.y + 1;

    const rowRects: BoardRowRect[] = [];
    for (let row = 0; row < height; row++) {
        rowRects.push({
            row,
            from: { x: boardX, y: cellY, z: boardZ + row },
            to: { x: boardX + width - 1, y: cellY, z: boardZ + row },
        });
    }

    // 行线索：右对齐到盘面左边
    const rowClueList: BoardRowClue[] = [];
    for (let row = 0; row < height; row++) {
        const clue = rows[row];
        if (clue === undefined) continue;
        for (let index = 0; index < clue.length; index++) {
            const value = clue[index];
            if (value === undefined) continue;
            rowClueList.push({
                row,
                value,
                location: { x: boardX - (clue.length - index), y: numberY, z: boardZ + row },
            });
        }
    }

    // 列线索：下对齐到盘面上边
    const columnClueList: BoardNumber[] = [];
    for (let column = 0; column < width; column++) {
        const clue = columns[column];
        if (clue === undefined) continue;
        for (let index = 0; index < clue.length; index++) {
            const value = clue[index];
            if (value === undefined) continue;
            columnClueList.push({
                value,
                location: { x: boardX + column, y: numberY, z: boardZ - (clue.length - index) },
            });
        }
    }

    // 锁定格直接由行列坐标换算
    const locked = game.getLockedCells().map(position => ({
        x: position.column + boardX,
        y: cellY,
        z: position.row + boardZ,
    }));

    return {
        startLocation: { x: boardX, y: cellY, z: boardZ },
        cellCenter: { x: boardX + (width - 1) / 2, y: cellY, z: boardZ + (height - 1) / 2 },
        boardRect: { from: { x: boardX, y: cellY, z: boardZ }, to: { x: boardX + width - 1, y: cellY, z: boardZ + height - 1 } },
        panelRect: {
            from: { x: boardX - clueColumns, y: cellY, z: boardZ - clueRows },
            to: { x: boardX + width - 1, y: cellY, z: boardZ + height - 1 },
        },
        rowRects,
        rowClues: rowClueList,
        columnClues: columnClueList,
        locked,
    };
}

/** 按 z 把方块分层，同一层的会一起出现或一起消失。 */
export function groupByZ<T extends { readonly location: minecraft.Vector3 }>(items: readonly T[]): Map<number, T[]> {
    const layers = new Map<number, T[]>();
    for (const item of items) {
        const layer = layers.get(item.location.z);
        if (layer === undefined) layers.set(item.location.z, [item]);
        else layer.push(item);
    }
    return layers;
}

// #endregion
// #region 写入

/** 一次性铺满整个面板。 */
export function renderBoardInstant(layout: BoardLayout, dimension: minecraft.Dimension) {
    lib.BlockUtils.fill({ id: CellBlockId, from: layout.boardRect.from, to: layout.boardRect.to }, {}, dimension);

    for (const clue of layout.rowClues) placeNumber(clue.location, clue.value, dimension);
    for (const clue of layout.columnClues) placeNumber(clue.location, clue.value, dimension);

    for (const location of layout.locked) dimension.setBlockType(location, CellLockedBlockId);
}

/** 把布局切成一帧帧的渲染动作。
 * @description 每一帧对应一个 tick 里要做的事，帧数决定动画粒度。
 * 整个面板当作一张纸从上往下扫：列线索区先出，再接棋盘逐行。
 */
export function createRenderSteps(layout: BoardLayout, dimension: minecraft.Dimension): (() => void)[] {
    const steps: (() => void)[] = [];

    // 列线索先按层出现：从面板最上边一路扫到棋盘顶边
    const clueLayers = groupByZ(layout.columnClues);
    for (const z of [...clueLayers.keys()].sort((left, right) => left - right)) {
        const layer = clueLayers.get(z);
        steps.push(() => {
            if (layer === undefined) return;
            for (const clue of layer) placeNumber(clue.location, clue.value, dimension);
        });
    }

    // 接着逐行铺棋盘，行线索和锁定格跟着所在行一起出现
    for (const rect of layout.rowRects) {
        steps.push(() => {
            lib.BlockUtils.fill({ id: CellBlockId, from: rect.from, to: rect.to }, {}, dimension);
            for (const clue of layout.rowClues) {
                if (clue.row === rect.row) placeNumber(clue.location, clue.value, dimension);
            }
            for (const location of layout.locked) {
                if (location.z === rect.from.z) dimension.setBlockType(location, CellLockedBlockId);
            }
        });
    }

    return steps;
}

/** 把「擦掉盘面」切成一帧帧：从面板最上边一路扫到棋盘底边。
 * @description 每一层清掉该层的线索方块；落在棋盘范围内的层，顺便把标记格和锁定格还原成普通格子。
 */
export function createEraseSteps(layout: BoardLayout, dimension: minecraft.Dimension): (() => void)[] {
    const steps: (() => void)[] = [];

    // 线索按 z 收拢，同一层的列线索和行线索会一起消失
    const clueLayers = groupByZ([...layout.rowClues, ...layout.columnClues]);

    const boardTop = layout.boardRect.from.z;
    const boardBottom = layout.boardRect.to.z;

    // 从最上面一层线索开始扫
    let top = boardTop;
    for (const z of clueLayers.keys()) top = Math.min(top, z);

    for (let z = top; z <= boardBottom; z++) {
        const clues = clueLayers.get(z);
        const rowRect = layout.rowRects[z - boardTop];

        steps.push(() => {
            // 这一层的线索方块清成空气
            if (clues !== undefined) {
                for (const clue of clues) dimension.setBlockType(clue.location, "minecraft:air");
            }

            // 棋盘行：把标记格和锁定格还原成普通格子，已挖开的空气保持不动
            if (rowRect === undefined) return;
            for (let x = rowRect.from.x; x <= rowRect.to.x; x++) {
                const location = { x, y: rowRect.from.y, z: rowRect.from.z };
                const block = dimension.getBlock(location);
                if (block === undefined) continue;
                if (block.typeId === CellMarkedBlockId || block.typeId === CellLockedBlockId) {
                    dimension.setBlockType(location, CellBlockId);
                }
            }
        });
    }

    return steps;
}

/** 在面板上放一个线索方块，朝向统一为北。
 * @param location 方块坐标，`y` 由布局给出
 * @param value 要显示的数字，0~30
 */
function placeNumber(location: minecraft.Vector3, value: number, dimension: minecraft.Dimension) {
    if (!Number.isInteger(value) || value < 0 || value > 30) {
        throw new Error(`线索数字 ${value} 超出 0~30，没有对应的方块`);
    }
    const permutation = minecraft.BlockPermutation.resolve(`${NumberBlockPrefix}${value}`, {
        "minecraft:cardinal_direction": "north",
    });
    dimension.setBlockPermutation(location, permutation);
}

// #endregion
