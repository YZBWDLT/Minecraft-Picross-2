import type { LevelData } from "./type";

// ===== 提醒巴豆 =====
// 提示一些复制小技巧，你可以选中上面的内容之后，按 Shift + Alt + ↓ 自动复制这些行
// 在你安装了 TypeScript 之后，你可以把鼠标放到上面的变量名上查看注释，比如你可以放到 name 上查看我给你的注释。
// 你还可以按 Ctrl + 左键 定位到定义这些东西的地方上。
// 在写好关卡之后，请在 src/registry.ts 中注册关卡。
// 之后可能还会有格式上的更改，敬请注意。
// 看完之后记得销毁这些注释 :)

export const angry: LevelData = {
    columnClues: [[1, 1], [2, 2], [0], [2, 2], [1, 1]],
    rowClues: [[1, 1], [2, 2], [0], [2, 2], [1, 1]],
    name: "levelName.1-1",
    figureStructureId: "main:chapter1/angry",
};

export const gear: LevelData = {
    columnClues: [[1, 1, 1], [3], [2, 2], [3], [1, 1, 1]],
    rowClues: [[1, 1, 1], [3], [2, 2], [3], [1, 1, 1]],
    name: "levelName.1-2",
    figureStructureId: "main:chapter1/gear",
};

export const heart: LevelData = {
    columnClues: [[2], [4], [4], [4], [2]],
    rowClues: [[1, 1], [5], [5], [3], [1]],
    name: "levelName.1-3",
    figureStructureId: "main:chapter1/heart",
};

export const wifi: LevelData = {
    columnClues: [[3], [1], [1, 2], [1, 1], [1, 1, 1]],
    rowClues: [[3], [1], [1, 2], [1, 1], [1, 1, 1]],
    name: "levelName.1-4",
    figureStructureId: "main:chapter1/wifi",
};

export const Japanese_no: LevelData = {
    columnClues: [[2], [1, 1], [3], [1, 1], [3]],
    rowClues: [[3], [1, 1, 1], [1, 1, 1], [1, 1], [1]],
    name: "levelName.1-5",
    figureStructureId: "main:chapter1/Japanese_no",
};

export const like: LevelData = {
    columnClues: [[7], [0], [7], [8], [10], [10], [7], [7], [6], [3]],
    rowClues: [[2], [2], [3], [1, 7], [1, 8], [1, 8], [1, 8], [1, 7], [1, 7], [1, 6]],
    name: "levelName.1-6",
    figureStructureId: "main:chapter1/like",
};

export const four: LevelData = {
    columnClues: [[2], [4], [6], [4, 2], [2, 2], [10], [10], [10], [2], [0]],
    rowClues: [[3], [5], [6], [2, 3], [3, 3], [2, 3], [9], [9], [3], [3]],
    name: "levelName.1-7",
    figureStructureId: "main:chapter1/four",
};

export const helicopter: LevelData = {
    columnClues: [[3], [1], [2], [1, 4, 1], [1, 6, 1], [1, 8], [7, 1], [1, 1, 4], [1, 2, 2, 1], [1, 4, 2]],
    rowClues: [[3, 3], [1], [5], [1, 4, 2], [7, 1], [1, 5, 1], [7], [5], [1, 1, 1], [7]],
    name: "levelName.1-8",
    figureStructureId: "main:chapter1/helicopter",
};

export const alarm_clock: LevelData = {
    columnClues: [[2], [2, 4], [1, 6, 1], [5, 3], [4, 3], [1, 4], [9], [1, 6, 1], [2, 4], [2]],
    rowClues: [[2, 2], [2, 4, 2], [1, 3, 2, 1], [4, 3], [4, 3], [3, 4], [2, 5], [6], [4], [2, 2]],
    name: "levelName.1-9",
    figureStructureId: "main:chapter1/alarm_clock",
};

export const marigold_seedling: LevelData = {
    columnClues: [[0], [5], [1, 1, 1], [1, 2, 1], [1, 1, 2, 1], [4, 2], [1, 3, 1], [1, 1, 2], [2], [0]],
    rowClues: [[2], [1, 1, 2], [1, 1, 1, 1], [5, 1], [1, 3], [1, 3], [3, 1], [1, 1], [1, 1], [1, 1]],
    name: "levelName.1-10",
    figureStructureId: "main:chapter1/marigold_seedling",
};

export const train: LevelData = {
    columnClues: [[1, 5], [10], [1, 1, 5], [3, 1, 4], [3, 9], [3, 6], [3, 5], [4, 4], [4, 7], [3, 8], [2, 5], [3, 4], [11], [11], [4]],
    rowClues: [[7], [7], [9], [6], [3], [5, 2], [1, 1, 2], [1, 1, 2, 2], [1, 1, 2, 2], [14], [15], [15], [15], [3, 3, 3, 3], [1, 1, 1, 1]],
    name: "levelName.1-11",
    figureStructureId: "main:chapter1/train",
};

export const sunshade: LevelData = {
    columnClues: [[3], [4, 4, 1], [4, 2], [5, 1], [5, 3], [6, 1], [7, 1], [15], [7, 1], [5, 1], [6, 3] ,[5, 1] ,[4, 2] ,[4, 4, 1] ,[3]],
    rowClues: [[1], [3], [7], [11], [13], [15], [15], [2, 1, 4, 2, 2], [1], [1, 1, 1], [1, 5, 1] ,[1, 1, 1] ,[4, 1, 4] ,[1, 1, 1, 1, 1] ,[1, 1, 1, 1, 1]],
    name: "levelName.1-12",
    figureStructureId: "main:chapter1/sunshade",
};

export const master_sword: LevelData = {
    columnClues: [[1], [2], [1], [2, 1], [1, 1, 1], [2, 8], [1, 3, 1, 1], [5, 8], [2, 9], [1, 1, 1], [2, 2] ,[2] ,[2] ,[2] ,[1]],
    rowClues: [[2], [1, 2], [4], [2], [2], [1, 2], [1, 4, 1], [3, 4], [1, 2], [1, 2], [1, 2] ,[1, 2] ,[1, 2] ,[13] ,[2, 5]],
    name: "levelName.1-13",
    figureStructureId: "main:chapter1/master_sword",
};

export const mango: LevelData = {
    columnClues: [[1], [3, 2], [1, 1, 1, 5], [1, 1, 1, 4, 2], [1, 1, 4, 2], [1, 1, 1, 2], [1, 1, 1, 2], [3, 3], [3, 3], [1, 3], [2, 4] ,[4, 5] ,[10] ,[7] ,[0]],
    rowClues: [[5, 1], [1, 5], [9, 3], [1, 1, 3], [5, 3], [1, 2], [1, 2], [2, 2], [1, 3], [2, 3], [2, 3] ,[2, 4] ,[3, 5] ,[9] ,[5]],
    name: "levelName.1-14",
    figureStructureId: "main:chapter1/mango",
};

export const snake: LevelData = {
    columnClues: [[4, 1], [4, 2, 3, 1], [1, 4, 3], [1, 2, 1, 1, 2], [1, 1, 1, 1], [1, 2, 2, 1, 1], [1, 2, 2, 1], [1, 2, 2, 2], [2, 2, 1, 2], [5, 1, 2], [2, 2] ,[1, 1] ,[3, 1] ,[2, 2] ,[8]],
    rowClues: [[6], [2, 1], [1, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 2, 1], [6, 1, 2], [2, 1, 3], [3, 1, 1, 1], [2, 5, 1, 1] ,[1, 2, 2, 1] ,[2, 1] ,[2, 4, 2] ,[15]],
    name: "levelName.1-15",
    figureStructureId: "main:chapter1/snake",
};
