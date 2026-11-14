import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as picross from "./picross";
import * as board from "./board";
import * as animation from "./animation";
import { goldRush } from "./settings";
import { levels } from "./levels/registry";
// #region 调试
/** 仅调试用：右键钻石切换开发者权限。开发者不受任何交互与破坏限制。 */
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
// #endregion
// #region 变量定义
/** 铅笔 ID。 */
const PencilId = "picross:pencil";
/** 橡皮 ID。 */
const EraserId = "picross:eraser";
/** 铅笔和橡皮 ID。 */
const PencilAndEraserId = "picross:pencil_and_eraser";
/** 退出关卡 ID。 */
const QuitLevelId = "picross:quit_level";
/** 点击即可切换完成状态的方块 tag。 */
const ClueTags = ["picross:clue", "picross:arrow"];
/** 游戏模式。 */
export var Mode;
(function (Mode) {
    /** 主线关卡。 */
    Mode["Main"] = "main";
    /** 迷你游戏 - 间隔模式。 */
    Mode["Gap"] = "gap";
    /** 迷你游戏 - 打乱模式。 */
    Mode["Shuffle"] = "shuffle";
    /** 迷你游戏 - 宽数字模式。 */
    Mode["WideClue"] = "wideClue";
    /** 迷你游戏 - 雷达模式。 */
    Mode["Radar"] = "radar";
    /** 拼图模式。 */
    Mode["Mosaic"] = "mosaic";
    /** 自定义模式。 */
    Mode["CustomMode"] = "customMode";
    /** 1 代普通关卡。 */
    Mode["Picross1Normal"] = "picross1Normal";
    /** 1 代困难关卡。 */
    Mode["Picross1Hard"] = "picross1Hard";
    /** 1 代间隔模式。 */
    Mode["Picross1Gap"] = "picross1Gap";
    /** 1 代打乱模式。 */
    Mode["Picross1Shuffle"] = "picross1Shuffle";
})(Mode || (Mode = {}));
// #endregion
// #region 游戏记录
/** 游戏记录。 */
let progress = {
    main: { chapter: 0, level: 0 },
    gap: { chapter: 0, level: 0 },
    shuffle: { chapter: 0, level: 0 },
    wideClue: { chapter: 0, level: 0 },
    radar: { chapter: 0, level: 0 },
    mosaic: { chapter: 0, level: 0 },
    customMode: { chapter: 0, level: 0 },
    picross1Normal: { chapter: 0, level: 0 },
    picross1Hard: { chapter: 0, level: 0 },
    picross1Gap: { chapter: 0, level: 0 },
    picross1Shuffle: { chapter: 0, level: 0 },
};
// #endregion
// #region 游戏菜单
/** 一个选关界面。 */
class ChooseLevelMenu {
    /** @param chapter 设置为`0`时代表使用教程关卡。 */
    constructor(mode, chapter) {
        this.mode = mode;
        this.chapter = chapter;
        this.start();
    }
    /** 该选关页面所对应的模式。 */
    mode;
    /** 选关页面对应的章节。 */
    chapter;
    /** 当前正在运行的关卡。 */
    level;
    /** 进入菜单页面。 */
    start() {
        // ===== 关卡初始化 =====
        // 终止所有时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        // 设置当前未开启任何关卡
        this.level = void 0;
        // 播放音乐并移除玩家的物品
        lib.PlayerUtils.getAll().forEach(player => this.initPlayer(player));
        // 放置关卡编号（临时）
        lib.BlockUtils.set({
            id: "picross:clue_block_1",
            location: { x: -4, y: -40, z: -2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_2",
            location: { x: -2, y: -40, z: -2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_3",
            location: { x: 0, y: -40, z: -2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_4",
            location: { x: 2, y: -40, z: -2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_5",
            location: { x: 4, y: -40, z: -2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_6",
            location: { x: -4, y: -40, z: 0 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_7",
            location: { x: -2, y: -40, z: 0 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_8",
            location: { x: 0, y: -40, z: 0 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_9",
            location: { x: 2, y: -40, z: 0 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_10",
            location: { x: 4, y: -40, z: 0 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_11",
            location: { x: -4, y: -40, z: 2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_12",
            location: { x: -2, y: -40, z: 2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_13",
            location: { x: 0, y: -40, z: 2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_14",
            location: { x: 2, y: -40, z: 2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        lib.BlockUtils.set({
            id: "picross:clue_block_15",
            location: { x: 4, y: -40, z: 2 },
            states: { "minecraft:cardinal_direction": "north" },
        });
        // ===== 玩家破坏方块检测 =====
        // 阻止玩家破坏一切方块，不阻止开发者
        lib.gameSystem.subscribeEvent("playerBreakBlockTest", minecraft.world.beforeEvents.playerBreakBlock, event => {
            event.cancel = !event.player.hasTag("picross:developer");
        });
        // ===== 玩家破坏方块检测 =====
        // 阻止玩家的一切交互，不阻止开发者
        lib.gameSystem.subscribeEvent("playerInteractWithBlockTest", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            event.cancel = !event.player.hasTag("picross:developer");
            if (!event.isFirstEvent)
                return;
            // 如果玩家和关卡编号交互，则尝试启动关卡（临时）
            if (event.block.typeId === "picross:clue_block_1")
                minecraft.system.run(() => this.startLevel(1));
            else if (event.block.typeId === "picross:clue_block_2")
                minecraft.system.run(() => this.startLevel(2));
            else if (event.block.typeId === "picross:clue_block_3")
                minecraft.system.run(() => this.startLevel(3));
            else if (event.block.typeId === "picross:clue_block_4")
                minecraft.system.run(() => this.startLevel(4));
            else if (event.block.typeId === "picross:clue_block_5")
                minecraft.system.run(() => this.startLevel(5));
            else if (event.block.typeId === "picross:clue_block_6")
                minecraft.system.run(() => this.startLevel(6));
            else if (event.block.typeId === "picross:clue_block_7")
                minecraft.system.run(() => this.startLevel(7));
            else if (event.block.typeId === "picross:clue_block_8")
                minecraft.system.run(() => this.startLevel(8));
            else if (event.block.typeId === "picross:clue_block_9")
                minecraft.system.run(() => this.startLevel(9));
            else if (event.block.typeId === "picross:clue_block_10")
                minecraft.system.run(() => this.startLevel(10));
            else if (event.block.typeId === "picross:clue_block_11")
                minecraft.system.run(() => this.startLevel(11));
            else if (event.block.typeId === "picross:clue_block_12")
                minecraft.system.run(() => this.startLevel(12));
            else if (event.block.typeId === "picross:clue_block_13")
                minecraft.system.run(() => this.startLevel(13));
            else if (event.block.typeId === "picross:clue_block_14")
                minecraft.system.run(() => this.startLevel(14));
            else if (event.block.typeId === "picross:clue_block_15")
                minecraft.system.run(() => this.startLevel(15));
        });
        // ===== 有新玩家加入时 =====
        // 播放音乐
        lib.gameSystem.subscribeEvent("playerJoinGame", minecraft.world.afterEvents.playerSpawn, event => {
            const { initialSpawn, player } = event;
            if (!initialSpawn)
                return;
            this.initPlayer(player);
        });
    }
    /** 开始关卡。 */
    startLevel(level) {
        const levelData = this.getGameData(level);
        if (!levelData)
            return minecraft.world.sendMessage(`§c不合法的关卡。请确认关卡 ${this.mode}: ${this.chapter}-${level} 是否存在`);
        this.level = new Level(this, levelData);
        lib.PlayerUtils.getAll().forEach(player => player.stopMusic());
    }
    /** 获取关卡数据。
     * @returns 该方法可能会在模式、章节或关卡不正确时返回`undefined`，或在指定的章节内不存在关卡时返回`undefined`。
     */
    getGameData(level) {
        return levels[this.mode][this.chapter]?.[level - 1];
    }
    /** 当主菜单初始化或玩家重新进入时，初始化玩家。 */
    initPlayer(player) {
        player.playMusic("select_common_level", { loop: true, fade: 1 });
        lib.ItemUtils.removeItem(player);
    }
}
// #endregion
// #region 关卡
/** 代表一个游戏关卡。 */
export class Level {
    constructor(menu, data) {
        this.menu = menu;
        this.mode = menu.mode;
        this.chapter = menu.chapter;
        this.game = new picross.PicrossGame(data, data);
        this.figureStructureId = data.figureStructureId;
        this.layout = board.getLayout(this.game);
        this.start();
    }
    /** 该关卡对应的选关界面。 */
    menu;
    /** 该关卡对应的模式。 */
    mode;
    /** 关卡对应的章节。 */
    chapter;
    /** 代表本关使用的数织实例。 */
    game;
    /** 通关后展示的图案结构 ID。 */
    figureStructureId;
    /** 本关的布局。 */
    layout;
    /** 面板是否可操作。 */
    boardOperable = false;
    // #region - 启动与退场
    /** 关卡是否已结束。 */
    finished = false;
    /** 退场流程是否已经启动。 */
    exiting = false;
    /** 启动关卡。 */
    start() {
        // ===== 关卡初始化 =====
        // 终止所有时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        // 播放开始动画
        animation.playStartAnimation(this, {
            onFinished: () => {
                // 给予玩家物品
                lib.PlayerUtils.getAll().forEach(player => {
                    lib.ItemUtils.inventory.set(player, 0, PencilAndEraserId, { itemLock: minecraft.ItemLockMode.slot });
                    lib.ItemUtils.inventory.set(player, 1, board.CellBlockId, { itemLock: minecraft.ItemLockMode.slot });
                    lib.ItemUtils.inventory.set(player, 8, QuitLevelId, { itemLock: minecraft.ItemLockMode.slot });
                });
            },
        });
        // ===== 玩家破坏方块检测 =====
        // 阻止玩家破坏除了格子方块之外的一切方块，不阻止开发者
        lib.gameSystem.subscribeEvent("playerBreakBlockTest", minecraft.world.beforeEvents.playerBreakBlock, event => {
            const { block, player } = event;
            event.cancel = !player.hasTag("picross:developer");
            if (!this.boardOperable)
                return; // 在播放动画时也禁止，防止玩家在播放动画时和盘面交互
            if (block.hasTag(board.CellBlockId)) {
                event.cancel = false;
                minecraft.system.run(() => this.breakCellBlock(block.location));
            }
        });
        // ===== 玩家使用物品检测 =====
        // 当玩家使用了退出物品后，离开关卡
        lib.gameSystem.subscribeEvent("playerUseItemTest", minecraft.world.afterEvents.itemUse, event => {
            const { itemStack } = event;
            if (itemStack.typeId === QuitLevelId)
                this.exit();
        });
        /** 每位玩家本轮按住期间已经处理过的方块。 */
        const handledBlocks = new Map();
        /** 每位玩家本轮按住期间锁定的工具模式，只有「铅笔和橡皮」会用到。 */
        const lockedPaintModes = new Map();
        /** 尝试处理正被交互的格子方块/标记的格子方块。
         * @returns 返回格子方块/标记的格子方块在本轮交互中是否已被交互过。
         */
        const tryHandle = (player, location) => {
            let handled = handledBlocks.get(player.id);
            if (!handled) {
                handled = new Set();
                handledBlocks.set(player.id, handled);
            }
            const key = lib.Vector3Utils.toString(location);
            if (handled.has(key))
                return true;
            handled.add(key);
            return false;
        };
        /** 解析铅笔、橡皮、铅笔和橡皮在本次交互中使用的填涂模式。
         * @returns 当初始填涂的方块不是格子方块/标记的格子方块时、或不为铅笔、橡皮、铅笔与橡皮中的任意一个时返回 `undefined`（不锁定）。
         */
        const resolvePaintMode = (player, block, tool) => {
            // 当使用对应工具时，使用对应模式
            if (tool === PencilId)
                return "mark";
            if (tool === EraserId)
                return "erase";
            if (tool !== PencilAndEraserId)
                return undefined;
            // 如果已经确定过填涂模式，则直接使用之
            const locked = lockedPaintModes.get(player.id);
            if (locked)
                return locked;
            // 否则，由初始填涂的方块确定填涂模式，并同步到 lockedPaintModes 中
            const mode = block.typeId === board.CellBlockId ? "mark" : block.typeId === board.CellMarkedBlockId ? "erase" : undefined;
            if (mode)
                lockedPaintModes.set(player.id, mode);
            return mode;
        };
        lib.gameSystem.subscribeEvent("playerInteractWithBlockTest", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            const { player, itemStack: item, isFirstEvent, block } = event;
            event.cancel = !player.hasTag("picross:developer"); // 允许开发者的交互
            if (!this.boardOperable)
                return; // 在播放动画时也禁止，防止玩家在播放动画时和盘面交互
            // --- 1. 在允许的高度下使用格子方块的交互 ---
            if (board.isCellBlock(item?.typeId ?? "")) {
                const placeLocation = lib.BlockUtils.getPlaceLocation(event);
                if (placeLocation.y === goldRush.boardCenter.y && !tryHandle(player, placeLocation)) {
                    event.cancel = false;
                    minecraft.system.run(() => this.placeCellBlock(placeLocation));
                    return;
                }
            }
            // --- 2. 与格子方块、标记的格子方块的方块交互，以及和线索方块的交互 ---
            if (isFirstEvent) {
                handledBlocks.delete(player.id);
                lockedPaintModes.delete(player.id);
            }
            if (ClueTags.some(clueTag => block.hasTag(clueTag))) {
                if (tryHandle(player, block.location))
                    return;
                minecraft.system.run(() => this.changeClueAndArrowBlockState(block));
                return;
            }
            const paintMode = resolvePaintMode(player, block, item?.typeId);
            if (paintMode === "mark" && block.typeId === board.CellBlockId) {
                if (tryHandle(player, block.location))
                    return;
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "block.cartography_table.use", location: block.location });
                    this.setCellBlockMarked(block);
                });
                return;
            }
            if (paintMode === "erase" && block.typeId === board.CellMarkedBlockId) {
                if (tryHandle(player, block.location))
                    return;
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "item.bone_meal.use", soundOptions: { pitch: 1.5 }, location: block.location });
                    this.setCellBlockUnmarked(block);
                });
                return;
            }
        });
    }
    /** 完成谜题。 */
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        // 禁止玩家操作面板
        this.boardOperable = false;
        // 播放结束音乐和动画
        lib.PlayerUtils.getAll().forEach(player => player.playMusic("finish", { loop: true }));
        animation.playFinishAnimation(this);
    }
    /** 离开关卡并播放退场动画。 */
    exit() {
        if (this.exiting)
            return;
        this.exiting = true;
        // 终止所有时间线和事件
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        // 禁止玩家操作面板
        this.boardOperable = false;
        // 播放结束动画，并在播放结束之后返回菜单
        animation.playExitAnimation(this).then(() => {
            this.menu.start();
        });
    }
    /** 当动画程序执行错误时执行的方法，防止玩家被彻底锁定。 */
    fail(cause) {
        minecraft.world.sendMessage(`§c关卡出错：${cause}`);
        this.boardOperable = true;
        lib.PlayerUtils.unlockPlayers();
    }
    /** 加载场地结构。 */
    loadScene(animationSeconds = 1) {
        return lib.StructureUtils.placeAsync(goldRush.structureId, goldRush.structureLocation, {
            animationMode: minecraft.StructureAnimationMode.Layers,
            animationSeconds,
        });
    }
    // #endregion
    // #region - 场景状态更改
    /** 将 Minecraft 层面的方块更改应用到游戏实例上。 */
    applyChangeToGameInstance(location, state) {
        const { column, row } = this.getPicrossLocation(location);
        // 对行列状态进行修改
        if (state === picross.CellState.Blank)
            this.game.markBlank(row, column);
        else if (state === picross.CellState.Filled)
            this.game.markFilled(row, column);
        else if (state === picross.CellState.Unknown)
            this.game.markUnknown(row, column);
        // 检查谜题是否已解决
        const puzzleSolved = this.game.isSolved();
        if (puzzleSolved)
            this.finish();
    }
    /** 更改线索方块或箭头方块的状态。 */
    changeClueAndArrowBlockState(block) {
        // @ts-ignore
        const isSolved = block.permutation.getState("picross:solved");
        lib.BlockUtils.setState(block, { "picross:solved": !isSolved });
    }
    /** 标记格子方块。会自动判断输入的方块是否为标准格子方块。 */
    setCellBlockMarked(block) {
        if (block.typeId !== board.CellBlockId)
            return;
        lib.BlockUtils.set({ id: board.CellMarkedBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Blank);
    }
    /** 取消标记格子方块。 */
    setCellBlockUnmarked(block) {
        if (block.typeId !== board.CellMarkedBlockId)
            return;
        lib.BlockUtils.set({ id: board.CellBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Unknown);
    }
    /** 玩家放置格子方块。 */
    placeCellBlock(location) {
        this.applyChangeToGameInstance(location, picross.CellState.Unknown);
    }
    /** 玩家破坏格子方块。 */
    breakCellBlock(location) {
        this.applyChangeToGameInstance(location, picross.CellState.Filled);
    }
    /** 将 Minecraft 坐标转换为 Picross 游戏实例的行列坐标。 */
    getPicrossLocation(location) {
        const start = this.layout.startLocation;
        return { column: location.x - start.x, row: location.z - start.z };
    }
}
// #endregion
// #region 入口
minecraft.world.afterEvents.worldLoad.subscribe(() => {
    async function loadGame() {
        await lib.StructureUtils.placeAsync(goldRush.structureId, goldRush.structureLocation, {
            animationMode: minecraft.StructureAnimationMode.Layers,
            animationSeconds: 1,
        });
        // 在实例化主菜单之前，需要尝试添加预加载的常加载区域，否则会报错
        const alreadyHasTickingarea = lib.DimensionUtils.getOverworld().runCommand("tickingarea add -64 0 -64 63 0 63 gameArea true"); // 因为2.4.0的脚本没有常加载区域方法，先凑合着用命令 :)
        if (alreadyHasTickingarea.successCount === 0)
            await minecraft.system.waitTicks(40);
        new ChooseLevelMenu(Mode.Main, 1);
    }
    loadGame();
});
// #endregion
