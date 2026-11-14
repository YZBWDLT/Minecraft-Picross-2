import type * as picross from "../picross";

export interface LevelData extends picross.PuzzleDefinition, picross.GameOptions {
    /** 在最后谜题完成时展示的名称，应指定为语言文件中的键名。 */
    name: string;

    /** 游戏结束后展示的图案的结构。 */
    figureStructureId?: string;
}
