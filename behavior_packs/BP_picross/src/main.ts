import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as picross from "./picross";
import * as board from "./board";
import * as animation from "./animation";
import { goldRush } from "./settings";
import type { LevelData } from "./levels/type";

// #region 调试

/** 仅调试用：右键钻石切换开发者权限。开发者不受任何交互与破坏限制。 */
minecraft.world.afterEvents.itemUse.subscribe(event => {
    const { source: player, itemStack: diamond } = event;
    if (diamond.typeId !== "minecraft:diamond") return;
    const playerHasPermission = player.hasTag("picross:developer");
    if (playerHasPermission) {
        player.removeTag("picross:developer");
        player.sendMessage("§c已移除开发者权限");
    } else {
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

/** 点击即可切换完成状态的方块 tag。 */
const ClueTags = ["picross:clue", "picross:arrow"];

// #endregion

// #region 游戏菜单

class Menu {
    constructor() {
        this.levelCompleted = (minecraft.world.getDynamicProperty("levelCompleted") as number | undefined) ?? 0;
    }

    /** 当前的关卡进度。 */
    levelCompleted = 0;

    /** 进入菜单页面。 */
    start() {
        // 放置关卡编号
        let placingLevel = 0;
    }
}

const menu = new Menu();

// #endregion

// #region 关卡

/** 代表一个游戏关卡。 */
class Level {
    constructor(data: LevelData) {
        this.game = new picross.PicrossGame(data, data);
        this.figureStructureId = data.figureStructureId;
        this.layout = board.getLayout(this.game);
        this.start();
    }

    /** 代表本关使用的数织实例。 */
    game: picross.PicrossGame;

    /** 通关后展示的图案结构 ID。 */
    figureStructureId: string | undefined;

    /** 本关的布局。 */
    layout: board.BoardLayout | undefined;

    /** 面板是否可操作。 */
    boardOperable = false;

    /** 关卡是否已结束。 */
    finished = false;

    /** 退场流程是否已经启动，避免 `exit()` 被调两次叠出两段动画。 */
    private exiting = false;

    // #region - 启动与退场

    /** 启动关卡。 */
    start() {
        Components.interactionController(this);
        Components.preventPlayerBreakBlocks(this);

        // 开场音乐跟着黑屏淡出的那一拍起，时序在动画里
        try {
            animation.playStartAnimation(this.getAnimationContext());
        } catch (cause) {
            this.fail(cause);
        }
    }

    /** 离开关卡：播完退场动画，动画里会重置场地并在场地恢复后解锁玩家。 */
    exit() {
        if (this.exiting) return;
        this.exiting = true;

        // 退关就该把本系统挂在 gameSystem 上的时间线和事件全部收掉，否则旧动画会在退关后继续铺方块
        lib.gameSystem.unsubscribeAllTimelines();
        lib.gameSystem.unsubscribeAllEvents();

        // 退场期间玩家不能再碰盘面
        this.boardOperable = false;

        // 布局都没算出来，说明开场就失败了，没什么场地要重置，解锁走人即可
        if (this.layout === undefined) {
            lib.PlayerUtils.unlockPlayers();
            return;
        }

        // 动画自己出错会走 fail，这里不必再接
        try {
            animation.playExitAnimation(this.getAnimationContext());
        } catch (cause) {
            this.fail(cause);
        }
    }

    /** 谜题完成后调用。重复触发只生效一次。 */
    private finish() {
        if (this.finished) return;
        this.finished = true;

        // 立刻掐掉盘面操作，后面整段动画期间玩家都碰不到格子
        this.boardOperable = false;

        try {
            // 擦除与展示都要垫音乐，所以在这里就开播
            lib.PlayerUtils.getAll().forEach(player => player.playMusic("finish", { loop: true }));
            animation.playFinishAnimation(this.getAnimationContext());
        } catch (cause) {
            // 擦盘或架镜头出错时别把玩家留在锁定状态
            this.fail(cause);
        }
    }

    /** 任何一步出错都走这里：报原因、解锁操作，避免玩家被留在黑屏且不能动的世界里。 */
    private fail(cause: unknown) {
        minecraft.world.sendMessage(`§c关卡出错：${String(cause)}`);
        this.boardOperable = true;
        lib.PlayerUtils.unlockPlayers();
    }

    /** 打包动画需要的那一套能力。动画只拿到自己用得上的东西，不碰关卡的其它状态。 */
    private getAnimationContext(): animation.AnimationContext {
        const layout = this.layout;
        if (layout === undefined) throw new Error("盘面尚未布局，无法播放动画");

        return {
            layout,
            figureStructureId: this.figureStructureId,
            levelName: this.game.name,
            setBoardOperable: operable => {
                this.boardOperable = operable;
            },
            loadScene: seconds => this.loadScene(seconds),
            fail: cause => this.fail(cause),
        };
    }

    /** 加载场地结构。
     * @param animationSeconds 场地加载的时长，单位：秒。
     */
    private loadScene(animationSeconds = 1) {
        return lib.StructureUtils.placeAsync(goldRush.structureId, goldRush.structureLocation, {
            animationMode: minecraft.StructureAnimationMode.Layers,
            animationSeconds,
        });
    }

    // #endregion

    // #region - 场景状态更改

    /** 将 Minecraft 层面的方块更改应用到游戏实例上。
     * @returns 返回谜题是否已被解决。
     */
    private applyChangeToGameInstance(location: minecraft.Vector3, state: picross.CellState): boolean {
        const { column, row } = this.getPicrossLocation(location);

        // 对行列状态进行修改
        if (state === picross.CellState.Blank) this.game.markBlank(row, column);
        else if (state === picross.CellState.Filled) this.game.markFilled(row, column);
        else if (state === picross.CellState.Unknown) this.game.markUnknown(row, column);

        // 检查谜题是否已解决，解开就进入结束流程
        const puzzleSolved = this.game.isSolved();
        if (puzzleSolved) this.finish();

        // 调试用
        let debugMessage = `§7已将盘面的第 §a${row + 1}§7 行，第 §a${column + 1}§7 列更改为 §a${state}§7 状态`;
        if (puzzleSolved) debugMessage = debugMessage + `\n§b谜题已被解开！`;
        lib.Debug.sendMessage(debugMessage, "actionBar");

        return puzzleSolved;
    }

    /** 更改线索方块或箭头方块的状态。 */
    changeClueAndArrowBlockState(block: minecraft.Block) {
        // @ts-ignore
        const isSolved = block.permutation.getState("picross:solved");
        lib.BlockUtils.setState(block, { "picross:solved": !isSolved });
    }

    /** 标记格子方块。会自动判断输入的方块是否为标准格子方块。 */
    setCellBlockMarked(block: minecraft.Block) {
        if (block.typeId !== board.CellBlockId) return;
        lib.BlockUtils.set({ id: board.CellMarkedBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Blank);
    }

    /** 取消标记格子方块。 */
    setCellBlockUnmarked(block: minecraft.Block) {
        if (block.typeId !== board.CellMarkedBlockId) return;
        lib.BlockUtils.set({ id: board.CellBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Unknown);
    }

    /** 玩家放置格子方块。 */
    placeCellBlock(location: minecraft.Vector3) {
        this.applyChangeToGameInstance(location, picross.CellState.Unknown);
    }

    /** 玩家破坏格子方块。 */
    breakCellBlock(location: minecraft.Vector3) {
        this.applyChangeToGameInstance(location, picross.CellState.Filled);
    }

    /** 将 Minecraft 坐标转换为 Picross 游戏实例的行列坐标。 */
    getPicrossLocation(location: minecraft.Vector3): picross.CellPos {
        // 任何交互都发生在布局之后，这里的兜底只是为了让类型上不必处处判空
        const start = this.layout?.startLocation ?? { x: 0, y: 0, z: 0 };
        return { column: location.x - start.x, row: location.z - start.z };
    }

    // #endregion
}

// #endregion

// #region 组件

/** 工具在一轮拖动里的行为模式。「铅笔和橡皮」两种都干得了，所以每轮只能锁一种。 */
type PaintMode = "mark" | "erase";

/** 游戏中的各类交互组件。
 * @description 每个方法都只负责订阅一类事件，并把具体的方块读写交给 `Level`。
 */
class Components {
    /** 阻止玩家破坏方块。
     * @description 默认情况下，阻止任何破坏。
     * @description 允许开发者进行任意程度的破坏。
     * @description 允许玩家破坏格子方块。
     */
    static preventPlayerBreakBlocks(level: Level) {
        lib.gameSystem.subscribeEvent("preventPlayerBreakBlocks", minecraft.world.beforeEvents.playerBreakBlock, event => {
            const { block, player } = event;

            // 先默认拦下一切破坏，开发者不受限制
            event.cancel = !player.hasTag("picross:developer");

            // 面板不可操作时（还没出全 / 已结算）不允许破坏，避免玩家在半成品盘面或结算过程中操作
            if (!level.boardOperable) return;

            // 棋盘格是唯一的例外：挖掉就等于填涂
            if (block.hasTag(board.CellBlockId)) {
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
     * @description 手持工具时可以按住拖动，扫过哪格就处理哪格。
     */
    static interactionController(level: Level) {
        /** 每位玩家本轮按住期间已经处理过的方块。
         * @description 按住右键时交互会以 tick 频率反复触发，同一格必须只处理一次，
         * 否则「铅笔和橡皮」会在同一格上标记 → 取消 → 标记地循环下去。
         * 每轮按下（`isFirstEvent`）清空，所以松开重按同一格仍然有效。
         */
        const handledBlocks = new Map<string, Set<string>>();

        /** 每位玩家本轮按住期间锁定的工具模式，只有「铅笔和橡皮」会用到。 */
        const lockedPaintModes = new Map<string, PaintMode>();

        /** 方块坐标的唯一键。 */
        const blockKey = (location: minecraft.Vector3) => `${location.x},${location.y},${location.z}`;

        /** 本轮是否已经处理过这一格。第一次问的时候顺手记下。 */
        const alreadyHandled = (player: minecraft.Player, location: minecraft.Vector3): boolean => {
            let handled = handledBlocks.get(player.id);
            if (handled === undefined) {
                handled = new Set<string>();
                handledBlocks.set(player.id, handled);
            }
            const key = blockKey(location);
            if (handled.has(key)) return true;
            handled.add(key);
            return false;
        };

        /** 决定「铅笔和橡皮」这一轮是画还是擦。
         * @description 它两种都干得了，所以必须在起手那一格就把模式定下来：
         * 从已标记的格子起手 → 整轮只擦除；从未标记的格子起手 → 整轮只绘制。
         * 不锁的话，拖动时扫到另一种格子会立刻反向操作，刚画完就被擦掉。
         * @returns 纯铅笔、纯橡皮、或起手格不是可涂刷的格子时返回 `undefined`（不锁定）。
         */
        const resolvePaintMode = (player: minecraft.Player, block: minecraft.Block, tool: string | undefined) => {
            if (tool !== PencilAndEraserId) return undefined;

            const locked = lockedPaintModes.get(player.id);
            if (locked !== undefined) return locked;

            const mode: PaintMode | undefined =
                block.typeId === board.CellBlockId ? "mark" : block.typeId === board.CellMarkedBlockId ? "erase" : undefined;
            if (mode !== undefined) lockedPaintModes.set(player.id, mode);
            return mode;
        };

        lib.gameSystem.subscribeEvent("preventPlayerPlaceBlocks", minecraft.world.beforeEvents.playerInteractWithBlock, event => {
            const { player, itemStack: item, isFirstEvent, block } = event;

            // 先默认拦下一切交互，开发者不受限制
            event.cancel = !player.hasTag("picross:developer");

            // 面板不可操作时（还没出全 / 已结算）屏蔽一切交互
            if (!level.boardOperable) return;

            // 新的一轮按下：清掉上一轮的记录，这样松开重按同一格、换一种模式都仍然生效
            if (isFirstEvent) {
                handledBlocks.delete(player.id);
                lockedPaintModes.delete(player.id);
            }

            const tool = item?.typeId;

            // ① 放置格子方块：只认棋盘所在的那一层
            if (board.isCellBlock(tool ?? "")) {
                const placeLocation = lib.BlockUtils.getPlaceLocation(event);
                if (placeLocation.y === goldRush.boardCenter.y && !alreadyHandled(player, placeLocation)) {
                    event.cancel = false;
                    minecraft.system.run(() => level.placeCellBlock(placeLocation));
                    return;
                }
            }

            // ② 线索与箭头：点一下切换一次完成状态
            if (ClueTags.some(clueTag => block.hasTag(clueTag))) {
                if (alreadyHandled(player, block.location)) return;
                minecraft.system.run(() => level.changeClueAndArrowBlockState(block));
                return;
            }

            // ③ 工具涂刷：铅笔只管画、橡皮只管擦，
            //    「铅笔和橡皮」按这一轮起手的那一格锁定成其中一种，扫到不匹配的格子一律不动
            const paintMode = resolvePaintMode(player, block, tool);
            const canMark = tool === PencilId || paintMode === "mark";
            const canErase = tool === EraserId || paintMode === "erase";

            // 标记：未标记的格子 → 已标记
            if (canMark && block.typeId === board.CellBlockId) {
                if (alreadyHandled(player, block.location)) return;
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "block.cartography_table.use", location: block.location });
                    level.setCellBlockMarked(block);
                });
                return;
            }

            // 擦除：已标记的格子 → 未标记
            if (canErase && block.typeId === board.CellMarkedBlockId) {
                if (alreadyHandled(player, block.location)) return;
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "item.bone_meal.use", soundOptions: { pitch: 1.5 }, location: block.location });
                    level.setCellBlockUnmarked(block);
                });
                return;
            }
        });
    }
}

// #endregion

// #region 入口

minecraft.world.afterEvents.worldLoad.subscribe(() => {
    // // 调试用：直接进第 1 章第 index 关，之后换成选关界面
    // const index = 1;
    // const data: LevelData | undefined = picross1Levels["chapter1"]?.[index];
    // // 当前存在问题：区块未完全加载会报错
    // if (data !== undefined) new Level(data);
});

// #endregion
