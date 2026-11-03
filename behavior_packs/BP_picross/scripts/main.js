import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as picross from "./picross";
import { levels } from "./levels";
// 仅调试用：右键钻石获取开发者权限
minecraft.world.afterEvents.itemUse.subscribe(event => {
    const { source: player, itemStack: diamond } = event;
    if (diamond.typeId !== "minecraft:diamond")
        return;
    const playerHasPermission = player.hasTag("picross:developer");
    if (playerHasPermission) {
        player.removeTag("picross:developer");
        player.sendMessage("§c已移除开发者权限");
    }
    else {
        player.addTag("picross:developer");
        player.sendMessage("§a已添加开发者权限");
    }
});
// #region 变量定义
/** 格子方块 ID。 */
const CellBlockId = "picross:cell_block";
/** 标记的格子方块 ID。 */
const CellMarkedBlockId = "picross:marked_cell_block";
/** 锁定标记的格子方块 ID。 */
const CellLockedBlockId = "picross:locked_cell_block";
/** 铅笔 ID。 */
const PencilId = "picross:pencil";
/** 橡皮 ID。 */
const EraserId = "picross:eraser";
/** 铅笔和橡皮 ID。 */
const PencilAndEraserId = "picross:pencil_and_eraser";
/** 线索方块 ID 前缀，后面接 0~30。 */
const NumberBlockPrefix = "picross:clue_block_";
// #endregion
// #region 关卡
/** 代表一个广义的数织关卡。这个广义的数织关卡可能包括大厅关卡、游戏关卡等，支持启动关卡、退出关卡等操作。 */
class Level {
    constructor() { }
    /** 启动关卡。 */
    start() { }
    /** 离开关卡。 */
    exit() { }
}
class GameLevel extends Level {
    constructor(puzzle, options) {
        super();
        this.game = new picross.PicrossGame(puzzle, options);
        this.start();
    }
    /** 代表本关使用的数织实例。 */
    game;
    /** 代表本关左上角的格子方块的起始点，根据此坐标点计算玩家挖掉的方块位于盘面的何坐标下。 */
    startLocation = { x: 0, y: 0, z: 0 };
    start() {
        Components.interactionController(this);
        Components.preventPlayerBreakBlocks(this);
        lib.StructureUtils.placeAsync("picross:map_goldrush", { x: -31, y: -42, z: -31 }, { animationMode: minecraft.StructureAnimationMode.Layers, animationSeconds: 1 }).then(() => {
            this.placeBoard();
        });
    }
    exit() {
        lib.gameSystem.unsubscribeAllEvents();
    }
    // #region - 通用
    /** 是否为格子方块。 */
    static itemIsCellBlock(typeId) {
        let permutation;
        try {
            permutation = minecraft.BlockPermutation.resolve(typeId);
        }
        catch {
            return false;
        }
        return permutation.hasTag(CellBlockId);
    }
    getPicrossLocation(location) {
        const column = location.x - this.startLocation.x;
        const row = location.z - this.startLocation.z;
        return {
            /** 坐标所对应的列坐标。 */
            column,
            /** 坐标所对应的行坐标。 */
            row,
        };
    }
    // #endregion
    // #region - 场地放置
    /** 场地正中心。数织面板以此为几何中心。 */
    static BoardCenter = { x: 0, y: -41, z: 0 };
    /** 允许放置格子方块的 y。 */
    static CellBlockY = GameLevel.BoardCenter.y;
    /** 线索方块的 y。比格子方块高一格，贴片正好压在格子上表面。 */
    static NumberBlockY = GameLevel.BoardCenter.y + 1;
    /** 放置数织面板。
     * - 面板以 (0, -41, 0) 为几何中心：格子方块 y = -41，线索放 y = -40（比格子方块高一格）。
     * - 面板宽 = 盘面宽 + 各行线索个数的最大值；面板高 = 盘面高 + 各列线索个数的最大值。
     *   例：某行线索为 `1 1 1`、盘面宽 5，则该行占用 3 + 5 = 8 格；线索为 `3 1` 时占用 2 + 5 = 7 格。
     * - 行线索紧贴盘面左侧并右对齐，列线索紧贴盘面上方并下对齐。
     * - 格子方块放置 `picross:cell_block`；线索方块放置 `picross:clue_block_x`，cardinal_direction 统一为 north，
     *   即玩家站在南侧朝北看时文字正立——也就是行向 +z 递增、列向 +x 递增。
     * - 盘面左上角（第 0 行第 0 列）的坐标写入 startLocation。
     * - 面板宽或高为偶数时无法严格居中，会向右、向上各多占一格。
     */
    placeBoard() {
        const rowClues = this.game.rowClues;
        const columnClues = this.game.columnClues;
        const height = rowClues.length;
        const width = columnClues.length;
        if (height === 0 || width === 0)
            throw new Error("盘面尺寸为 0，无法放置面板");
        // 空线索用 0 表示
        const rows = rowClues.map(clue => (clue.length === 0 ? [0] : clue));
        const columns = columnClues.map(clue => (clue.length === 0 ? [0] : clue));
        // 线索区大小取所有行列里最宽的那一条，这样盘面才能对齐
        let clueColumns = 0;
        for (const clue of rows)
            clueColumns = Math.max(clueColumns, clue.length);
        let clueRows = 0;
        for (const clue of columns)
            clueRows = Math.max(clueRows, clue.length);
        const panelWidth = width + clueColumns;
        const panelHeight = height + clueRows;
        const center = GameLevel.BoardCenter;
        // 起点取 -floor(尺寸/2)，对称但不严格居中（偶数尺寸总有一侧多一格）
        const boardX = center.x - Math.floor(panelWidth / 2) + clueColumns;
        const boardZ = center.z - Math.floor(panelHeight / 2) + clueRows;
        const dimension = minecraft.world.getDimension("overworld");
        // 格子方块
        lib.BlockUtils.fill({
            id: CellBlockId,
            from: { x: boardX, y: center.y, z: boardZ },
            to: { x: boardX + width - 1, y: center.y, z: boardZ + height - 1 },
        }, {}, dimension);
        // 行线索：右对齐到盘面左边
        for (let row = 0; row < height; row++) {
            const clue = rows[row];
            if (clue === undefined)
                continue;
            for (let index = 0; index < clue.length; index++) {
                const value = clue[index];
                if (value === undefined)
                    continue;
                this.placeNumber(value, boardX - (clue.length - index), boardZ + row, dimension);
            }
        }
        // 列线索：下对齐到盘面上边
        for (let column = 0; column < width; column++) {
            const clue = columns[column];
            if (clue === undefined)
                continue;
            for (let index = 0; index < clue.length; index++) {
                const value = clue[index];
                if (value === undefined)
                    continue;
                this.placeNumber(value, boardX + column, boardZ - (clue.length - index), dimension);
            }
        }
        this.startLocation = { x: boardX, y: center.y, z: boardZ };
    }
    /** 在面板上放一个线索方块，朝向统一为北。
     * @param value 要显示的数字，0~30
     * @param x 方块 x 坐标
     * @param z 方块 z 坐标
     */
    placeNumber(value, x, z, dimension) {
        if (!Number.isInteger(value) || value < 0 || value > 30) {
            throw new Error(`线索数字 ${value} 超出 0~30，没有对应的方块`);
        }
        const permutation = minecraft.BlockPermutation.resolve(`${NumberBlockPrefix}${value}`, {
            "minecraft:cardinal_direction": "north",
        });
        dimension.setBlockPermutation({ x: x, y: GameLevel.NumberBlockY, z: z }, permutation);
    }
    // #endregion
    // #region - 场景状态更改
    /** 更改线索方块或箭头方块的状态。 */
    changeClueAndArrowBlockState(block) {
        // @ts-ignore
        const isSolved = block.permutation.getState("picross:solved");
        minecraft.system.run(() => lib.BlockUtils.setState(block, { "picross:solved": !isSolved }));
    }
    /** 标记格子方块。会自动判断输入的方块是否为标准格子方块。 */
    setCellBlockMarked(block) {
        if (block.typeId !== CellBlockId)
            return;
        // 放置标记格子方块
        lib.BlockUtils.set({ id: CellMarkedBlockId, location: block.location });
        // 在游戏实例中应用更改
        const { column, row } = this.getPicrossLocation(block.location);
        this.game.markBlank(row, column);
        lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aBLANK§7 状态`, "actionBar");
    }
    /** 取消标记格子方块。 */
    setCellBlockUnmarked(block) {
        if (block.typeId !== CellMarkedBlockId)
            return;
        // 放置标记格子方块
        lib.BlockUtils.set({ id: CellBlockId, location: block.location });
        // 在游戏实例中应用更改
        const { column, row } = this.getPicrossLocation(block.location);
        this.game.markUnknown(row, column);
        lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aUNKNOWN§7 状态`, "actionBar");
    }
    /** 玩家放置格子方块。 */
    placeCellBlock(location) {
        // 在游戏实例中应用更改
        const { column, row } = this.getPicrossLocation(location);
        this.game.markUnknown(row, column);
        lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aUNKNOWN§7 状态`, "actionBar");
        // 获取谜题是否已被解决
        const puzzleSolved = this.game.isSolved();
        if (puzzleSolved) {
            lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aFILLED§7 状态\n§b谜题已被解开！`, "actionBar");
        }
    }
    /** 玩家破坏格子方块。 */
    breakCellBlock(location) {
        // 在游戏实例中应用更改
        const { column, row } = this.getPicrossLocation(location);
        this.game.markFilled(row, column);
        lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aFILLED§7 状态`, "actionBar");
        // 获取谜题是否已被解决
        const puzzleSolved = this.game.isSolved();
        if (puzzleSolved) {
            lib.Debug.sendMessage(`§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §aFILLED§7 状态\n§b谜题已被解开！`, "actionBar");
        }
    }
}
// #endregion
class Components {
    /** 阻止玩家破坏方块。
     * @description 默认情况下，阻止任何破坏。
     * @description 允许开发者进行任意程度的破坏。
     * @description 允许玩家破坏格子方块。
     */
    static preventPlayerBreakBlocks(level) {
        lib.gameSystem.subscribeEvent("preventPlayerBreakBlocks", minecraft.world.beforeEvents.playerBreakBlock, event => {
            const { block, player } = event;
            event.cancel = true;
            // 允许开发者进行任意程度的交互
            const playerIsDeveloper = player.hasTag("picross:developer");
            if (playerIsDeveloper)
                event.cancel = false;
            // 允许玩家破坏格子方块
            if (block.hasTag(CellBlockId)) {
                event.cancel = false;
                minecraft.system.run(() => level.breakCellBlock(block.location));
            }
        });
    }
    /** 交互控制器，控制游戏的交互。
     * @description 默认情况下，阻止任何交互。
     * @description 允许开发者进行任意程度的交互。
     * @description 允许玩家在规定高度放置格子方块。
     * @description 允许玩家和线索方块交互，并更新其状态。
     */
    static interactionController(level) {
        lib.gameSystem.subscribeEvent("preventPlayerPlaceBlocks", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            const { player, itemStack: item, isFirstEvent, block } = event;
            if (!isFirstEvent)
                return;
            event.cancel = true;
            // 允许开发者进行任意程度的交互
            const playerIsDeveloper = player.hasTag("picross:developer");
            if (playerIsDeveloper)
                event.cancel = false;
            // 允许玩家在规定高度放置格子方块
            const placeLocation = lib.BlockUtils.getPlaceLocation(event);
            if (GameLevel.itemIsCellBlock(item?.typeId ?? "") && placeLocation.y === GameLevel.CellBlockY) {
                event.cancel = false;
                minecraft.system.run(() => level.placeCellBlock(placeLocation));
            }
            // 当玩家和线索方块交互时，更改其状态
            const allowedTags = ["picross:clue", "picross:arrow"];
            if (allowedTags.some(allowedTag => block.hasTag(allowedTag)))
                minecraft.system.run(() => level.changeClueAndArrowBlockState(block));
            // 当玩家手持铅笔、橡皮和格子方块交互时，更改其状态
            if (block.typeId === CellBlockId && (item?.typeId === PencilId || item?.typeId === PencilAndEraserId))
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "block.cartography_table.use", location: block.location });
                    level.setCellBlockMarked(block);
                });
            else if (block.typeId === CellMarkedBlockId && (item?.typeId === EraserId || item?.typeId === PencilAndEraserId))
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "item.bone_meal.use", soundOptions: { pitch: 1.5 }, location: block.location });
                    level.setCellBlockUnmarked(block);
                });
        });
    }
}
minecraft.world.afterEvents.worldLoad.subscribe(event => {
    // 当前存在问题：区块未完全加载会报错
    new GameLevel(levels["10004"]);
});
