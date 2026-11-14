// *-*-*-*-*-*-* 动画 *-*-*-*-*-*-*
// 开场、结束、退场三段流程的时序编排：黑屏、架镜头、锁人、铺盘与擦盘。
// 三段流程都直接接收 `Level`，读写它的布局、可操作状态与场地加载，不再另设上下文对象。
// 三段流程都返回 Promise<boolean>：顺利走完为 true，中途出错或时间线被占用为 false，
// 调用方只需要在 then 里接「走完之后该干什么」，不必关心内部是走时间线还是一步到位。

import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import { CellBlockId, CellLockedBlockId, CellMarkedBlockId } from "./constants";
import { renderBoardInstant, type BoardLayout, type BoardRect, placeNumber } from "./board";
import { settings } from "./settings";
import type { Level } from "./main";

// #region 关卡开场

/** 代表在开场动画不同的时间点额外执行的函数。 */
export interface StartAnimationAdditionalCallback {
    /** 场地加载后执行的函数。 */
    onSceneLoaded?: () => void;

    /** 盘面出现时执行的函数。 */
    onBoardAppear?: () => void;

    /** 动画结束时执行的函数。 */
    onFinished?: () => void;
}

/** 播放开场动画。
 * @description
 * 开启动画时的流程：
 * - Step 1：黑屏淡入后，加载场地，禁止玩家操作，在盘面上方架镜头。
 * - Step 2：黑屏淡出后，盘面逐层出现。
 * - Step 3：盘面出现后，等待一段时间并恢复玩家操作。
 * @description
 * 关闭动画时的流程：立刻显示盘面。
 */
export function playStartAnimation(level: Level, additionalCallback?: StartAnimationAdditionalCallback) {
    const layout = level.layout;
    const animation = settings.animation;
    const dimension = minecraft.world.getDimension("overworld");
    const players = lib.PlayerUtils.getAll();

    // ===== 关闭动画时 =====
    if (!animation.enabled) {
        level.loadScene().then(
            () => {
                // --- Step 1：场地加载完毕 ---
                additionalCallback?.onSceneLoaded?.();

                // --- Step 2：开始出现盘面 ---
                additionalCallback?.onBoardAppear?.();
                renderBoardInstant(layout, dimension);

                // --- Step 3：动画结束 ---
                level.boardOperable = true;
                additionalCallback?.onFinished?.();
            },
            cause => {
                level.fail(cause);
                return false;
            },
        );
        return;
    }

    // ===== 开启动画时 =====

    /** Step 1：黑屏淡入的时间点。 */
    const step1Tick = animation.playerCameraFadeInTime * 20;

    /** Step 2：黑屏淡出的时间点（step1 + hold + fadeout）。 */
    const step2Tick = step1Tick + (animation.playerCameraHoldTime + animation.playerCameraFadeOutTime) * 20;

    /** 加载面板所需的时间。 */
    const boardTicks = animation.showCellAnimationTime * 20;

    /** Step 3：加载完毕的时间点（step2 + showCell）。 */
    const step3Tick = step2Tick + boardTicks + animation.holdCellTime * 20;

    fadeCamera(players);
    lib.gameSystem.unsubscribeTimeline("startAnimation");
    lib.gameSystem.subscribeTimeline("startAnimation", time => {
        try {
            // --- Step 1：场地加载完毕 ---
            if (time === step1Tick) {
                level.loadScene().then(() => additionalCallback?.onSceneLoaded?.());
                movePlayersToOverhead(players, layout, getPanelCenter(layout), layout.panelRect);
                lib.PlayerUtils.lockPlayers(players);
            }

            // --- Step 2：开始出现盘面 ---
            else if (time === step2Tick) {
                additionalCallback?.onBoardAppear?.();
                playBoardAppear(level, createRenderSteps(layout, dimension), boardTicks);
            }

            // --- Step 3：动画结束 ---
            else if (time >= step3Tick) {
                lib.PlayerUtils.unlockPlayers(players);
                level.boardOperable = true;
                additionalCallback?.onFinished?.();
                return false;
            }
        } catch (cause) {
            level.fail(cause);
            return false;
        }
    });
}

/** 播放加载盘面的动画。
 * @param steps 渲染动作，按顺序执行。
 */
function playBoardAppear(level: Level, steps: (() => void)[], targetTicks: number) {
    /** 动画的总帧数。 */
    const frames = steps.length;

    /** 动画的总时长。 */
    const ticks = Math.max(1, targetTicks);

    /** 动画播放的速率。 */
    const rate = frames / ticks;

    /** 本次动画实际已加载的帧。 */
    let loadedFrames = 0;

    lib.gameSystem.unsubscribeTimeline("boardAppear");
    lib.gameSystem.subscribeTimeline("boardAppear", time => {
        try {
            /** 本次加载应该显示到的帧（动画速率 x 时间）。 */
            const frameProgress = Math.min(frames, Math.round(rate * time)); // 防止越界

            // 将仍未加载的目标帧加载出来
            while (loadedFrames < frameProgress) {
                steps[loadedFrames]?.(); // 此时应加载第 n 帧，这时 loadedFrames = n-1，这时它在帧函数数组中的索引刚好是 n-1
                loadedFrames++;
            }
        } catch (cause) {
            level.fail(cause);
            return false;
        }

        // 所有帧都加载出来后，立刻终止运行
        if (loadedFrames >= frames) return false;
    });
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
// #region 结束

/** 代表在开场动画不同的时间点额外执行的函数。 */
export interface FinishAnimationAdditionalCallback {
    /** 动画开始时执行的函数。 */
    onStarted?: () => void;

    /** 盘面擦除时执行的函数。 */
    onBoardErase?: () => void;

    /** 图案展示时执行的函数。 */
    onFigureShowing?: () => void;

    /** 动画结束时执行的函数。 */
    onFinished?: () => void;
}

/** 播放关卡结束动画。
 * @description
 * 开启动画时的流程：
 * - Step 1：黑屏淡入后，禁止玩家操作，在格子区上方架镜头。
 * - Step 2：黑屏淡出后，盘面逐层擦除数字。
 * - Step 3：数字擦除完毕后，等待一段时间（默认值 4s）展示图案与关卡名。
 * - Step 4：图案与关卡名展示完毕后，等待一段时间（默认值 8s）动画结束。
 * @description
 * 关闭动画时的流程：
 * - Step 1：执行动画开始时的函数。
 * - Step 2：立刻擦除数字。
 * - Step 3：数字擦除完毕后，等待一段时间（默认值 4s）展示图案与关卡名。
 * - Step 4：图案与关卡名展示完毕后，等待一段时间（默认值 8s）动画结束。
 */
export function playFinishAnimation(level: Level, additionalCallback?: FinishAnimationAdditionalCallback) {
    // ===== 变量准备 =====

    const layout = level.layout;
    const animation = settings.animation;
    const dimension = minecraft.world.getDimension("overworld");
    const players = lib.PlayerUtils.getAll();
    /** 在动作栏标题展示关卡名称。
     * @remarks 由于动作栏标题至多展示约 3 秒且不能添加空字符串以终止，故而需要使用此方法。
     */
    const showFigureName = () => {
        lib.gameSystem.subscribeTimeline("finishAnimationShowActionbar", time => {
            if (time > (animation.holdFigureTime - 3) * 20) return false;
            players.forEach(player => player.onScreenDisplay.setActionBar({ translate: level.game.name }));
        });
    };
    const animationEnabled = animation.enabled;

    /** Step 1：动画开始，黑屏淡入的时间点。关闭动画时在首刻执行。 */
    const step1Tick = animation.playerCameraFadeInTime * 20;

    /** Step 2：擦除数字的时间点（step1 + hold + fadeout）。关闭动画时在首刻执行。 */
    const step2Tick = step1Tick + (animation.playerCameraHoldTime + animation.playerCameraFadeOutTime) * 20;

    /** Step 3：显示图案的时间点（step2 + holdErase）。 */
    const step3Tick = step2Tick + animation.holdEraseTime * 20;

    /** Step 4：结束的时间点（step3 + holdFigure）。 */
    const step4Tick = step3Tick + animation.holdFigureTime * 20;

    // ===== 播放动画 =====

    // 相机黑屏
    if (animationEnabled) fadeCamera(players);

    lib.gameSystem.subscribeTimeline("finishAnimation", time => {
        try {
            // --- Step 1：动画开始 ---
            if (time === step1Tick) {
                additionalCallback?.onStarted?.();
                level.boardOperable = false;
                if (animationEnabled) {
                    movePlayersToOverhead(players, layout, getCellCenter(layout), layout.boardRect);
                    lib.PlayerUtils.lockPlayers(players);
                }
            }

            // --- Step 2：擦除数字 ---
            if (time === step2Tick) {
                additionalCallback?.onBoardErase?.();
                if (animationEnabled) {
                    playBoardErase(level, createEraseSteps(layout, dimension), animation.showCellAnimationTime * 20); // 以和显示盘面同样的速度擦除数字
                } else {
                    for (const step of createEraseSteps(layout, dimension)) step();
                }
            }

            // --- Step 3：展示图案并播放动作栏标题 ---
            if (time === step3Tick) {
                additionalCallback?.onFigureShowing?.();
                showFinish(level, players);
                showFigureName();
            }

            // --- Step 4：动画结束 ---
            if (time >= step4Tick) {
                additionalCallback?.onFinished?.();
                return false;
            }
        } catch (cause) {
            level.fail(cause);
            return false;
        }
    });
}

/** 播放加载盘面的动画。
 * @param steps 渲染动作，按顺序执行。
 */
function playBoardErase(level: Level, steps: (() => void)[], targetTicks: number) {
    /** 动画的总帧数。 */
    const frames = steps.length;

    /** 动画的总时长。 */
    const ticks = Math.max(1, targetTicks);

    /** 动画播放的速率。 */
    const rate = frames / ticks;

    /** 本次动画实际已加载的帧。 */
    let loadedFrames = 0;

    lib.gameSystem.unsubscribeTimeline("boardErase");
    lib.gameSystem.subscribeTimeline("boardErase", time => {
        try {
            /** 本次加载应该显示到的帧（动画速率 x 时间）。 */
            const frameProgress = Math.min(frames, Math.round(rate * time)); // 防止越界

            // 将仍未加载的目标帧加载出来
            while (loadedFrames < frameProgress) {
                steps[loadedFrames]?.(); // 此时应加载第 n 帧，这时 loadedFrames = n-1，这时它在帧函数数组中的索引刚好是 n-1
                loadedFrames++;
            }
        } catch (cause) {
            level.fail(cause);
            return false;
        }

        // 所有帧都加载出来后，立刻终止运行
        if (loadedFrames >= frames) return false;
    });
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

/** 显示图案并播放音乐。 */
function showFinish(level: Level, players: minecraft.Player[]) {
    // 加载通关图案
    const structureId = level.figureStructureId;
    if (structureId) lib.StructureUtils.placeAsync(structureId, level.layout.startLocation);

    // 显示动作栏标题
    players.forEach(player => player.onScreenDisplay.setActionBar({ translate: level.game.name }));

    // 播放音乐
    playMusic("show_picture", false);
}

// #endregion
// #region 退场

/** 播放退场动画。
 * @description 黑屏 -> 锁定玩家并重置场地 -> 场地恢复后解锁玩家
 */
export function playExitAnimation(level: Level): Promise<boolean> {
    const animation = settings.animation;
    const players = lib.PlayerUtils.getAll();

    // ===== 关闭动画时 =====

    // 直接重置场地并解锁玩家
    if (!animation.enabled) {
        lib.PlayerUtils.lockPlayers(players);
        return level.loadScene().then(
            () => {
                lib.PlayerUtils.unlockPlayers(players);
                return true;
            },
            cause => {
                level.fail(cause);
                return false;
            },
        );
    }

    // ===== 开启动画时 =====

    // 开始时，锁定玩家并黑屏淡入
    lib.PlayerUtils.lockPlayers(players);
    fadeCamera(players);
    return new Promise<boolean>(resolve => {
        lib.gameSystem.unsubscribeTimeline("exitAnimation");
        lib.gameSystem.subscribeTimeline("exitAnimation", time => {
            // 淡入结束后，立刻解锁玩家并加载场地，然后终止时间线
            if (time >= animation.playerCameraFadeInTime * 20) {
                lib.PlayerUtils.unlockPlayers(players);
                level.loadScene().then(() => {
                    resolve(true);
                });
                return false;
            }
        });
    });
}

// #endregion
// #region 取景

/** 玩家在棋盘上的站位：棋盘中心的南侧一格，脚下正好踩在格子方块上。
 * @description 坐标加 0.5 才是格子的几何中心；直接用整数会站在方块边角上，看着偏。
 */
function getViewpoint(layout: BoardLayout): minecraft.Vector3 {
    return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y + 1, z: layout.boardRect.to.z + 1.5 };
}

/** 格子区的几何中心。开场用不到它，结束展示图案时用它取景。 */
function getCellCenter(layout: BoardLayout): minecraft.Vector3 {
    return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y, z: layout.cellCenter.z + 0.5 };
}

/** 整块面板（含线索区）的几何中心。开场展示盘面时用它取景。 */
function getPanelCenter(layout: BoardLayout): minecraft.Vector3 {
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
function getCameraHeight(center: minecraft.Vector3, rect: BoardRect): number {
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
function movePlayersToOverhead(players: minecraft.Player[], layout: BoardLayout, center: minecraft.Vector3, rect: BoardRect) {
    const cameraLocation = { ...center, y: center.y + getCameraHeight(center, rect) };
    players.forEach(player => {
        player.teleport(getViewpoint(layout), { rotation: { x: 0, y: 180 } });
        player.camera.setCamera("minecraft:free", { location: cameraLocation, rotation: { x: 89.9, y: 180 } });
    });
}

/** 给这些玩家播一次黑屏淡入淡出，时长取自动画设置。 */
function fadeCamera(players: minecraft.Player[]) {
    const animation = settings.animation;
    const fadeTime = {
        fadeInTime: animation.playerCameraFadeInTime,
        holdTime: animation.playerCameraHoldTime,
        fadeOutTime: animation.playerCameraFadeOutTime,
    };
    players.forEach(player => player.camera.fade({ fadeTime }));
}

// #endregion
// #region 展示

/** 给所有玩家播放一首音乐。
 * @description 音乐的起拍和动画的某一段对齐，只有动画自己知道那是第几 tick，所以播音乐放在这里。
 */
function playMusic(musicId: string, loop: boolean) {
    lib.PlayerUtils.getAll().forEach(player => player.playMusic(musicId, { loop }));
}

// #endregion
