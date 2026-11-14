import type { LevelData } from "./type";
import type { Mode } from "../main";
import { car, chest, creeper, glasses, letterG, powerSource } from "./picross1Chapter1";
import { smile } from "./tutorial";
import { angry, gear, heart, wifi, Japanese_no, like, four, helicopter, alarm_clock,  marigold_seedling, train, sunshade, master_sword, mango, snake} from "./chapter1";

/** 所有关卡。
 * @remarks
 * 该注册表是一个`LevelData[][]`的形式。
 * 其中第 1 层的数组代表一个个的章节，按顺序分别代表第 1、2、3、...章。每个模式对应的第一个章节对应的为教程关卡。章节内可能会不存在关卡。
 * 而第 2 层的数组则代表章节内的一个个关卡，按顺序分别代表该章节内的第 1、2、3、...关。
 */
export const levels: Record<Mode, LevelData[][]> = {
    /** 主线关卡。 */
    main: [
        [smile], // 教程关卡
        [angry, gear, heart, wifi, Japanese_no, like, four, helicopter, alarm_clock,  marigold_seedling, train, sunshade, master_sword, mango, snake], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
        [], // 第 4 章
        [], // 第 5 章
        [], // 第 6 章
        [], // 第 7 章
        [], // 第 8 章
        [], // 第 9 章
        [], // 第 10 章
    ],

    /** 迷你游戏 - 间隔模式。 */
    gap: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
    ],

    /** 迷你游戏 - 打乱模式。 */
    shuffle: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
    ],

    /** 迷你游戏 - 宽数字模式。 */
    wideClue: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
    ],

    /** 迷你游戏 - 雷达模式。 */
    radar: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
    ],

    /** 拼图模式。 */
    mosaic: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
    ],

    /** 自定义模式。 */
    customMode: [[]],

    /** 1 代普通关卡。 */
    picross1Normal: [
        [], // 教程关卡
        [creeper, powerSource, letterG, chest, glasses, car], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
        [], // 第 4 章
    ],

    /** 1 代困难关卡。 */
    picross1Hard: [
        [], // 教程关卡
        [], // 第 1 章
        [], // 第 2 章
        [], // 第 3 章
        [], // 第 4 章
    ],

    /** 1 代间隔模式。 */
    picross1Gap: [
        [], // 教程关卡
        [], // 第 1 章
    ],

    /** 1 代打乱模式。 */
    picross1Shuffle: [
        [], // 教程关卡
        [], // 第 1 章
    ],
};
