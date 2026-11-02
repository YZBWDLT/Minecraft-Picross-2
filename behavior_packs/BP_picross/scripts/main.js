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
/** 棋盘方块 ID。 */
const CellId = "picross:cell";
/** 标记的棋盘方块 ID。 */
const CellMarkedId = "picross:cell_marked";
/** 锁定标记的棋盘方块 ID。 */
const CellLockedId = "picross:cell_locked";
/** 数字方块 ID 前缀，后面接 0~30。 */
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
    game;
    startLocation = { x: 0, y: 0, z: 0 };
    start() {
        Components.changeMarkBlockState();
        Components.preventPlayerBreakBlocks();
        Components.interactionController(this);
        lib.StructureUtils.placeAsync("picross:map_goldrush", { x: -31, y: -42, z: -31 }, { animationMode: minecraft.StructureAnimationMode.Layers, animationSeconds: 1 }).then(() => {
            this.placeBoard();
        });
    }
    exit() {
        lib.gameSystem.unsubscribeAllEvents();
    }
    // #region - 通用
    /** 是否为棋盘格方块 */
    isCell(typeId) {
        let permutation;
        try {
            permutation = minecraft.BlockPermutation.resolve(typeId);
        }
        catch {
            return false;
        }
        return permutation.hasTag(CellId);
    }
    // #endregion
    // #region - 场地放置
    /** 场地正中心。数织面板以此为几何中心。 */
    static BoardCenter = { x: 0, y: -41, z: 0 };
    /** 允许放置棋盘方块的 y。 */
    static CellBlockY = GameLevel.BoardCenter.y;
    /** 数字方块的 y。比棋盘格高一格，贴片正好压在格子上表面。 */
    static NumberBlockY = GameLevel.BoardCenter.y + 1;
    /** 放置数织面板。
     * - 面板以 (0, -41, 0) 为几何中心：棋盘格 y = -41，数字放 y = -40（比棋盘格高一格）。
     * - 面板宽 = 棋盘宽 + 各行线索个数的最大值；面板高 = 棋盘高 + 各列线索个数的最大值。
     *   例：某行线索为 `1 1 1`、棋盘宽 5，则该行占用 3 + 5 = 8 格；线索为 `3 1` 时占用 2 + 5 = 7 格。
     * - 行线索紧贴棋盘左侧并右对齐，列线索紧贴棋盘上方并下对齐。
     * - 棋盘格放置 `picross:cell`；数字放置 `picross:num_x`，cardinal_direction 统一为 north，
     *   即玩家站在南侧朝北看时文字正立——也就是行向 +z 递增、列向 +x 递增。
     * - 棋盘左上角（第 0 行第 0 列）的坐标写入 startLocation。
     * - 面板宽或高为偶数时无法严格居中，会向右、向上各多占一格。
     */
    placeBoard() {
        const rowClues = this.game.rowClues;
        const columnClues = this.game.columnClues;
        const height = rowClues.length;
        const width = columnClues.length;
        if (height === 0 || width === 0)
            throw new Error("棋盘尺寸为 0，无法放置面板");
        // 空线索表示"这一行/列整片留空"，用 0 表示，免得玩家以为漏画了
        const rows = rowClues.map(clue => (clue.length === 0 ? [0] : clue));
        const columns = columnClues.map(clue => (clue.length === 0 ? [0] : clue));
        // 线索区大小取所有行列里最宽的那一条，这样棋盘才能对齐
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
        // 棋盘格
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                dimension.setBlockType({ x: boardX + column, y: center.y, z: boardZ + row }, CellId);
            }
        }
        // 行线索：右对齐到棋盘左边
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
        // 列线索：下对齐到棋盘上边
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
    /** 在面板上放一个数字方块，朝向统一为北。
     * @param value 要显示的数字，0~30
     * @param x 方块 x 坐标
     * @param z 方块 z 坐标
     */
    placeNumber(value, x, z, dimension) {
        if (!Number.isInteger(value) || value < 0 || value > 30) {
            throw new Error(`线索数字 ${value} 超出 0~30，没有对应的方块`);
        }
        // 一次写到位（resolve 会补上没指定的状态），比"先放方块再改状态"少一次世界写入
        const permutation = minecraft.BlockPermutation.resolve(`${NumberBlockPrefix}${value}`, {
            "minecraft:cardinal_direction": "north",
        });
        dimension.setBlockPermutation({ x: x, y: GameLevel.NumberBlockY, z: z }, permutation);
    }
    // #endregion
    // #region - 场景交互
    /** 是否可以放置棋盘格方块。 */
    canPlaceCell(placeLocation, item) {
        if (!item)
            return false;
        if (!this.isCell(item.typeId))
            return false;
        if (placeLocation.y !== GameLevel.CellBlockY)
            return false;
        return true;
    }
    /** 更改线索方块的状态。 */
    changeClueState() { }
    /** 标记方块。会自动判断输入的方块是否为标准棋盘格。 */
    setBlockMarked(block) {
        if (block.typeId !== CellId)
            return;
        lib.BlockUtils.set({ id: CellMarkedId, location: block.location });
    }
    /** 取消标记方块。 */
    setBlockUnmarked(block) {
        if (block.typeId !== CellMarkedId)
            return;
        lib.BlockUtils.set({ id: CellId, location: block.location });
    }
    // #endregion
    test() { }
}
// #endregion
class Components {
    /** 阻止玩家破坏方块。
     * @description 阻止非开发者玩家破坏除棋盘格之外的方块。
     */
    static preventPlayerBreakBlocks() {
        lib.gameSystem.subscribeEvent("preventPlayerBreakBlocks", minecraft.world.beforeEvents.playerBreakBlock, event => {
            const { block, player } = event;
            const blockIsCell = block.hasTag(CellId);
            const playerIsDeveloper = player.hasTag("picross:developer");
            // 玩家只能破坏棋盘格，如果破坏了其他方块并且不是开发者时直接阻止
            if (!blockIsCell && !playerIsDeveloper)
                event.cancel = true;
        });
    }
    /** 交互控制器，控制游戏的交互。
     * @description 默认情况下，阻止任何交互。
     * @description 允许开发者进行任意程度的交互。
     * @description 允许玩家在规定高度放置棋盘方块。
     */
    static interactionController(level) {
        lib.gameSystem.subscribeEvent("preventPlayerPlaceBlocks", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            const { player, itemStack: item, isFirstEvent } = event;
            if (!isFirstEvent)
                return;
            event.cancel = true;
            // 允许开发者进行任意程度的交互
            const playerIsDeveloper = player.hasTag("picross:developer");
            if (playerIsDeveloper)
                event.cancel = true;
            // 允许玩家放置棋盘方块
            const placeLocation = lib.BlockUtils.getPlaceLocation(event);
            if (level.canPlaceCell(placeLocation, item))
                event.cancel = false;
        });
    }
    /** 当玩家和标记方块交互时，更改其状态。 */
    static changeMarkBlockState() {
        lib.gameSystem.subscribeEvent("changeMarkBlockState", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            const { block, isFirstEvent } = event;
            if (!isFirstEvent)
                return;
            // 当玩家和数字和箭头交互时，切换数字和箭头的解决状态
            if (block.hasTag("picross:clue") || block.hasTag("picross:arrow")) {
                // @ts-ignore
                const isSolved = block.permutation.getState("picross:solved");
                minecraft.system.run(() => lib.BlockUtils.setState(block, { "picross:solved": !isSolved }));
            }
        });
    }
}
minecraft.world.afterEvents.worldLoad.subscribe(event => {
    const level1 = new GameLevel(levels["1"]);
});
