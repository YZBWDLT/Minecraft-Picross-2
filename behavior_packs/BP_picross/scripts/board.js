// *-*-*-*-*-*-* 面板 *-*-*-*-*-*-*
// 把数织的线索算成一块面板的坐标，并负责把面板写进世界。
// 这里只有几何与方块写入，不含任何时序：什么时候铺、怎么播动画由 animation.ts 决定。
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import { CellBlockId, CellLockedBlockId } from "./constants";
import { goldRush } from "./settings";
// #region 方块 ID
/** 线索方块 ID 前缀，后面接 0~30。 */
const NumberBlockPrefix = "picross:clue_block_";
/** 是否为格子方块。 */
export function isCellBlock(typeId) {
    let permutation;
    try {
        permutation = minecraft.BlockPermutation.resolve(typeId);
    }
    catch {
        return false;
    }
    return permutation.hasTag(CellBlockId);
}
/** 算出盘面布局。该方法不会放置任何方块。 */
export function getLayout(game) {
    const rowClues = game.rowClues;
    const columnClues = game.columnClues;
    const height = rowClues.length;
    const width = columnClues.length;
    if (height === 0 || width === 0)
        throw new Error("盘面尺寸为 0，无法放置面板");
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
    const rowRects = [];
    for (let row = 0; row < height; row++) {
        rowRects.push({
            row,
            from: { x: boardX, y: cellY, z: boardZ + row },
            to: { x: boardX + width - 1, y: cellY, z: boardZ + row },
        });
    }
    // 行线索：右对齐到盘面左边
    const rowClueList = [];
    for (let row = 0; row < height; row++) {
        const clue = rows[row];
        if (clue === undefined)
            continue;
        for (let index = 0; index < clue.length; index++) {
            const value = clue[index];
            if (value === undefined)
                continue;
            rowClueList.push({
                row,
                value,
                location: { x: boardX - (clue.length - index), y: numberY, z: boardZ + row },
            });
        }
    }
    // 列线索：下对齐到盘面上边
    const columnClueList = [];
    for (let column = 0; column < width; column++) {
        const clue = columns[column];
        if (clue === undefined)
            continue;
        for (let index = 0; index < clue.length; index++) {
            const value = clue[index];
            if (value === undefined)
                continue;
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
// #endregion
// #region 写入
/** 一次性铺满整个面板。 */
export function renderBoardInstant(layout, dimension) {
    lib.BlockUtils.fill({ id: CellBlockId, from: layout.boardRect.from, to: layout.boardRect.to }, {}, dimension);
    for (const clue of layout.rowClues)
        placeNumber(clue.location, clue.value, dimension);
    for (const clue of layout.columnClues)
        placeNumber(clue.location, clue.value, dimension);
    for (const location of layout.locked)
        dimension.setBlockType(location, CellLockedBlockId);
}
/** 在面板上放一个线索方块，朝向统一为北。
 * @param location 方块坐标，`y` 由布局给出
 * @param value 要显示的数字，0~30
 */
export function placeNumber(location, value, dimension) {
    if (!Number.isInteger(value) || value < 0 || value > 30) {
        throw new Error(`线索数字 ${value} 超出 0~30，没有对应的方块`);
    }
    const permutation = minecraft.BlockPermutation.resolve(`${NumberBlockPrefix}${value}`, {
        "minecraft:cardinal_direction": "north",
    });
    dimension.setBlockPermutation(location, permutation);
}
// #endregion
