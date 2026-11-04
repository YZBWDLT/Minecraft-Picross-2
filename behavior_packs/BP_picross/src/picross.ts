/**
 * picross.ts —— 数织（Picross / Nonogram）纯逻辑核心
 *
 * 设计约束：
 *   1. 不依赖 Minecraft API（不 import @minecraft/server），也不依赖任何宿主环境
 *      （无 DOM、无 console、无计时器、无文件系统），只做纯数据计算。
 *   2. 便于未来照搬到中国版 ModAPI（Python 2.7）：只使用枚举、类、数组、普通函数与循环，
 *      没有生成器、没有 Map/Set，翻译时几乎是逐函数对应。
 *   3. 只负责"盘面与线索的真相"，不关心怎么显示。显示层（方块、贴图、UI）由调用方负责。
 *
 * 结构（按"操作对象"分组，而不是按代码长度堆在一起）：
 *   - Clues        线索数组的纯函数工具：规范化、从格子生成、比较、能否放下。
 *   - Line         单行/单列的推理：是否完成、矛盾、统计、能推出哪些格子。
 *   - Puzzle       关卡定义的构造与校验：图案解析、尺寸、合法性。
 *   - PicrossGame  有状态的游戏实例：玩家操作、撤销、提示、存档。
 *   前三个只是命名空间，不含任何状态；一切"会变的东西"都在 PicrossGame 里。
 *
 * 坐标与状态约定：
 *   - row 向下递增，column 向右递增，均从 0 开始。
 *   - 单元格四态用字符串表示：unknown / filled / blank / locked，与盘面上的四种方块一一对应。
 *
 * 典型用法（TypeScript / SAPI 脚本）：
 *   import { PicrossGame, CellState } from "./picross.js";
 *
 *   // 从图案创建关卡（'#' 已涂、'.' 空白）
 *   const game = PicrossGame.fromPattern(["..#..", "..#..", "#####"], "十字");
 *
 *   // 玩家操作：返回值是本次变化的全部格子（含自动打叉的连带变化），照着刷方块即可
 *   game.markFilled(row, column);      // 挖掉格子方块 → 填涂
 *   game.markBlank(row, column);       // 铅笔标记格子方块 → 标记为空
 *   game.markUnknown(row, column);     // 橡皮取消标记 → 回到格子方块
 *
 *   // 查询
 *   game.getCell(row, column);         // 当前状态
 *   game.isRowComplete(row);           // 该行是否已满足线索
 *   game.getRowRemaining(row);         // 该行还差几个实心格
 *   game.isSolved();                   // 整盘是否完成
 *
 *   // 辅助功能
 *   game.applyDeduction();             // 自动推出所有可确定的格子
 *   game.takeHint();                   // 给一个提示（改一格）
 *   game.autoCrossCompletedLines();    // 已完成的行列自动打叉
 *
 * 由基于 Deepseek v4.1 flash 的 WorkBuddy 生成。
 */

// #region 常量与基础类型

/**
 * 单元格状态，与盘面上的四种方块一一对应。
 *
 * 前三种由玩家操作产生，第四种 Locked 由关卡初始状态给定。
 */
export enum CellState {
    /** 未知：对应格子方块。可以铅笔标记，也可以挖掉填涂。 */
    Unknown = "unknown",
    /** 已涂：对应被挖掉的格子（空气），代表实心。 */
    Filled = "filled",
    /** 已标记为空：对应标记格子方块。可以橡皮取消，不能直接挖。 */
    Blank = "blank",
    /** 锁定标记：对应锁定标记格子方块。初始就有，玩家无法修改。 */
    Locked = "locked",
}

/** 一行/一列线索的表达：例如 [3, 1] 表示"连续 3 格 + 连续 1 格"。 */
export type Clue = readonly number[];

/** 行列状态的文字结论。 */
export type LineStatus = "complete" | "incomplete" | "contradiction";

/** 盘面坐标。 */
export interface CellPos {
    row: number;
    column: number;
}

/** 一次单元格变更（用于把改动回传给渲染层）。 */
export interface CellChange extends CellPos {
    /** 变更前的状态。 */
    previous: CellState;
    /** 变更后的状态。 */
    state: CellState;
}

/**
 * 关卡定义：只含线索，不含答案。
 * 盘面尺寸不单独存储，直接由 rowClues / columnClues 的长度推导，避免"两处真相"。
 */
export interface PuzzleDefinition {
    name?: string;
    /** 每行的线索，数组长度即盘面高度。 */
    rowClues: Clue[];
    /** 每列的线索，数组长度即盘面宽度。 */
    columnClues: Clue[];
}

/** 单行推导结论。 */
export interface LineAnalysis {
    /** 当前状态下是否已经不可能满足线索。 */
    contradiction: boolean;
    /** 在所有合法摆法里都必须是实心格的列索引（只含原本未知的格子）。 */
    forcedFilled: number[];
    /** 在所有合法摆法里都必须是空格的列索引（只含原本未知的格子）。 */
    forcedBlank: number[];
}

/** 单行统计（供 UI 显示进度用）。 */
export interface LineStats {
    /** 需要的实心格总数（线索之和）。 */
    required: number;
    /** 当前已涂数量。 */
    filled: number;
    /** 未知格数量。 */
    unknown: number;
    /** 已标记为空的数量。 */
    blank: number;
    /** 是否已满足线索。 */
    complete: boolean;
    /** 是否与线索矛盾。 */
    contradiction: boolean;
}

/** 整盘进度。 */
export interface PuzzleProgress {
    /** 已涂格数。 */
    filled: number;
    /** 答案要求的实心格总数。 */
    required: number;
    /** 已完成（线索满足）的行列数。 */
    completedLines: number;
    /** 行列总数。 */
    totalLines: number;
}

/** 序列化快照，JSON.stringify 会自动调用 PicrossGame.toJSON。 */
export interface PuzzleSnapshot extends PuzzleDefinition {
    /** 每一格的状态，按 row * width + column 扁平排列。 */
    cells: CellState[];
}

/** 构造 PicrossGame 的可选项。 */
export interface GameOptions {
    /** 答案（可选）。提供后可支持"提示兜底""错误检查""直接看答案"。 */
    solution?: readonly (readonly boolean[])[];
    /** 撤销栈上限，默认 64。 */
    historyLimit?: number;
    /** 每次操作后是否自动给已完成的行列打叉，默认 false（交给按钮控制更灵活）。 */
    autoCross?: boolean;
    /**
     * 初始就锁定的格子（视为"已知为空"）。
     * 锁定格玩家无法修改，用于关卡作者预置线索、收紧解空间。
     */
    locked?: readonly CellPos[];
}

// #endregion

// #region 内部小工具

/**
 * 安全读取单元格。
 * 数组下标在 noUncheckedIndexedAccess 下会带上 undefined，这里统一收敛成 CellState.Unknown。
 */
function cellAt(cells: readonly CellState[], index: number): CellState {
    const value = cells[index];
    if (value === CellState.Filled) return value;
    if (value === CellState.Blank) return value;
    if (value === CellState.Locked) return value;
    return CellState.Unknown;
}

/**
 * 该状态是否属于"已知为空"。
 * 玩家标记的 Blank 和关卡给定的 Locked 在推理与判定里完全等价，只有能否修改的区别。
 */
function isBlank(state: CellState): boolean {
    return state === CellState.Blank || state === CellState.Locked;
}

/**
 * 安全读取线索数组。
 * 越界属于调用方写错了，直接抛错，避免把错误悄悄吃掉变成"这行没线索"。
 */
function clueAt(clues: readonly Clue[], index: number): Clue {
    const clue = clues[index];
    if (clue === undefined) throw new Error(`线索索引越界：${index}`);
    return clue;
}

/**
 * 安全读取数字数组，越界按 0 处理。
 * 只用于前缀和、线索长度这类一定有界的内部计算，不用于校验用户输入。
 */
function numberAt(values: readonly number[], index: number): number {
    const value = values[index];
    return value === undefined ? 0 : value;
}

/** 安全读取 0/1 标记数组，用于 DP 的可行性表。 */
function flagAt(flags: Uint8Array, index: number): boolean {
    return flags[index] === 1;
}

// #endregion

// #region 线索工具

/** 线索数组的纯函数工具。线索本身只是 number[]，这里不引入任何包装对象。 */
export class Clues {
    /**
     * 规范化线索：去掉 0、校验非负整数。返回新数组，不修改入参。
     */
    static normalize(clue: Clue): Clue {
        const result: number[] = [];
        clue.forEach(value => {
            if (!Number.isInteger(value)) throw new Error(`线索必须是整数，收到：${value}`);
            if (value < 0) throw new Error(`线索不能是负数，收到：${value}`);
            // 0 代表"没有线索"，等价于空数组
            if (value === 0) return;
            result.push(value);
        });
        return result;
    }

    /**
     * 从一行单元格状态生成线索（连续实心段长度）。
     * 例：[涂,涂,空,涂] → [2, 1]
     */
    static fromLine(line: readonly CellState[]): Clue {
        const clue: number[] = [];
        let run = 0;
        line.forEach(state => {
            if (state === CellState.Filled) {
                run++;
            } else if (run > 0) {
                clue.push(run);
                run = 0;
            }
        });
        if (run > 0) clue.push(run);
        return clue;
    }

    /** 两个线索是否完全相同。 */
    static equal(a: Clue, b: Clue): boolean {
        if (a.length !== b.length) return false;
        return a.every((value, index) => value === b[index]);
    }

    /** 线索在给定长度的行里是否放得下。 */
    static fits(clue: Clue, length: number): boolean {
        const runs = Clues.normalize(clue);
        if (runs.length === 0) return length >= 0;
        const total = runs.reduce((sum, value) => sum + value, 0);
        // 段与段之间至少留一个空格
        return total + runs.length - 1 <= length;
    }
}

// #endregion

// #region 单行推导
//
// 思路：把"当前已知信息 + 线索"下所有合法的线段摆放方式求出来，
// 然后对每一格判断"是否在所有方案里都被涂 / 都没被涂"，得到必然结论。
// 用两次动态规划实现，复杂度 O(行长 × 线索段数)，30 格以内每帧调用都无压力。
//
//   feasible[i][k]：从第 i 格开始、还剩第 k 段及以后没放，能否放完。
//   from[i][k]   ：从第 0 格走到第 i 格、已放完前 k 段，是否可达。
//
// 这一段刻意保留 for：两张 DP 表都是"扁平数组 + i * stride + k"的下标寻址，
// 还要反向遍历和提前跳出，用数组方法只会更难读，不划算。

/** 单行/单列的推理工具（纯函数，不持有状态）。 */
export class Line {
    /** 该行是否已经满足线索（只比实心段，未知格不影响判断）。 */
    static isComplete(line: readonly CellState[], clue: Clue): boolean {
        return Clues.equal(Clues.fromLine(line), Clues.normalize(clue));
    }

    /**
     * 推导一行：返回必然涂、必然空的格子。不会修改入参数组。
     */
    static analyze(line: readonly CellState[], clue: Clue): LineAnalysis {
        const length = line.length;
        const runs = Clues.normalize(clue);
        const runCount = runs.length;

        // 本行没有任何线索：整行必须为空。
        if (runCount === 0) {
            if (line.some(state => state === CellState.Filled)) {
                return { contradiction: true, forcedFilled: [], forcedBlank: [] };
            }
            const forcedBlank = line.flatMap((state, i) => (state === CellState.Unknown ? [i] : []));
            return { contradiction: false, forcedFilled: [], forcedBlank };
        }

        if (length === 0) return { contradiction: true, forcedFilled: [], forcedBlank: [] };

        // 预处理：空格前缀、后缀是否还残留实心格
        const blankPrefix = line.reduce<number[]>(
            (prefix, state) => {
                const last = numberAt(prefix, prefix.length - 1);
                prefix.push(last + (isBlank(state) ? 1 : 0));
                return prefix;
            },
            [0],
        );

        const noFilledFrom = new Uint8Array(length + 1);
        noFilledFrom[length] = 1;
        for (let i = length - 1; i >= 0; i--) {
            const clear = cellAt(line, i) !== CellState.Filled && flagAt(noFilledFrom, i + 1);
            noFilledFrom[i] = clear ? 1 : 0;
        }

        // 从 start 开始放长度为 runLength 的段是否合法（段内不能有已标记的空格）
        const canPlace = (start: number, runLength: number): boolean => {
            if (runLength <= 0 || start < 0 || start + runLength > length) return false;
            const blanks = numberAt(blankPrefix, start + runLength) - numberAt(blankPrefix, start);
            return blanks === 0;
        };

        const stride = runCount + 1;

        // feasible：从后往前
        const feasible = new Uint8Array((length + 1) * stride);
        for (let i = length; i >= 0; i--) {
            for (let k = runCount; k >= 0; k--) {
                const offset = i * stride + k;
                if (i === length) {
                    // 已走到末尾，只有"段也放完了"才算成功
                    feasible[offset] = k === runCount ? 1 : 0;
                    continue;
                }
                if (k === runCount) {
                    // 段放完了，剩下的格必须都不是实心
                    feasible[offset] = flagAt(noFilledFrom, i) ? 1 : 0;
                    continue;
                }
                let ok = false;
                // 选择 1：本格留空
                if (cellAt(line, i) !== CellState.Filled && flagAt(feasible, (i + 1) * stride + k)) ok = true;
                // 选择 2：本格作为第 k 段的起点
                if (!ok) {
                    const runLength = numberAt(runs, k);
                    if (canPlace(i, runLength)) {
                        const next = i + runLength;
                        if (next === length) {
                            ok = flagAt(feasible, length * stride + (k + 1));
                        } else if (cellAt(line, next) !== CellState.Filled) {
                            // 段后至少留一个空格作分隔
                            ok = flagAt(feasible, (next + 1) * stride + (k + 1));
                        }
                    }
                }
                feasible[offset] = ok ? 1 : 0;
            }
        }

        if (!flagAt(feasible, 0)) return { contradiction: true, forcedFilled: [], forcedBlank: [] };

        // from：从前往后
        const from = new Uint8Array((length + 1) * stride);
        from[0] = 1;
        for (let i = 0; i < length; i++) {
            for (let k = 0; k <= runCount; k++) {
                if (!flagAt(from, i * stride + k)) continue;
                if (cellAt(line, i) !== CellState.Filled) from[(i + 1) * stride + k] = 1;
                if (k < runCount) {
                    const runLength = numberAt(runs, k);
                    if (canPlace(i, runLength)) {
                        const next = i + runLength;
                        if (next === length) {
                            from[length * stride + (k + 1)] = 1;
                        } else if (cellAt(line, next) !== CellState.Filled) {
                            from[(next + 1) * stride + (k + 1)] = 1;
                        }
                    }
                }
            }
        }

        // 统计：某格能否被涂 / 能否为空
        const canFilled = new Uint8Array(length);
        const canBlank = new Uint8Array(length);

        // 情形 A：作为某一段的组成部分（必然被涂），
        //         以及作为"段与段之间的分隔空格"（必然为空）。
        //         注意：分隔格不在 DP 的决策点上，必须单独补进来，否则会被漏判成"必涂"。
        for (let i = 0; i < length; i++) {
            for (let k = 0; k < runCount; k++) {
                if (!flagAt(from, i * stride + k)) continue;
                const runLength = numberAt(runs, k);
                if (!canPlace(i, runLength)) continue;
                const end = i + runLength;
                if (end === length) {
                    if (!flagAt(feasible, length * stride + (k + 1))) continue;
                } else {
                    // 段后必须留一个空格，那一格不能已经是实心
                    if (cellAt(line, end) === CellState.Filled) continue;
                    if (!flagAt(feasible, (end + 1) * stride + (k + 1))) continue;
                    canBlank[end] = 1;
                }
                for (let c = i; c < end; c++) canFilled[c] = 1;
            }
        }

        // 情形 B：作为自由决策点上的空格
        line.forEach((state, i) => {
            if (state === CellState.Filled) return;
            for (let k = 0; k <= runCount; k++) {
                if (flagAt(from, i * stride + k) && flagAt(feasible, (i + 1) * stride + k)) {
                    canBlank[i] = 1;
                    break;
                }
            }
        });

        // 结论：只对"目前未知"的格子下判断
        const forcedFilled: number[] = [];
        const forcedBlank: number[] = [];
        line.forEach((state, i) => {
            if (state !== CellState.Unknown) return;
            if (canBlank[i] !== 1) {
                forcedFilled.push(i);
            } else if (canFilled[i] !== 1) {
                forcedBlank.push(i);
            }
        });

        return { contradiction: false, forcedFilled, forcedBlank };
    }

    /** 一行/一列的总结论。 */
    static status(line: readonly CellState[], clue: Clue): LineStatus {
        if (Line.isComplete(line, clue)) return "complete";
        return Line.analyze(line, clue).contradiction ? "contradiction" : "incomplete";
    }

    /** 一行/一列的统计信息。 */
    static stats(line: readonly CellState[], clue: Clue): LineStats {
        const runs = Clues.normalize(clue);
        const required = runs.reduce((sum, value) => sum + value, 0);

        const counts = line.reduce(
            (acc, state) => {
                if (state === CellState.Filled) {
                    acc.filled++;
                } else if (state === CellState.Unknown) {
                    acc.unknown++;
                } else {
                    acc.blank++;
                }
                return acc;
            },
            { filled: 0, unknown: 0, blank: 0 },
        );

        return {
            required,
            filled: counts.filled,
            unknown: counts.unknown,
            blank: counts.blank,
            complete: Clues.equal(Clues.fromLine(line), runs),
            contradiction: Line.analyze(line, runs).contradiction,
        };
    }
}

// #endregion

// #region 关卡定义

/** 关卡定义的构造与校验工具（纯函数，不持有状态）。 */
export class Puzzle {
    /** 图案字符转布尔网格：'#' 或 '1' 为实心；'.' '0' '-' 空格 为空白。 */
    static parsePattern(patterns: readonly string[]): boolean[][] {
        if (patterns.length === 0) throw new Error("图案为空");
        const width = (patterns[0] ?? "").length;
        if (width === 0) throw new Error("图案宽度为 0");

        return patterns.map((rowText, r) => {
            if (rowText.length !== width) throw new Error(`第 ${r} 行长度不一致：${rowText.length} != ${width}`);

            return Array.from(rowText, ch => {
                if (ch === "#" || ch === "1") return true;
                if (ch === "." || ch === "0" || ch === "-" || ch === " ") return false;
                throw new Error(`无法识别的图案字符：${ch}`);
            });
        });
    }

    /** 由布尔网格生成关卡定义（线索全部由图案推导）。 */
    static fromGrid(grid: readonly (readonly boolean[])[], name?: string): PuzzleDefinition {
        const height = grid.length;
        if (height === 0) throw new Error("网格为空");

        const first = grid[0];
        if (first === undefined) throw new Error("网格为空");
        const width = first.length;
        if (width === 0) throw new Error("网格宽度为 0");

        grid.forEach((row, r) => {
            if (row.length !== width) throw new Error(`第 ${r} 行长度与首行不一致`);
        });

        const rowClues = grid.map(row => Clues.fromLine(row.map(filled => (filled === true ? CellState.Filled : CellState.Blank))));

        const columnClues = Array.from({ length: width }, (_, c) =>
            Clues.fromLine(grid.map(row => (row[c] === true ? CellState.Filled : CellState.Blank))),
        );

        const puzzle: PuzzleDefinition = { rowClues, columnClues };
        if (name !== undefined) puzzle.name = name;
        return puzzle;
    }

    /** 由图案字符串直接生成关卡定义。 */
    static fromPattern(patterns: readonly string[], name?: string): PuzzleDefinition {
        return Puzzle.fromGrid(Puzzle.parsePattern(patterns), name);
    }

    /** 取关卡宽度，等于列线索的数量。 */
    static width(puzzle: PuzzleDefinition): number {
        return puzzle.columnClues.length;
    }

    /** 取关卡高度，等于行线索的数量。 */
    static height(puzzle: PuzzleDefinition): number {
        return puzzle.rowClues.length;
    }

    /**
     * 校验关卡定义，返回问题列表（空数组表示没问题）。
     * 只检查"结构合法"，不检查是否有解、是否唯一解。
     */
    static validate(puzzle: PuzzleDefinition): string[] {
        const problems: string[] = [];
        const height = Puzzle.height(puzzle);
        const width = Puzzle.width(puzzle);

        if (height <= 0) problems.push("rowClues 不能为空，盘面至少要有 1 行");
        if (width <= 0) problems.push("columnClues 不能为空，盘面至少要有 1 列");

        puzzle.rowClues.forEach((clue, r) => {
            try {
                Clues.normalize(clue);
            } catch (error) {
                problems.push(`第 ${r} 行线索非法：${String(error)}`);
                return;
            }
            if (!Clues.fits(clue, width)) problems.push(`第 ${r} 行线索在本宽度里放不下`);
        });

        puzzle.columnClues.forEach((clue, c) => {
            try {
                Clues.normalize(clue);
            } catch (error) {
                problems.push(`第 ${c} 列线索非法：${String(error)}`);
                return;
            }
            if (!Clues.fits(clue, height)) problems.push(`第 ${c} 列线索在本高度里放不下`);
        });

        return problems;
    }
}

// #endregion

// #region 游戏实例

export class PicrossGame {
    /** 谜题的长度（等于列线索的数量）。 */
    readonly width: number;
    /** 谜题的高度（等于行线索的数量）。 */
    readonly height: number;

    /** 关卡名，未命名时为空字符串。 */
    readonly name: string;
    /** 每行的线索。 */
    readonly rowClues: readonly Clue[];
    /** 每列的线索。 */
    readonly columnClues: readonly Clue[];
    /** 答案扁平数组（未提供则为 undefined）。 */
    readonly solution: readonly boolean[] | undefined;

    private readonly _historyLimit: number;
    private readonly _autoCross: boolean;

    /** 扁平存储：index = row * width + column */
    private cells: CellState[];

    private undoStack: CellState[][];
    private redoStack: CellState[][];

    // #region - 构造与工厂

    constructor(puzzle: PuzzleDefinition, options?: GameOptions) {
        const problems = Puzzle.validate(puzzle);
        if (problems.length > 0) throw new Error(`谜题定义有误：${problems.join("；")}`);

        this.width = Puzzle.width(puzzle);
        this.height = Puzzle.height(puzzle);
        this.name = puzzle.name ?? "";

        this.rowClues = Object.freeze(puzzle.rowClues.map(clue => Object.freeze(Clues.normalize(clue))));
        this.columnClues = Object.freeze(puzzle.columnClues.map(clue => Object.freeze(Clues.normalize(clue))));

        this._historyLimit = Math.max(1, Math.floor(options?.historyLimit ?? 64));
        this._autoCross = options?.autoCross === true;
        this.undoStack = [];
        this.redoStack = [];

        const solution = options?.solution;
        if (solution !== undefined) {
            if (solution.length !== this.height) throw new Error("答案行数与 height 不一致");

            const flat: boolean[] = [];
            solution.forEach((row, r) => {
                if (row.length !== this.width) throw new Error(`答案第 ${r} 行长度与 width 不一致`);
                row.forEach(filled => flat.push(filled === true));
            });
            this.solution = Object.freeze(flat);
        } else {
            this.solution = undefined;
        }

        this.cells = new Array<CellState>(this.width * this.height).fill(CellState.Unknown);
        options?.locked?.forEach(pos => {
            this.assertInBounds(pos.row, pos.column);
            this.cells[this.index(pos.row, pos.column)] = CellState.Locked;
        });
    }

    /** 由图案字符串创建实例（图案同时作为答案保存，便于提示）。 */
    static fromPattern(patterns: readonly string[], name?: string, options?: GameOptions): PicrossGame {
        const grid = Puzzle.parsePattern(patterns);
        return new PicrossGame(Puzzle.fromGrid(grid, name), { ...(options ?? {}), solution: grid });
    }

    /** 由布尔网格创建实例。 */
    static fromGrid(grid: readonly (readonly boolean[])[], name?: string, options?: GameOptions): PicrossGame {
        return new PicrossGame(Puzzle.fromGrid(grid, name), { ...(options ?? {}), solution: grid });
    }

    /** 由序列化快照还原（不含撤销历史）。 */
    static fromJSON(snapshot: PuzzleSnapshot, options?: GameOptions): PicrossGame {
        const puzzle: PuzzleDefinition = {
            rowClues: snapshot.rowClues,
            columnClues: snapshot.columnClues,
        };
        if (snapshot.name !== undefined) puzzle.name = snapshot.name;

        const game = new PicrossGame(puzzle, options);
        if (snapshot.cells.length !== game.cells.length) throw new Error("快照的 cells 数量与盘面尺寸不符");

        game.cells = Array.from({ length: game.cells.length }, (_, i) => cellAt(snapshot.cells, i));
        return game;
    }

    // #endregion

    // #region - 基本信息

    rowClue(row: number): Clue {
        return clueAt(this.rowClues, row);
    }

    columnClue(column: number): Clue {
        return clueAt(this.columnClues, column);
    }

    private index(row: number, column: number): number {
        return row * this.width + column;
    }

    private assertInBounds(row: number, column: number): void {
        if (!Number.isInteger(row) || !Number.isInteger(column)) throw new Error("坐标必须是整数");
        if (row < 0 || row >= this.height || column < 0 || column >= this.width) {
            throw new Error(`坐标越界：(${row}, ${column})`);
        }
    }

    private stateAt(index: number): CellState {
        return cellAt(this.cells, index);
    }

    // #endregion

    // #region - 读取

    getCell(row: number, column: number): CellState {
        this.assertInBounds(row, column);
        return this.stateAt(this.index(row, column));
    }

    getRow(row: number): CellState[] {
        this.assertInBounds(row, 0);
        return Array.from({ length: this.width }, (_, c) => this.stateAt(this.index(row, c)));
    }

    getColumn(column: number): CellState[] {
        this.assertInBounds(0, column);
        return Array.from({ length: this.height }, (_, r) => this.stateAt(this.index(r, column)));
    }

    /** 所有锁定格的坐标。 */
    getLockedCells(): CellPos[] {
        return this.cells.flatMap((state, index) => {
            if (state !== CellState.Locked) return [];
            const row = Math.floor(index / this.width);
            return [{ row, column: index - row * this.width }];
        });
    }

    // #endregion

    // #region - 历史记录

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    private beginEdit(): void {
        this.undoStack.push(this.cells.slice());
        if (this.undoStack.length > this._historyLimit) this.undoStack.shift();
        this.redoStack.length = 0;
    }

    undo(): boolean {
        const snapshot = this.undoStack.pop();
        if (snapshot === undefined) return false;
        this.redoStack.push(this.cells.slice());
        this.cells = snapshot;
        return true;
    }

    redo(): boolean {
        const snapshot = this.redoStack.pop();
        if (snapshot === undefined) return false;
        this.undoStack.push(this.cells.slice());
        this.cells = snapshot;
        return true;
    }

    /** 清空盘面（可撤销），锁定格会被保留；本来就是空盘时什么也不做。 */
    reset(): void {
        const dirty = this.cells.some(state => state !== CellState.Unknown && state !== CellState.Locked);
        if (!dirty) return;

        this.beginEdit();
        this.cells.forEach((state, index) => {
            if (state !== CellState.Locked) this.cells[index] = CellState.Unknown;
        });
    }

    // #endregion

    // #region - 写入

    /**
     * 设置单元格，返回实际发生的变更（空数组表示什么都没改）。
     * - 锁定格不可修改，直接返回空数组。
     * - 状态没变化时返回空数组，且不产生撤销记录。
     * - 开了 autoCross 时，连带打叉的格子也会一并出现在返回值里。
     */
    setCell(row: number, column: number, state: CellState): CellChange[] {
        this.assertInBounds(row, column);
        if (state === CellState.Locked) throw new Error("锁定格只能在构造时通过 GameOptions.locked 指定");

        const index = this.index(row, column);
        const previous = this.stateAt(index);
        if (previous === CellState.Locked || previous === state) return [];

        this.beginEdit();
        this.cells[index] = state;

        const changes: CellChange[] = [{ row, column, previous, state }];
        if (this._autoCross) changes.push(...this.autoCrossLinesInternal());
        return changes;
    }

    markFilled(row: number, column: number): CellChange[] {
        return this.setCell(row, column, CellState.Filled);
    }

    markBlank(row: number, column: number): CellChange[] {
        return this.setCell(row, column, CellState.Blank);
    }

    markUnknown(row: number, column: number): CellChange[] {
        return this.setCell(row, column, CellState.Unknown);
    }

    /** 批量写入（整体算一次撤销），返回实际发生变化的格子。锁定格会被跳过。 */
    applyChanges(changes: readonly CellChange[]): CellChange[] {
        const effective: CellChange[] = [];
        changes.forEach(change => {
            this.assertInBounds(change.row, change.column);
            const index = this.index(change.row, change.column);
            const previous = this.stateAt(index);
            if (previous === CellState.Locked || previous === change.state) return;
            effective.push({ row: change.row, column: change.column, previous, state: change.state });
        });
        if (effective.length === 0) return [];

        this.beginEdit();
        effective.forEach(change => {
            this.cells[this.index(change.row, change.column)] = change.state;
        });
        if (this._autoCross) effective.push(...this.autoCrossLinesInternal());
        return effective;
    }

    // #endregion

    // #region - 判定

    isRowComplete(row: number): boolean {
        return Line.isComplete(this.getRow(row), this.rowClue(row));
    }

    isColumnComplete(column: number): boolean {
        return Line.isComplete(this.getColumn(column), this.columnClue(column));
    }

    isRowContradiction(row: number): boolean {
        return Line.status(this.getRow(row), this.rowClue(row)) === "contradiction";
    }

    isColumnContradiction(column: number): boolean {
        return Line.status(this.getColumn(column), this.columnClue(column)) === "contradiction";
    }

    /** 整盘是否完成：所有行、所有列的实心段都等于线索。 */
    isSolved(): boolean {
        const rowsDone = this.rowClues.every((_, r) => this.isRowComplete(r));
        if (!rowsDone) return false;
        return this.columnClues.every((_, c) => this.isColumnComplete(c));
    }

    /** 该行还差几个实心格（负数表示涂多了）。 */
    getRowRemaining(row: number): number {
        const stats = this.getRowStats(row);
        return stats.required - stats.filled;
    }

    /** 该列还差几个实心格（负数表示涂多了）。 */
    getColumnRemaining(column: number): number {
        const stats = this.getColumnStats(column);
        return stats.required - stats.filled;
    }

    getRowStats(row: number): LineStats {
        return Line.stats(this.getRow(row), this.rowClue(row));
    }

    getColumnStats(column: number): LineStats {
        return Line.stats(this.getColumn(column), this.columnClue(column));
    }

    getProgress(): PuzzleProgress {
        let filled = 0;
        let required = 0;
        let completedLines = 0;

        this.rowClues.forEach((_, r) => {
            const stats = this.getRowStats(r);
            required += stats.required;
            filled += stats.filled;
            if (stats.complete) completedLines++;
        });
        this.columnClues.forEach((_, c) => {
            if (this.getColumnStats(c).complete) completedLines++;
        });

        return { filled, required, completedLines, totalLines: this.height + this.width };
    }

    // #endregion

    // #region - 自动打叉

    /** 给已完成的行列打叉，返回变化的格子（内部使用，撤销记录由调用方负责）。 */
    private autoCrossLinesInternal(): CellChange[] {
        const changes: CellChange[] = [];

        this.rowClues.forEach((_, r) => {
            if (!this.isRowComplete(r)) return;
            this.getRow(r).forEach((state, c) => {
                if (state !== CellState.Unknown) return;
                this.cells[this.index(r, c)] = CellState.Blank;
                changes.push({ row: r, column: c, previous: CellState.Unknown, state: CellState.Blank });
            });
        });
        this.columnClues.forEach((_, c) => {
            if (!this.isColumnComplete(c)) return;
            this.getColumn(c).forEach((state, r) => {
                if (state !== CellState.Unknown) return;
                this.cells[this.index(r, c)] = CellState.Blank;
                changes.push({ row: r, column: c, previous: CellState.Unknown, state: CellState.Blank });
            });
        });

        return changes;
    }

    /** 给所有已完成的行列自动打叉，返回变化的格子。 */
    autoCrossCompletedLines(): CellChange[] {
        const changes: CellChange[] = [];
        const pushBlank = (row: number, column: number): void => {
            if (this.getCell(row, column) !== CellState.Unknown) return;
            changes.push({ row, column, previous: CellState.Unknown, state: CellState.Blank });
        };

        this.rowClues.forEach((_, r) => {
            if (!this.isRowComplete(r)) return;
            this.getRow(r).forEach((_, c) => pushBlank(r, c));
        });
        this.columnClues.forEach((_, c) => {
            if (!this.isColumnComplete(c)) return;
            this.getColumn(c).forEach((_, r) => pushBlank(r, c));
        });

        return this.applyChanges(changes);
    }

    // #endregion

    // #region - 推导与提示

    /** 计算当前所有可推导的格子（不修改盘面）。 */
    deduceOnce(): CellChange[] {
        const result: CellChange[] = [];
        const marked = new Uint8Array(this.cells.length);

        const push = (row: number, column: number, state: CellState): void => {
            const index = this.index(row, column);
            if (flagAt(marked, index)) return;
            marked[index] = 1;

            const previous = this.stateAt(index);
            if (previous === state) return;
            result.push({ row, column, previous, state });
        };

        this.rowClues.forEach((_, r) => {
            const analysis = Line.analyze(this.getRow(r), this.rowClue(r));
            if (analysis.contradiction) return;
            analysis.forcedFilled.forEach(column => push(r, column, CellState.Filled));
            analysis.forcedBlank.forEach(column => push(r, column, CellState.Blank));
        });
        this.columnClues.forEach((_, c) => {
            const analysis = Line.analyze(this.getColumn(c), this.columnClue(c));
            if (analysis.contradiction) return;
            analysis.forcedFilled.forEach(row => push(row, c, CellState.Filled));
            analysis.forcedBlank.forEach(row => push(row, c, CellState.Blank));
        });
        return result;
    }

    /**
     * 反复推导并写入盘面，直到没有任何新结论（整体算一次撤销）。
     * maxSteps 只是保险，正常 30×30 以内几轮就稳定。
     */
    applyDeduction(maxSteps?: number): CellChange[] {
        let round = this.deduceOnce();
        if (round.length === 0) return [];

        const limit = maxSteps ?? 400;
        const applied: CellChange[] = [];

        this.beginEdit();
        let steps = 0;
        while (round.length > 0 && steps < limit) {
            round.forEach(change => {
                this.cells[this.index(change.row, change.column)] = change.state;
                applied.push(change);
            });
            steps++;
            round = this.deduceOnce();
        }
        if (this._autoCross) applied.push(...this.autoCrossLinesInternal());
        return applied;
    }

    /**
     * 取一个提示并直接写入盘面（算作一次撤销）。
     * 优先用逻辑推导；推导不出来且有答案时，按答案揭示一格。
     */
    takeHint(): CellChange | undefined {
        const round = this.deduceOnce();
        if (round.length > 0) {
            // 优先提示"该涂"的格子，观感上更明显
            const picked = round.find(change => change.state === CellState.Filled) ?? round[0];
            if (picked === undefined) return undefined;

            this.applyChanges([picked]);
            return picked;
        }

        const solution = this.solution;
        if (solution === undefined) return undefined;

        const targetOf = (index: number): CellState => (solution[index] === true ? CellState.Filled : CellState.Blank);
        const index = this.cells.findIndex((state, i) => state !== CellState.Locked && state !== targetOf(i));
        if (index < 0) return undefined;

        const row = Math.floor(index / this.width);
        const change: CellChange = {
            row,
            column: index - row * this.width,
            previous: this.stateAt(index),
            state: targetOf(index),
        };
        this.applyChanges([change]);
        return change;
    }

    /** 与答案不符的格子（需要提供 solution）。 */
    findMistakes(): CellPos[] {
        const solution = this.solution;
        const result: CellPos[] = [];
        if (solution === undefined) return result;

        this.cells.forEach((state, i) => {
            if (state === CellState.Unknown || state === CellState.Locked) return;
            if ((state === CellState.Filled) === (solution[i] === true)) return;

            const row = Math.floor(i / this.width);
            result.push({ row, column: i - row * this.width });
        });
        return result;
    }

    /** 按答案铺满（调试用，算作一次撤销）。 */
    fillFromSolution(): CellChange[] {
        const solution = this.solution;
        if (solution === undefined) return [];

        const changes: CellChange[] = this.cells.map((state, i) => {
            const row = Math.floor(i / this.width);
            return {
                row,
                column: i - row * this.width,
                previous: state,
                state: solution[i] === true ? CellState.Filled : CellState.Blank,
            };
        });
        return this.applyChanges(changes);
    }

    // #endregion

    // #region - 序列化

    toJSON(): PuzzleSnapshot {
        const rowClues = this.rowClues.map(clue => [...clue]);
        const columnClues = this.columnClues.map(clue => [...clue]);

        const snapshot: PuzzleSnapshot = {
            rowClues,
            columnClues,
            cells: this.cells.slice(),
        };
        if (this.name !== "") snapshot.name = this.name;
        return snapshot;
    }

    clone(): PicrossGame {
        return PicrossGame.fromJSON(this.toJSON(), {
            historyLimit: this._historyLimit,
            autoCross: this._autoCross,
            solution: this.solutionGrid(),
        });
    }

    /** 答案还原成二维布尔网格（未提供答案则 undefined）。 */
    solutionGrid(): boolean[][] | undefined {
        const solution = this.solution;
        if (solution === undefined) return undefined;

        return Array.from({ length: this.height }, (_, r) =>
            Array.from({ length: this.width }, (_, c) => solution[this.index(r, c)] === true),
        );
    }

    /** 文本渲染，调试用：'?' 未知、'#' 已涂、'.' 空格、'x' 锁定空。 */
    toDisplayString(): string {
        return Array.from({ length: this.height }, (_, r) =>
            Array.from({ length: this.width }, (_, c) => {
                const state = this.getCell(r, c);
                if (state === CellState.Filled) return "#";
                if (state === CellState.Blank) return ".";
                if (state === CellState.Locked) return "x";
                return "?";
            }).join(""),
        ).join("\n");
    }

    // #endregion
}

// #endregion
