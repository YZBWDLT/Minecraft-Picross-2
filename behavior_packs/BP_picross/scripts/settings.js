// *-*-*-*-*-*-* 设置 *-*-*-*-*-*-*
// 动画时长、镜头高度与场地主题。这里只放可调的值，不含任何逻辑。
import { Player, world } from "@minecraft/server";
import { AllowBreakBlock, AllowInteract, SettingsId } from "./constants";
import { CustomForm, MessageBox } from "./lib/form";
/** 游戏设置。
 * @remarks 设置中可能包含
 */
export class Settings {
    /** 动画设置。 */
    animation = {
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
    theme = {
        id: "goldRush",
    };
}
/** 当前使用的设置。 */
export const settings = new Settings();
// ===== 玩家进度 =====
/** 代表地图当前进度。 */
export class Progress {
    constructor() { }
    /** 主线关卡的通关进度。 */
    main = [];
    /** 迷你游戏 - 间隔模式进度。 */
    gap = [];
    /** 迷你游戏 - 打乱模式进度。 */
    shuffle = [];
    /** 迷你游戏 - 宽数字模式进度。 */
    wideClue = [];
    /** 迷你游戏 - 雷达模式进度。 */
    radar = [];
    /** 拼图模式进度。 */
    mosaic = [];
    /** 自定义模式进度。 */
    customMode = [];
    /** 1 代普通关卡进度。 */
    picross1Normal = [];
    /** 1 代困难关卡进度。 */
    picross1Hard = [];
    /** 1 代间隔模式进度。 */
    picross1Gap = [];
    /** 1 代打乱模式进度。 */
    picross1Shuffle = [];
}
// ===== 监听玩家使用设置物品 =====
world.afterEvents.itemUse.subscribe(event => {
    const { itemStack, source: player } = event;
    if (itemStack.typeId !== SettingsId)
        return;
    showSettings(player);
});
function showSettings(player) {
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
        .toggle("允许破坏方块", value => {
        if (value)
            player.addTag(AllowBreakBlock);
        else
            player.removeTag(AllowBreakBlock);
    }, { default: playerCanBreakBlock })
        .toggle("允许交互", value => {
        if (value)
            player.addTag(AllowInteract);
        else
            player.removeTag(AllowInteract);
    }, { default: playerCanInteract });
    const themeForm = new CustomForm(player, "场景切换", "action");
    themeForm.button("淘金热", () => { });
    const puzzleForm = new CustomForm(player, "谜题状态检查", "action");
}
