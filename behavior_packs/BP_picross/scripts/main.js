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
/** 面板出现动画的时间线 ID。正常播完由回调返回 false 自行终止，中途退关则按这个 ID 精准取消。 */
const BoardAppearTimelineId = "level/boardAppear";
/** 开场动画的时间线 ID。 */
const StartAnimationTimelineId = "level/startAnimation";
// #endregion
// #region 系统
/** Minecraft 数织系统。 */
class MinecraftPicrossSystem {
}
export class Settings {
    /** 开始动画设置。 */
    startAnimation = {
        enabled: true,
        playerCameraFadeInTime: 0.25,
        playerCameraHoldTime: 0.5,
        playerCameraFadeOutTime: 0.25,
        showCellAnimationTime: 1,
        holdCellTime: 2,
        cameraHeight: 35,
    };
}
/** 设置。 */
const settings = new Settings();
const goldRush = {
    structureId: "picross:map_goldrush",
    structureLocation: { x: -31, y: -42, z: -31 },
    boardCenter: { x: 0, y: -41, z: 0 },
};
// #endregion
// #region 关卡
class Menu {
}
/** 代表一个游戏关卡。 */
class Level {
    constructor(puzzle, options) {
        this.game = new picross.PicrossGame(puzzle, options);
        this.start();
    }
    /** 代表本关使用的数织实例。 */
    game;
    /** 代表本关左上角的格子方块的起始点，根据此坐标点计算玩家挖掉的方块位于盘面的何坐标下。 */
    startLocation = { x: 0, y: 0, z: 0 };
    /** 面板是否已完整出现。动画播放期间为 `false`，此时屏蔽玩家操作。 */
    boardReady = false;
    // #region - 启动与退场
    /** 启动关卡。 */
    start() {
        Components.interactionController(this);
        Components.preventPlayerBreakBlocks(this);
        // 先算布局：纯计算，算不出来就不必再加载场地了
        let layout;
        try {
            layout = this.getBoardLayout();
        }
        catch (cause) {
            this.fail(cause);
            return;
        }
        if (settings.startAnimation.enabled)
            this.playStartAnimation(layout);
        else
            this.loadScene().then(() => this.placeBoard(layout), cause => this.fail(cause));
    }
    /** 离开关卡。 */
    exit() {
        // 退关就该把本系统挂在 gameSystem 上的时间线全部收掉，否则动画会在退关后继续铺方块
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();
        lib.PlayerUtils.unlockPlayers();
    }
    /** 任何一步出错都走这里：报原因、解锁操作、把镜头交还玩家。
     * @description 不这样收尾的话，玩家会被留在黑屏且不能动的世界里。
     */
    fail(cause) {
        minecraft.world.sendMessage(`§c关卡启动失败：${String(cause)}`);
        this.boardReady = true;
        lib.PlayerUtils.unlockPlayers();
    }
    /** 加载场地结构。
     * @param animationSeconds 场地加载的时长，单位：秒。
     */
    loadScene(animationSeconds = 1) {
        return lib.StructureUtils.placeAsync(goldRush.structureId, goldRush.structureLocation, {
            animationMode: minecraft.StructureAnimationMode.Layers,
            animationSeconds,
        });
    }
    // #endregion
    // #region - 开场动画
    /** 秒换算成游戏刻。基岩版每秒 20 刻。 */
    static toTicks(seconds) {
        return Math.max(0, Math.round(seconds * 20));
    }
    /** 玩家在棋盘上的站位：棋盘中心的南侧一格，脚下正好踩在格子方块上。 */
    static getViewpoint(layout) {
        return { x: layout.cellCenter.x, y: layout.cellCenter.y + 1, z: layout.boardRect.to.z + 1 };
    }
    /** 播放开场动画：黑屏 → 架镜头看场地升起 → 盘面逐层出现 → 交还操作。 */
    playStartAnimation(layout) {
        const animation = settings.startAnimation;
        const players = lib.PlayerUtils.getAll();
        // 各阶段的边界先换算成 tick，后面判断时就不必反复累加秒数。
        // 淡入至少留 1 tick，否则时长为 0 时 `time === fadeInTicks` 永远不成立。
        const fadeInTicks = Math.max(1, Level.toTicks(animation.playerCameraFadeInTime));
        const holdTicks = Level.toTicks(animation.playerCameraHoldTime);
        const fadeOutTicks = Level.toTicks(animation.playerCameraFadeOutTime);
        const boardTicks = fadeInTicks + holdTicks + fadeOutTicks;
        const endTicks = boardTicks + Level.toTicks(animation.showCellAnimationTime) + Level.toTicks(animation.holdCellTime);
        players.forEach(player => {
            player.camera.fade({
                fadeTime: {
                    fadeInTime: animation.playerCameraFadeInTime,
                    holdTime: animation.playerCameraHoldTime,
                    fadeOutTime: animation.playerCameraFadeOutTime,
                },
            });
        });
        const started = lib.gameSystem.subscribeTimeline(StartAnimationTimelineId, time => {
            // 屏幕完全变黑的一刻：场地开始升起，镜头架到盘面正上方
            if (time === fadeInTicks) {
                void this.loadScene((holdTicks + fadeOutTicks) / 20).catch(cause => this.fail(cause));
                players.forEach(player => {
                    player.camera.setCamera("minecraft:free", {
                        location: { ...goldRush.boardCenter, y: goldRush.boardCenter.y + animation.cameraHeight },
                        rotation: { x: 89.9, y: 180 },
                    });
                    // 趁黑屏把玩家挪到棋盘南侧，镜头交还时人已经站好了
                    player.teleport(Level.getViewpoint(layout), { rotation: { x: 0, y: 180 } });
                });
                lib.PlayerUtils.lockPlayers();
            }
            // 淡出结束：场地已就位，开始铺盘面。
            // 不写 return，这样淡入与持续时长为 0 导致两个时间点重合时也能同 tick 跑完。
            if (time === boardTicks) {
                this.placeBoard(layout);
            }
            // 展示够了，把镜头和操作交还玩家。
            // 这里再传送一次：开场时场地还没升起，玩家会往下掉，落地位置不一定在棋盘上。
            // 和 camera.clear() 放在同一 tick，玩家看到的是"镜头切回来人已经站好了"。
            if (time >= endTicks) {
                players.forEach(player => {
                    player.teleport(Level.getViewpoint(layout), { rotation: { x: 0, y: 180 } });
                });
                lib.PlayerUtils.unlockPlayers();
                return false;
            }
        });
        if (!started)
            this.fail(new Error("开场动画的时间线已被占用，可能上一关没有退出干净"));
    }
    // #endregion
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
    /** 将 Minecraft 坐标转换为 Picross 游戏实例的行列坐标。 */
    getPicrossLocation(location) {
        return { column: location.x - this.startLocation.x, row: location.z - this.startLocation.z };
    }
    /** 将 Picross 行列坐标转换为 Minecraft 游戏实例的坐标。 */
    getMinecraftLocation(position) {
        return {
            x: position.column + this.startLocation.x,
            y: goldRush.boardCenter.y,
            z: position.row + this.startLocation.z,
        };
    }
    // #endregion
    // #region - 场地放置
    /** 放置数织面板，并把盘面左上角写入 startLocation。
     * @param layout 已经算好的布局；不传则现算一次。
     */
    placeBoard(layout) {
        try {
            const resolved = layout ?? this.getBoardLayout();
            this.startLocation = resolved.startLocation;
            const dimension = minecraft.world.getDimension("overworld");
            // 不播开场动画时一次性铺满
            if (!settings.startAnimation.enabled) {
                this.renderBoardInstant(resolved, dimension);
                this.boardReady = true;
                return;
            }
            const steps = this.createRenderSteps(resolved, dimension);
            const cellTicks = Level.toTicks(settings.startAnimation.showCellAnimationTime);
            this.playRenderSteps(steps, cellTicks, () => this.renderBoardInstant(resolved, dimension));
        }
        catch (cause) {
            this.fail(cause);
        }
    }
    /** 获取盘面布局。该方法不会放置任何方块。 */
    getBoardLayout() {
        const rowClues = this.game.rowClues;
        const columnClues = this.game.columnClues;
        const height = rowClues.length;
        const width = columnClues.length;
        if (height === 0 || width === 0)
            throw new Error("盘面尺寸为 0，无法放置面板");
        // 空线索用 0 表示
        const rows = rowClues.map(clue => (clue.length === 0 ? [0] : clue));
        const columns = columnClues.map(clue => (clue.length === 0 ? [0] : clue));
        // 线索区大小取所有行列里最宽的那一条
        let clueColumns = 0;
        for (const clue of rows)
            clueColumns = Math.max(clueColumns, clue.length);
        let clueRows = 0;
        for (const clue of columns)
            clueRows = Math.max(clueRows, clue.length);
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
        // 锁定格直接由行列坐标换算，不依赖还未写入的 startLocation
        const locked = this.game.getLockedCells().map(position => ({
            x: position.column + boardX,
            y: cellY,
            z: position.row + boardZ,
        }));
        return {
            startLocation: { x: boardX, y: cellY, z: boardZ },
            cellCenter: { x: boardX + (width - 1) / 2, y: cellY, z: boardZ + (height - 1) / 2 },
            boardRect: { from: { x: boardX, y: cellY, z: boardZ }, to: { x: boardX + width - 1, y: cellY, z: boardZ + height - 1 } },
            rowRects,
            rowClues: rowClueList,
            columnClues: columnClueList,
            locked,
        };
    }
    /** 一次性铺满整个面板。 */
    renderBoardInstant(layout, dimension) {
        lib.BlockUtils.fill({ id: CellBlockId, from: layout.boardRect.from, to: layout.boardRect.to }, {}, dimension);
        for (const clue of layout.rowClues)
            this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);
        for (const clue of layout.columnClues)
            this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);
        for (const location of layout.locked)
            dimension.setBlockType(location, CellLockedBlockId);
    }
    /** 把布局切成一帧帧的渲染动作。
     * @description 每一帧对应一个 tick 里要做的事，帧数决定动画粒度。
     * 整个面板当作一张纸从上往下扫：列线索区先出，再接棋盘逐行。
     */
    createRenderSteps(layout, dimension) {
        const steps = [];
        const placeNumber = (clue) => {
            this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);
        };
        const placeLockedCell = (location) => {
            dimension.setBlockType(location, CellLockedBlockId);
        };
        // 列线索先按层出现：从面板最上边一路扫到棋盘顶边
        const clueLayers = new Map();
        for (const clue of layout.columnClues) {
            const layer = clueLayers.get(clue.location.z);
            if (layer === undefined)
                clueLayers.set(clue.location.z, [clue]);
            else
                layer.push(clue);
        }
        for (const z of [...clueLayers.keys()].sort((left, right) => left - right)) {
            const layer = clueLayers.get(z);
            steps.push(() => {
                if (layer === undefined)
                    return;
                for (const clue of layer)
                    placeNumber(clue);
            });
        }
        // 接着逐行铺棋盘，行线索和锁定格跟着所在行一起出现
        for (const rect of layout.rowRects) {
            steps.push(() => {
                lib.BlockUtils.fill({ id: CellBlockId, from: rect.from, to: rect.to }, {}, dimension);
                for (const clue of layout.rowClues) {
                    if (clue.row === rect.row)
                        placeNumber(clue);
                }
                for (const location of layout.locked) {
                    if (location.z === rect.from.z)
                        placeLockedCell(location);
                }
            });
        }
        return steps;
    }
    /** 按 tick 播放渲染帧。
     * @param steps 渲染动作，按顺序执行。
     * @param targetTicks 这批帧要在多少 tick 内播完。
     * @param fallback 时间线订阅失败时一次性铺满。
     */
    playRenderSteps(steps, targetTicks, fallback) {
        const frames = steps.length;
        const ticks = Math.max(1, Math.floor(targetTicks));
        // 首帧立刻出现，其余帧在剩下的 tick 里匀速铺开。
        // 只用"每 tick 固定刷几帧"撑不到长时长：5×5 才 7 帧，一 tick 一帧也只能拖到 7 tick。
        const rate = frames > 1 && ticks > 1 ? (frames - 1) / (ticks - 1) : frames;
        let accumulator = 1;
        let index = 0;
        const started = lib.gameSystem.subscribeTimeline(BoardAppearTimelineId, () => {
            try {
                accumulator += rate;
                while (accumulator >= 1 && index < frames) {
                    steps[index++]?.();
                    accumulator -= 1;
                }
            }
            catch (cause) {
                this.fail(cause);
                return false;
            }
            if (index >= frames) {
                this.boardReady = true;
                return false;
            }
        });
        if (!started) {
            // 同名时间线已存在（例如上一关没退干净），直接铺满，免得盘面永远出不来
            minecraft.world.sendMessage("§e面板出现动画未能启动，已改为直接铺满");
            fallback();
            this.boardReady = true;
        }
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
        dimension.setBlockPermutation({ x: x, y: goldRush.boardCenter.y + 1, z: z }, permutation);
    }
    // #endregion
    // #region - 场景状态更改
    /** 将 Minecraft 层面的方块更改应用到游戏实例上。
     * @returns 返回谜题是否已被解决。
     */
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
        // 调试用
        let debugMessage = `§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §a${state}§7 状态`;
        if (puzzleSolved)
            debugMessage = debugMessage + `\n§b谜题已被解开！`;
        lib.Debug.sendMessage(debugMessage, "actionBar");
        return puzzleSolved;
    }
    /** 更改线索方块或箭头方块的状态。 */
    changeClueAndArrowBlockState(block) {
        // @ts-ignore
        const isSolved = block.permutation.getState("picross:solved");
        lib.BlockUtils.setState(block, { "picross:solved": !isSolved });
    }
    /** 标记格子方块。会自动判断输入的方块是否为标准格子方块。 */
    setCellBlockMarked(block) {
        if (block.typeId !== CellBlockId)
            return;
        lib.BlockUtils.set({ id: CellMarkedBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Blank);
    }
    /** 取消标记格子方块。 */
    setCellBlockUnmarked(block) {
        if (block.typeId !== CellMarkedBlockId)
            return;
        lib.BlockUtils.set({ id: CellBlockId, location: block.location });
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
}
// #endregion
// #region 组件
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
            // 面板还没出全时不允许破坏格子，否则玩家会在半成品盘面上操作
            if (!level.boardReady)
                return;
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
            // 面板还没出全时屏蔽一切交互，避免玩家对着半成品盘面操作
            if (!level.boardReady)
                return;
            // 允许玩家在规定高度放置格子方块
            const placeLocation = lib.BlockUtils.getPlaceLocation(event);
            if (Level.itemIsCellBlock(item?.typeId ?? "") && placeLocation.y === goldRush.boardCenter.y) {
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
// #endregion
minecraft.world.afterEvents.worldLoad.subscribe(event => {
    const level = 10010;
    const puzzle = levels[level];
    const options = levels[level];
    // 当前存在问题：区块未完全加载会报错
    if (puzzle && options)
        new Level(puzzle, options);
});
