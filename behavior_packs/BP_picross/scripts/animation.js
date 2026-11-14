// *-*-*-*-*-*-* 动画 *-*-*-*-*-*-*
// 开场、结束、退场三段流程的时序编排：黑屏、架镜头、锁人、铺盘与擦盘。
// 三段流程都直接接收 `Level`，读写它的布局、可操作状态与场地加载，不再另设上下文对象。
// 三段流程都返回 Promise<boolean>：顺利走完为 true，中途出错或时间线被占用为 false，
// 调用方只需要在 then 里接「走完之后该干什么」，不必关心内部是走时间线还是一步到位。
import * as minecraft from "@minecraft/server";
import * as lib from "./lib";
import { createEraseSteps, createRenderSteps, renderBoardInstant } from "./board";
import { settings } from "./settings";
/** 播放开场动画。
 * @description
 * 开启动画时的流程：
 * - Step 1：黑屏淡入后，加载场地，禁止玩家操作，在盘面上方架镜头。
 * - Step 2：黑屏淡出后，盘面逐层出现。
 * - Step 3：盘面出现后，等待一段时间并恢复玩家操作。
 * @description
 * 关闭动画时的流程：立刻显示盘面。
 */
export function playStartAnimation(level, additionalCallback) {
    const layout = level.layout;
    const animation = settings.animation;
    const dimension = minecraft.world.getDimension("overworld");
    const players = lib.PlayerUtils.getAll();
    // ===== 关闭动画时 =====
    if (!animation.enabled) {
        level.loadScene().then(() => {
            // --- 场地加载完毕 ---
            additionalCallback?.onSceneLoaded?.();
            // --- 开始出现盘面 ---
            additionalCallback?.onBoardAppear?.();
            renderBoardInstant(layout, dimension);
            // --- 动画结束 ---
            level.boardOperable = true;
            additionalCallback?.onFinished?.();
        }, cause => {
            level.fail(cause);
            return false;
        });
        return;
    }
    // ===== 开启动画时 =====
    /** Step 1：黑屏淡入的时间点。 */
    const step1Tick = animation.playerCameraFadeInTime * 20;
    /** Step 2：黑屏淡出的时间点（step1 + hold + fadeout）。 */
    const step2Tick = step1Tick + animation.playerCameraHoldTime * 20 + animation.playerCameraFadeOutTime * 20;
    /** 加载面板所需的时间。 */
    const boardTicks = animation.showCellAnimationTime * 20;
    /** Step 3：加载完毕的时间点（step2 + showCell）。 */
    const step3Tick = step2Tick + boardTicks + animation.holdCellTime * 20;
    fadeCamera(players);
    lib.gameSystem.unsubscribeTimeline("startAnimation");
    lib.gameSystem.subscribeTimeline("startAnimation", time => {
        try {
            // --- 场地加载 ---
            if (time === step1Tick) {
                level.loadScene().then(() => additionalCallback?.onSceneLoaded?.());
                movePlayersToOverhead(players, layout, getPanelCenter(layout), layout.panelRect);
                lib.PlayerUtils.lockPlayers(players);
            }
            // --- 开始出现盘面 ---
            else if (time === step2Tick) {
                additionalCallback?.onBoardAppear?.();
                playBoardAppear(level, createRenderSteps(layout, dimension), boardTicks);
                playMusic("game_1", true);
            }
            // --- 动画结束 ---
            else if (time >= step3Tick) {
                lib.PlayerUtils.unlockPlayers(players);
                level.boardOperable = true;
                additionalCallback?.onFinished?.();
                return false;
            }
        }
        catch (cause) {
            level.fail(cause);
            return false;
        }
    });
}
/** 播放加载盘面的动画。
 * @param steps 渲染动作，按顺序执行。
 */
function playBoardAppear(level, steps, targetTicks) {
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
        }
        catch (cause) {
            level.fail(cause);
            return false;
        }
        // 所有帧都加载出来后，立刻终止运行
        if (loadedFrames >= frames)
            return false;
    });
}
// #endregion
// #region 结束
/** 播放结束动画：黑屏 -> 俯视盘面 -> 逐层擦除 -> 展示图案与关卡名 -> 退出关卡。 */
export function playFinishAnimation(level) {
    return settings.animation.enabled ? playFinishAnimated(level) : playFinishInstant(level);
}
/** 结束流程（开启动画时）。 */
function playFinishAnimated(level) {
    const layout = level.layout;
    const animation = settings.animation;
    const dimension = minecraft.world.getDimension("overworld");
    const players = lib.PlayerUtils.getAll();
    const eraseSteps = createEraseSteps(layout, dimension);
    const fadeInTicks = Math.max(1, Math.round(animation.playerCameraFadeInTime * 20));
    const holdTicks = Math.round(animation.playerCameraHoldTime * 20);
    const fadeOutTicks = Math.round(animation.playerCameraFadeOutTime * 20);
    const blackoutTicks = fadeInTicks + holdTicks + fadeOutTicks;
    const eraseTicks = Math.max(1, Math.round(animation.showCellAnimationTime * 20));
    const eraseEndTicks = blackoutTicks + eraseTicks - 1;
    const figureTicks = blackoutTicks + Math.max(eraseTicks, Math.round(animation.holdEraseTime * 20));
    const resetTicks = figureTicks + Math.round(animation.holdFigureTime * 20);
    // 逐层擦除用累积速率推进，和开场动画同一套算法
    const eraseRate = eraseSteps.length > 1 && eraseTicks > 1 ? (eraseSteps.length - 1) / (eraseTicks - 1) : eraseSteps.length;
    let eraseAccumulator = 1;
    let eraseIndex = 0;
    fadeCamera(players);
    return new Promise(resolve => lib.gameSystem.subscribeTimeline("finishAnimation", time => {
        try {
            // 完全黑屏后，调整玩家视角，锁定玩家
            if (time === fadeInTicks) {
                movePlayersToOverhead(players, layout, getCellCenter(layout), layout.boardRect);
                lib.PlayerUtils.lockPlayers(players);
            }
            // 黑屏淡出后，逐步擦除数字和标记格子方块
            if (time >= blackoutTicks && time <= eraseEndTicks) {
                eraseAccumulator += eraseRate;
                while (eraseAccumulator >= 1 && eraseIndex < eraseSteps.length) {
                    eraseSteps[eraseIndex++]?.();
                    eraseAccumulator -= 1;
                }
            }
            // 显示图案和关卡名称，音乐由 showFinish 一起放出
            if (time === figureTicks) {
                while (eraseIndex < eraseSteps.length)
                    eraseSteps[eraseIndex++]?.();
                showFinish(level, players);
            }
            // 动作栏文字会自己淡出，所以每秒补一次
            if (time > figureTicks && time < resetTicks && time % 20 === 0) {
                players.forEach(player => player.onScreenDisplay.setActionBar({ translate: level.game.name }));
            }
            // 离开时开始退出关卡程序
            if (time >= resetTicks) {
                level.exit();
                resolve(true);
                return false;
            }
        }
        catch (cause) {
            level.fail(cause);
            resolve(false);
            return false;
        }
    }));
}
/** 结束流程（关闭动画时）：不黑屏，立刻完成擦除，只保留两段停留。 */
function playFinishInstant(level) {
    const layout = level.layout;
    const animation = settings.animation;
    const dimension = minecraft.world.getDimension("overworld");
    const players = lib.PlayerUtils.getAll();
    // 立刻挪人、架镜头、锁操作。和开启动画时一样，只对准格子区。
    movePlayersToOverhead(players, layout, getCellCenter(layout), layout.boardRect);
    lib.PlayerUtils.lockPlayers(players);
    // 擦除不逐层推进，一口气做完
    for (const step of createEraseSteps(layout, dimension))
        step();
    const figureTicks = Math.max(1, Math.round(animation.holdEraseTime * 20));
    // 图案瞬间出现，holdFigureTime 就是完整图案的可见时长
    const endTicks = figureTicks + Math.round(animation.holdFigureTime * 20);
    return new Promise(resolve => lib.gameSystem.subscribeTimeline("finishAnimation", time => {
        try {
            if (time === figureTicks)
                showFinish(level, players);
            if (time > figureTicks && time < endTicks && time % 20 === 0)
                players.forEach(player => player.onScreenDisplay.setActionBar({ translate: level.game.name }));
            if (time >= endTicks) {
                level.exit();
                clearLevelName(players);
                resolve(true);
                return false;
            }
        }
        catch (cause) {
            level.fail(cause);
            resolve(false);
            return false;
        }
    }));
}
// #endregion
// #region 退场
/** 播放退场动画。
 * @description 黑屏 -> 锁定玩家并重置场地 -> 场地恢复后解锁玩家
 */
export function playExitAnimation(level) {
    const animation = settings.animation;
    const players = lib.PlayerUtils.getAll();
    // 移除玩家的快捷栏标题
    clearLevelName(players);
    // ===== 关闭动画时 =====
    // 直接重置场地并解锁玩家
    if (!animation.enabled) {
        lib.PlayerUtils.lockPlayers(players);
        return level.loadScene().then(() => {
            lib.PlayerUtils.unlockPlayers(players);
            return true;
        }, cause => {
            level.fail(cause);
            return false;
        });
    }
    // ===== 开启动画时 =====
    // 开始时，锁定玩家并黑屏淡入
    lib.PlayerUtils.lockPlayers(players);
    fadeCamera(players);
    return new Promise(resolve => {
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
function getViewpoint(layout) {
    return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y + 1, z: layout.boardRect.to.z + 1.5 };
}
/** 格子区的几何中心。开场用不到它，结束展示图案时用它取景。 */
function getCellCenter(layout) {
    return { x: layout.cellCenter.x + 0.5, y: layout.cellCenter.y, z: layout.cellCenter.z + 0.5 };
}
/** 整块面板（含线索区）的几何中心。开场展示盘面时用它取景。 */
function getPanelCenter(layout) {
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
function getCameraHeight(center, rect) {
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
function movePlayersToOverhead(players, layout, center, rect) {
    const cameraLocation = { ...center, y: center.y + getCameraHeight(center, rect) };
    players.forEach(player => {
        player.teleport(getViewpoint(layout), { rotation: { x: 0, y: 180 } });
        player.camera.setCamera("minecraft:free", { location: cameraLocation, rotation: { x: 89.9, y: 180 } });
    });
}
/** 给这些玩家播一次黑屏淡入淡出，时长取自动画设置。 */
function fadeCamera(players) {
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
function playMusic(musicId, loop) {
    lib.PlayerUtils.getAll().forEach(player => player.playMusic(musicId, { loop }));
}
/** 显示图案并播放音乐。 */
function showFinish(level, players) {
    // 加载通关图案
    const structureId = level.figureStructureId;
    if (structureId)
        lib.StructureUtils.placeAsync(structureId, level.layout.startLocation);
    // 显示快捷栏标题
    players.forEach(player => player.onScreenDisplay.setActionBar({ translate: level.game.name }));
    // 播放音乐
    playMusic("show_picture", false);
}
/** 清掉动作栏上的关卡名。 */
function clearLevelName(players) {
    players.forEach(player => player.onScreenDisplay.setActionBar(""));
}
// #endregion
