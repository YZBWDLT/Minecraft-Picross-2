// *-*-*-*-*-*-* 设置 *-*-*-*-*-*-*
// 动画时长、镜头高度与场地主题。这里只放可调的值，不含任何逻辑。

import { Player, world } from "@minecraft/server";
import { AllowBreakBlock, AllowInteract, SettingsId } from "./constants";
import { CustomForm, MessageBox } from "./lib/form";
import type { Mode } from "./constants";

// ===== 设置 =====

interface AnimationSettings {
    /** 是否启用动画。关闭后开场直接铺盘，退场直接重置场地。 */
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

interface ThemeSettings {
    /** 当前正在使用的主题 ID。 */
    id: string;
}

interface ProgressSettings {
    /** 当前最快的章节进度。 */
    chapter: number;
    level: number;
}

/** 游戏设置。
 * @remarks 设置中可能包含
 */
export class Settings {
    /** 动画设置。 */
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

    /** 主题设置。 */
    theme: ThemeSettings = {
        id: "goldRush",
    };
}

/** 当前使用的设置。 */
export const settings = new Settings();

// ===== 玩家进度 =====

/** 代表地图当前进度。 */
export class Progress {
    constructor() {}

    /** 主线关卡的通关进度。 */
    main: boolean[][] = [];

    /** 迷你游戏 - 间隔模式进度。 */
    gap: boolean[][] = [];

    /** 迷你游戏 - 打乱模式进度。 */
    shuffle: boolean[][] = [];

    /** 迷你游戏 - 宽数字模式进度。 */
    wideClue: boolean[][] = [];

    /** 迷你游戏 - 雷达模式进度。 */
    radar: boolean[][] = [];

    /** 拼图模式进度。 */
    mosaic: boolean[][] = [];

    /** 自定义模式进度。 */
    customMode: boolean[][] = [];

    /** 1 代普通关卡进度。 */
    picross1Normal: boolean[][] = [];

    /** 1 代困难关卡进度。 */
    picross1Hard: boolean[][] = [];

    /** 1 代间隔模式进度。 */
    picross1Gap: boolean[][] = [];

    /** 1 代打乱模式进度。 */
    picross1Shuffle: boolean[][] = [];
}

// ===== 监听玩家使用设置物品 =====

world.afterEvents.itemUse.subscribe(event => {
    const { itemStack, source: player } = event;
    if (itemStack.typeId !== SettingsId) return;
    showSettings(player);
});

function showSettings(player: Player) {
    const mainForm = new CustomForm(player, "开发者设置", "action");
    mainForm
        .button("破坏交互权限", () => {
            mainForm.close();
            permissionForm.show();
        })
        .button("场景切换", () => {
            mainForm.close();
            themeForm.show();
        })
        .button("谜题状态检查", () => {
            mainForm.close();
            puzzleForm.show();
        })
        .show();

    const permissionForm = new CustomForm(player, "破坏交互权限", "modal");
    const playerCanBreakBlock = player.hasTag(AllowBreakBlock);
    const playerCanInteract = player.hasTag(AllowInteract);
    permissionForm
        .toggle(
            "允许破坏方块",
            value => {
                if (value) player.addTag(AllowBreakBlock);
                else player.removeTag(AllowBreakBlock);
            },
            { default: playerCanBreakBlock },
        )
        .toggle(
            "允许交互",
            value => {
                if (value) player.addTag(AllowInteract);
                else player.removeTag(AllowInteract);
            },
            { default: playerCanInteract },
        );

    const themeForm = new CustomForm(player, "场景切换", "action");
    themeForm.button("淘金热", () => {});

    const puzzleForm = new CustomForm(player, "谜题状态检查", "action");
}
