import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import * as picross from "./picross";
import { picross1Levels, type LevelData } from "./levels";

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

/** 点击即可切换完成状态的方块 tag。 */
const ClueTags = ["picross:clue", "picross:arrow"];

// #endregion

// #region 设置

/** 开场与结束动画共用的设置。
 * @description 两段动画都用同一套黑屏参数和相机高度，只是各自的展示时长不同。
 */
interface AnimationSettings {
    /** 是否启用动画。关闭后开场直接铺盘，结束直接消除。 */
    enabled: boolean;

    /** 玩家镜头淡入黑屏的时长。单位：秒。 */
    playerCameraFadeInTime: number;

    /** 玩家镜头持续黑屏的时长，在黑屏时会传送玩家、设置玩家的镜头在盘面正上方。单位：秒。 */
    playerCameraHoldTime: number;

    /** 玩家镜头淡出黑屏的时长。单位：秒。 */
    playerCameraFadeOutTime: number;

    /** 开场与结束动画中，盘面逐层显现或消除的时长。单位：秒。 */
    showCellAnimationTime: number;

    /** 开场动画中，盘面显现后停留的时长。单位：秒。 */
    holdCellTime: number;

    /** 结束动画中，盘面消除阶段的停留时长。单位：秒。
     * @description 前 `showCellAnimationTime` 秒用于逐层消除，剩下的时间只是等着，
     * 所以这个值小于 `showCellAnimationTime` 时会自动对齐后者。
     */
    holdEraseTime: number;

    /** 结束动画中，图案显示后停留的时长。单位：秒。 */
    holdFigureTime: number;

    /** 俯视镜头的最大高度。 */
    cameraMaxHeight: number;

    /** 俯视镜头的最低高度。 */
    cameraMinHeight: number;
}

export class Settings {
    /** 动画设置。开场与结束共用。 */
    animation: AnimationSettings = {
        enabled: true,
        playerCameraFadeInTime: 0.25,
        playerCameraHoldTime: 0.5,
        playerCameraFadeOutTime: 0.25,
        showCellAnimationTime: 1,
        holdCellTime: 2,
        holdEraseTime: 4,
        holdFigureTime: 8,
        cameraMaxHeight: 35,
        cameraMinHeight: 8,
    };
}

/** 设置。 */
const settings = new Settings();

// #endregion

// #region 主题

/** 表示一个数织场地的主题。 */
export interface Theme {
    /** 待加载的结构 ID。 */
    readonly structureId: string;

    /** 结构加载的位置。 */
    readonly structureLocation: minecraft.Vector3;

    /** 盘面的中心位置。它也同时决定允许放置格子方块的高度和初始状态下放置线索方块的高度。 */
    readonly boardCenter: minecraft.Vector3;
}

const goldRush: Theme = {
    structureId: "picross:map_goldrush",
    structureLocation: { x: -31, y: -42, z: -31 },
    boardCenter: { x: 0, y: -41, z: 0 },
};

// #endregion

// #region 关卡

/** 面板里的一行格子，整行可以一次填充。 */
interface BoardRowRect {
    readonly row: number;
    readonly from: minecraft.Vector3;
    readonly to: minecraft.Vector3;
}

/** 面板上的一个数字方块。 */
interface BoardNumber {
    readonly location: minecraft.Vector3;
    readonly value: number;
}

/** 行线索方块，`row` 用于让它跟着所在行一起出现。 */
interface BoardRowClue extends BoardNumber {
    readonly row: number;
}

/** 一块矩形区域（含两端），用方块坐标表示。 */
interface BoardRect {
    readonly from: minecraft.Vector3;
    readonly to: minecraft.Vector3;
}

/** 面板布局。纯计算的结果，不含任何世界写入。 */
interface BoardLayout {
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

/** 代表一个游戏关卡。 */
class Level {
    constructor(data: LevelData) {
        this.game = new picross.PicrossGame(data, data);
        this.figureStructureId = data.figureStructureId;
        this.start();
    }

    /** 代表本关使用的数织实例。 */
    game: picross.PicrossGame;

    /** 通关后展示的图案结构 ID。 */
    figureStructureId: string | undefined;

    /** 本关的布局。 */
    layout: BoardLayout | undefined;

    /** 代表本关左上角的格子方块的起始点。 */
    startLocation: minecraft.Vector3 = { x: 0, y: 0, z: 0 };

    /** 面板是否可操作。 */
    boardOperable = false;

    /** 关卡是否已结束。 */
    finished = false;

    // #region - 启动与退场

    /** 启动关卡。 */
    start() {
        Components.interactionController(this);
        Components.preventPlayerBreakBlocks(this);

        // 先算布局：纯计算，算不出来就不必再加载场地了
        let layout: BoardLayout;
        try {
            layout = this.getBoardLayout();
        } catch (cause) {
            this.fail(cause);
            return;
        }
        this.layout = layout;

        if (settings.animation.enabled) this.playStartAnimation(layout);
        else
            this.loadScene().then(
                () => this.placeBoard(layout),
                cause => this.fail(cause),
            );

        // 播放音乐
        lib.PlayerUtils.getAll().forEach(player => {
            player.playMusic("normal_1", { loop: true });
        });
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
    private fail(cause: unknown) {
        minecraft.world.sendMessage(`§c关卡启动失败：${String(cause)}`);
        this.boardOperable = true;
        lib.PlayerUtils.unlockPlayers();
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

    // #region - 开场动画

    /** 播放开场动画：黑屏 → 架镜头看场地升起 → 盘面逐层出现 → 交还操作。 */
    private playStartAnimation(layout: BoardLayout) {
        const animation = settings.animation;
        const players = lib.PlayerUtils.getAll();

        // 各阶段的边界先换算成 tick，后面判断时就不必反复累加秒数。
        // 淡入至少留 1 tick，否则时长为 0 时 `time === fadeInTicks` 永远不成立。
        const fadeInTicks = Math.max(1, Math.round(animation.playerCameraFadeInTime * 20));
        const holdTicks = Math.round(animation.playerCameraHoldTime * 20);
        const fadeOutTicks = Math.round(animation.playerCameraFadeOutTime * 20);
        const blackoutTicks = fadeInTicks + holdTicks + fadeOutTicks;
        const endTicks = blackoutTicks + Math.round(animation.showCellAnimationTime * 20) + Math.round(animation.holdCellTime * 20);

        this.fadeCamera(players);
        const started = lib.gameSystem.subscribeTimeline("startAnimation", time => {
            // 屏幕完全变黑，重置场地，镜头架到盘面正上方，锁定玩家
            if (time === fadeInTicks) {
                this.loadScene((holdTicks + fadeOutTicks) / 20).catch(cause => this.fail(cause));
                this.movePlayersToOverhead(players, layout, Level.getPanelCenter(layout), layout.panelRect);
                lib.PlayerUtils.lockPlayers();
            }
            // 淡出结束后，开始铺盘面
            else if (time === blackoutTicks) this.placeBoard(layout);
            // 铺完盘面后，等待一段时间再恢复玩家操作
            else if (time >= endTicks) {
                // 再传送一次：开场时场地还没升起，玩家会往下掉，落点不一定在棋盘上
                players.forEach(player => player.teleport(Level.getViewpoint(layout), { rotation: { x: 0, y: 180 } }));
                lib.PlayerUtils.unlockPlayers();
                return false;
            }
        });

        if (!started) this.fail(new Error("开场动画的时间线已被占用，可能上一关没有退出干净"));
    }

    // #endregion

    // #region - 结束动画

    /** 谜题完成后调用。重复触发只生效一次。 */
    private finish() {
        if (this.finished) return;
        this.finished = true;

        // 立刻掐掉盘面操作，后面整段动画期间玩家都碰不到格子
        this.boardOperable = false;

        try {
            if (settings.animation.enabled) this.playFinishAnimation();
            else this.playFinishAnimationInstant();
        } catch (cause) {
            // 擦除或架镜头出错时别把玩家留在锁定状态
            this.fail(cause);
        }

        // 播放音乐
        lib.PlayerUtils.getAll().forEach(player => {
            player.playMusic("finish", { loop: true });
        });
    }

    /** 结束动画（开启动画时）：黑屏 → 俯视盘面 → 逐层擦除 → 展示图案与关卡名 → 黑屏重置场地。 */
    private playFinishAnimation() {
        const layout = this.layout;
        if (layout === undefined) return;

        const animation = settings.animation;
        const dimension = minecraft.world.getDimension("overworld");
        const players = lib.PlayerUtils.getAll();
        const eraseSteps = this.createEraseSteps(layout, dimension);

        const fadeInTicks = Math.max(1, Math.round(animation.playerCameraFadeInTime * 20));
        const holdTicks = Math.round(animation.playerCameraHoldTime * 20);
        const fadeOutTicks = Math.round(animation.playerCameraFadeOutTime * 20);
        const blackoutTicks = fadeInTicks + holdTicks + fadeOutTicks;
        const eraseTicks = Math.max(1, Math.round(animation.showCellAnimationTime * 20));
        const eraseEndTicks = blackoutTicks + eraseTicks - 1;
        const figureTicks = blackoutTicks + Math.max(eraseTicks, Math.round(animation.holdEraseTime * 20));
        const resetTicks = figureTicks + Math.round(animation.holdFigureTime * 20);
        const reloadTicks = resetTicks + fadeInTicks;
        const unlockTicks = resetTicks + fadeInTicks + holdTicks;

        // 逐层擦除用累积速率推进，和开场动画同一套算法
        const eraseRate = eraseSteps.length > 1 && eraseTicks > 1 ? (eraseSteps.length - 1) / (eraseTicks - 1) : eraseSteps.length;
        let eraseAccumulator = 1;
        let eraseIndex = 0;

        this.fadeCamera(players);

        const started = lib.gameSystem.subscribeTimeline("finishAnimation", time => {
            try {
                // 完全黑屏后，调整玩家视角，锁定玩家
                if (time === fadeInTicks) {
                    this.movePlayersToOverhead(players, layout, Level.getCellCenter(layout), layout.boardRect);
                    lib.PlayerUtils.lockPlayers();
                }
                // 黑屏淡出后，逐步擦除数字和标记格子方块
                if (time >= blackoutTicks && time <= eraseEndTicks) {
                    eraseAccumulator += eraseRate;
                    while (eraseAccumulator >= 1 && eraseIndex < eraseSteps.length) {
                        eraseSteps[eraseIndex++]?.();
                        eraseAccumulator -= 1;
                    }
                }
                // 显示图案和关卡名称
                if (time === figureTicks) {
                    while (eraseIndex < eraseSteps.length) eraseSteps[eraseIndex++]?.();
                    this.showFinish(layout, players);

                    // 播放音乐
                    lib.PlayerUtils.getAll().forEach(player => {
                        player.playMusic("show", { loop: false });
                    });
                }

                // 动作栏文字会自己淡出，所以每秒补一次
                if (time > figureTicks && time < resetTicks && time % 20 === 0) {
                    this.showLevelNameToAll(players);
                }

                // 离开时开始黑屏，清除动作栏文字
                if (time === resetTicks) {
                    Level.clearLevelName(players);
                    this.fadeCamera(players);
                }

                // 黑屏后，重置场地
                if (time === reloadTicks) this.loadScene(holdTicks / 20).catch(cause => this.fail(cause));

                // 淡出开始前，解锁玩家并终止运行
                if (time >= unlockTicks) {
                    lib.PlayerUtils.unlockPlayers();
                    return false;
                }
            } catch (cause) {
                minecraft.world.sendMessage(`§c结束动画出错：${String(cause)}`);
            }
        });

        if (!started) this.fail(new Error("结束动画的时间线已被占用"));
    }

    /** 结束流程（关闭动画时）：不黑屏，立刻完成擦除，只保留两段停留。 */
    private playFinishAnimationInstant() {
        const layout = this.layout;
        if (layout === undefined) return;

        const animation = settings.animation;
        const dimension = minecraft.world.getDimension("overworld");
        const players = lib.PlayerUtils.getAll();

        // 立刻挪人、架镜头、锁操作。和开启动画时一样，只对准格子区。
        this.movePlayersToOverhead(players, layout, Level.getCellCenter(layout), layout.boardRect);
        lib.PlayerUtils.lockPlayers();

        // 擦除不逐层推进，一口气做完
        for (const step of this.createEraseSteps(layout, dimension)) step();

        const figureTicks = Math.max(1, Math.round(animation.holdEraseTime * 20));

        // 图案瞬间出现，holdFigureTime 就是完整图案的可见时长
        const endTicks = figureTicks + Math.round(animation.holdFigureTime * 20);

        const started = lib.gameSystem.subscribeTimeline("finishAnimation", time => {
            // 和开启动画时同样的理由：异常不能让时间线停摆
            try {
                if (time === figureTicks) this.showFinish(layout, players);

                if (time > figureTicks && time < endTicks && time % 20 === 0) {
                    this.showLevelNameToAll(players);
                }

                if (time >= endTicks) {
                    Level.clearLevelName(players);
                    // 等场地铺完再解锁，免得玩家站在还没恢复的地面上
                    this.loadScene().then(
                        () => lib.PlayerUtils.unlockPlayers(),
                        cause => this.fail(cause),
                    );
                    return false;
                }
            } catch (cause) {
                minecraft.world.sendMessage(`§c结束动画出错：${String(cause)}`);
            }
        });

        if (!started) this.fail(new Error("结束动画的时间线已被占用"));
    }

    /** 把「擦掉盘面」切成一帧帧：从面板最上边一路扫到棋盘底边。
     * @description 每一层清掉该层的线索方块；落在棋盘范围内的层，顺便把标记格和锁定格还原成普通格子。
     */
    private createEraseSteps(layout: BoardLayout, dimension: minecraft.Dimension): (() => void)[] {
        const steps: (() => void)[] = [];

        // 线索按 z 收拢，同一层的列线索和行线索会一起消失
        const clueLayers = Level.groupByZ([...layout.rowClues, ...layout.columnClues]);

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

    /** 在盘面左上角加载通关图案。图案不做生长动画，放下就是完整的。
     * @description `structureManager.place` 是同步抛错的，所以除了 `.catch` 还得再包一层 try，
     * 不然异常会从时间线回调里逃出去，把整段动画卡死。
     */
    private showFigure(layout: BoardLayout) {
        if (this.figureStructureId === undefined) return;
        try {
            lib.StructureUtils.placeAsync(this.figureStructureId, layout.startLocation).catch(cause =>
                minecraft.world.sendMessage(`§c通关图案加载失败：${String(cause)}`),
            );
        } catch (cause) {
            minecraft.world.sendMessage(`§c通关图案加载失败：${String(cause)}`);
        }
    }

    /** 图案登场：在盘面左上角放图案，并在动作栏显示关卡名。 */
    private showFinish(layout: BoardLayout, players: minecraft.Player[]) {
        this.showFigure(layout);
        this.showLevelNameToAll(players);
    }

    /** 在动作栏显示关卡名。名字是翻译键，交给 RawMessage 按语言解析。
     * @description 动作栏不会挡住盘面和图案；它的文字会自己淡出，所以停留期间由调用方按秒补发。
     */
    private showLevelNameToAll(players: minecraft.Player[]) {
        const name = this.game.name;
        if (name.length === 0) return;

        players.forEach(player => {
            try {
                player.onScreenDisplay.setActionBar({ rawtext: [{ translate: name }] });
            } catch (cause) {
                minecraft.world.sendMessage(`§c关卡名显示失败：${String(cause)}`);
            }
        });
    }

    /** 清掉动作栏上的关卡名。 */
    private static clearLevelName(players: minecraft.Player[]) {
        players.forEach(player => player.onScreenDisplay.setActionBar(""));
    }

    /** 给这些玩家播一次黑屏淡入淡出，时长取自动画设置。 */
    private fadeCamera(players: minecraft.Player[]) {
        const animation = settings.animation;
        const fadeTime = {
            fadeInTime: animation.playerCameraFadeInTime,
            holdTime: animation.playerCameraHoldTime,
            fadeOutTime: animation.playerCameraFadeOutTime,
        };
        players.forEach(player => player.camera.fade({ fadeTime }));
    }

    // #endregion

    // #region - 通用

    /** 玩家在棋盘上的站位：棋盘中心的南侧一格，脚下正好踩在格子方块上。
     * @description 坐标加 0.5 才是格子的几何中心；直接用整数会站在方块边角上，看着偏。
     */
    private static getViewpoint(layout: BoardLayout): minecraft.Vector3 {
        return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y + 1, z: layout.boardRect.to.z + 1.5 };
    }

    /** 格子区的几何中心。开场用不到它，结束展示图案时用它取景。 */
    private static getCellCenter(layout: BoardLayout): minecraft.Vector3 {
        return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y, z: layout.cellCenter.z + 0.5 };
    }

    /** 整块面板（含线索区）的几何中心。开场展示盘面时用它取景。 */
    private static getPanelCenter(layout: BoardLayout): minecraft.Vector3 {
        const panel = layout.panelRect;
        // from 是起始方块坐标，to 是结束方块坐标，方块跨 [from, to + 1)，所以几何中心是 (from + to + 1) / 2
        return {
            x: (panel.from.x + panel.to.x + 1) / 2,
            y: layout.cellCenter.y,
            z: (panel.from.z + panel.to.z + 1) / 2,
        };
    }

    /** 俯视镜头的高度：盘面小时自动拉近，盘面大时拉远，上限是设置里的 `cameraMaxHeight`。
     * @param center 镜头对准的中心，必须是几何中心。
     * @param rect 需要完整收进画面的区域，按「中心到最远边」的距离算。
     */
    private static getCameraHeight(center: minecraft.Vector3, rect: BoardRect): number {
        const halfSpan = Math.max(center.x - rect.from.x, rect.to.x + 1 - center.x, center.z - rect.from.z, rect.to.z + 1 - center.z);
        /** 俯视镜头的高度系数。竖直视角约 70°，半幅高度 ≈ 0.7 × 高度，这里取 2 倍再加一点余量。 */
        const CameraFitFactor = 2;
        const fitted = Math.ceil(halfSpan * CameraFitFactor);
        return Math.min(settings.animation.cameraMaxHeight, Math.max(settings.animation.cameraMinHeight, fitted));
    }

    /** 把玩家挪到棋盘南侧，并把镜头架到指定中心的正上方。开场与结束动画共用。
     * @param center 镜头对准的几何中心：开场是整块面板的中心，结束是格子区的中心。
     * @param rect 镜头要完整收进画面的区域，一般和 center 对应。
     */
    private movePlayersToOverhead(players: minecraft.Player[], layout: BoardLayout, center: minecraft.Vector3, rect: BoardRect) {
        const cameraLocation = { ...center, y: center.y + Level.getCameraHeight(center, rect) };
        players.forEach(player => {
            player.teleport(Level.getViewpoint(layout), { rotation: { x: 0, y: 180 } });
            player.camera.setCamera("minecraft:free", { location: cameraLocation, rotation: { x: 89.9, y: 180 } });
        });
    }

    /** 是否为格子方块。 */
    static itemIsCellBlock(typeId: string): boolean {
        let permutation: minecraft.BlockPermutation;
        try {
            permutation = minecraft.BlockPermutation.resolve(typeId);
        } catch {
            return false;
        }
        return permutation.hasTag(CellBlockId);
    }

    /** 将 Minecraft 坐标转换为 Picross 游戏实例的行列坐标。 */
    getPicrossLocation(location: minecraft.Vector3): picross.CellPos {
        return { column: location.x - this.startLocation.x, row: location.z - this.startLocation.z };
    }

    /** 按 z 把方块分层，同一层的会一起出现或一起消失。 */
    private static groupByZ<T extends { readonly location: minecraft.Vector3 }>(items: readonly T[]): Map<number, T[]> {
        const layers = new Map<number, T[]>();
        for (const item of items) {
            const layer = layers.get(item.location.z);
            if (layer === undefined) layers.set(item.location.z, [item]);
            else layer.push(item);
        }
        return layers;
    }

    // #endregion

    // #region - 场地放置

    /** 放置数织面板，并把盘面左上角写入 startLocation。
     * @param layout 已经算好的布局。
     * @description 任何一步出错都交给 `fail` 统一善后，避免玩家被留在黑屏且不能动的状态里。
     */
    placeBoard(layout: BoardLayout) {
        try {
            this.startLocation = layout.startLocation;

            const dimension = minecraft.world.getDimension("overworld");

            // 不播开场动画时一次性铺满
            if (!settings.animation.enabled) {
                this.renderBoardInstant(layout, dimension);
                this.boardOperable = true;
                return;
            }

            const steps = this.createRenderSteps(layout, dimension);
            const cellTicks = Math.round(settings.animation.showCellAnimationTime * 20);
            this.playRenderSteps(steps, cellTicks, () => this.renderBoardInstant(layout, dimension));
        } catch (cause) {
            this.fail(cause);
        }
    }

    /** 获取盘面布局。该方法不会放置任何方块。 */
    private getBoardLayout(): BoardLayout {
        const rowClues = this.game.rowClues;
        const columnClues = this.game.columnClues;
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

    /** 一次性铺满整个面板。 */
    private renderBoardInstant(layout: BoardLayout, dimension: minecraft.Dimension) {
        lib.BlockUtils.fill({ id: CellBlockId, from: layout.boardRect.from, to: layout.boardRect.to }, {}, dimension);

        for (const clue of layout.rowClues) this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);
        for (const clue of layout.columnClues) this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);

        for (const location of layout.locked) dimension.setBlockType(location, CellLockedBlockId);
    }

    /** 把布局切成一帧帧的渲染动作。
     * @description 每一帧对应一个 tick 里要做的事，帧数决定动画粒度。
     * 整个面板当作一张纸从上往下扫：列线索区先出，再接棋盘逐行。
     */
    private createRenderSteps(layout: BoardLayout, dimension: minecraft.Dimension): (() => void)[] {
        const steps: (() => void)[] = [];

        const placeNumber = (clue: BoardNumber) => {
            this.placeNumber(clue.value, clue.location.x, clue.location.z, dimension);
        };
        const placeLockedCell = (location: minecraft.Vector3) => {
            dimension.setBlockType(location, CellLockedBlockId);
        };

        // 列线索先按层出现：从面板最上边一路扫到棋盘顶边
        const clueLayers = Level.groupByZ(layout.columnClues);
        for (const z of [...clueLayers.keys()].sort((left, right) => left - right)) {
            const layer = clueLayers.get(z);
            steps.push(() => {
                if (layer === undefined) return;
                for (const clue of layer) placeNumber(clue);
            });
        }

        // 接着逐行铺棋盘，行线索和锁定格跟着所在行一起出现
        for (const rect of layout.rowRects) {
            steps.push(() => {
                lib.BlockUtils.fill({ id: CellBlockId, from: rect.from, to: rect.to }, {}, dimension);
                for (const clue of layout.rowClues) {
                    if (clue.row === rect.row) placeNumber(clue);
                }
                for (const location of layout.locked) {
                    if (location.z === rect.from.z) placeLockedCell(location);
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
    private playRenderSteps(steps: (() => void)[], targetTicks: number, fallback: () => void) {
        const frames = steps.length;
        const ticks = Math.max(1, targetTicks);

        // 首帧立刻出现，其余帧在剩下的 tick 里匀速铺开。
        // 只用"每 tick 固定刷几帧"撑不到长时长：5×5 才 7 帧，一 tick 一帧也只能拖到 7 tick。
        const rate = frames > 1 && ticks > 1 ? (frames - 1) / (ticks - 1) : frames;
        let accumulator = 1;
        let index = 0;

        const started = lib.gameSystem.subscribeTimeline("boardAppear", () => {
            try {
                accumulator += rate;
                while (accumulator >= 1 && index < frames) {
                    steps[index++]?.();
                    accumulator -= 1;
                }
            } catch (cause) {
                this.fail(cause);
                return false;
            }

            if (index >= frames) {
                this.boardOperable = true;
                return false;
            }
        });

        if (!started) {
            // 同名时间线已存在（例如上一关没退干净），直接铺满，免得盘面永远出不来
            minecraft.world.sendMessage("§e面板出现动画未能启动，已改为直接铺满");
            fallback();
            this.boardOperable = true;
        }
    }

    /** 在面板上放一个线索方块，朝向统一为北。
     * @param value 要显示的数字，0~30
     * @param x 方块 x 坐标
     * @param z 方块 z 坐标
     */
    private placeNumber(value: number, x: number, z: number, dimension: minecraft.Dimension) {
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
        if (block.typeId !== CellBlockId) return;
        lib.BlockUtils.set({ id: CellMarkedBlockId, location: block.location });
        this.applyChangeToGameInstance(block.location, picross.CellState.Blank);
    }

    /** 取消标记格子方块。 */
    setCellBlockUnmarked(block: minecraft.Block) {
        if (block.typeId !== CellMarkedBlockId) return;
        lib.BlockUtils.set({ id: CellBlockId, location: block.location });
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
                block.typeId === CellBlockId ? "mark" : block.typeId === CellMarkedBlockId ? "erase" : undefined;
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
            if (Level.itemIsCellBlock(tool ?? "")) {
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
            if (canMark && block.typeId === CellBlockId) {
                if (alreadyHandled(player, block.location)) return;
                minecraft.system.run(() => {
                    player.playAnimation("animation.picross.tool_swing_right", { blendOutTime: 0.1 });
                    lib.PlayerUtils.broadcast({ sound: "block.cartography_table.use", location: block.location });
                    level.setCellBlockMarked(block);
                });
                return;
            }

            // 擦除：已标记的格子 → 未标记
            if (canErase && block.typeId === CellMarkedBlockId) {
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
    // 调试用：直接进第 1 章第 index 关，之后换成选关界面
    const index = 3;
    const data: LevelData | undefined = picross1Levels["chapter1"]?.[index];
    // 当前存在问题：区块未完全加载会报错
    if (data !== undefined) new Level(data);
});

// #endregion
