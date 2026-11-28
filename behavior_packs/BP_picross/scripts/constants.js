// *-*-*-*-*-*-* 常量 *-*-*-*-*-*-*
// 代码中需要使用到的常量。
// ===== 物品与方块 ID =====
/** 格子方块 ID。 */
export const CellBlockId = "picross:cell_block";
/** 标记的格子方块 ID。 */
export const CellMarkedBlockId = "picross:marked_cell_block";
/** 锁定标记的格子方块 ID。 */
export const CellLockedBlockId = "picross:locked_cell_block";
/** 铅笔 ID。 */
export const PencilId = "picross:pencil";
/** 橡皮 ID。 */
export const EraserId = "picross:eraser";
/** 铅笔和橡皮 ID。 */
export const PencilAndEraserId = "picross:pencil_and_eraser";
/** 退出关卡 ID。 */
export const QuitLevelId = "picross:quit_level";
/** 设置 ID。 */
export const SettingsId = "picross:settings";
// ===== 游戏模式定义 =====
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
// ===== 开发者标签 =====
/** 开发者标签：允许破坏方块。 */
export const AllowBreakBlock = "picross:allowBreakBlock";
/** 开发者标签：允许交互。 */
export const AllowInteract = "picross:allowInteract";
