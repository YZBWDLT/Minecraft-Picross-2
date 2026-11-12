import type * as picross from "../picross";

export interface LevelData extends picross.PuzzleDefinition, picross.GameOptions {
    /** 在最后谜题完成时展示的名称，应指定为语言文件中的键名。
     * @remarks
     * 如果未指定键名，需要手动在 zh_CN.lang 和 en_US.lang 中添加。
     * 如果拿不准英语该怎么翻译，可以问问 ds 老师 :)
     */
    name: string;

    /** 游戏结束后展示的图案的结构。 */
    figureStructureId?: string;

    /** 关卡编号。
     * @description 应只在对应章节内生效，例如 2-1 应记为`1`而非`16`。
     */
    level: number;
}
