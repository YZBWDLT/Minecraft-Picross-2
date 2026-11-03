import type * as picross from "./picross";

export const levels: Record<number, picross.PuzzleDefinition> = {
    10000: {
        columnClues: [[2], [2, 1], [1], [2, 1], [2]],
        rowClues: [[1, 1], [1, 1], [0], [1, 1], [5]],
    },
    10001: {
        columnClues: [[1], [1, 1], [1, 3], [3, 1], [2]],
        rowClues: [[5], [2], [2], [2], [2]],
    },
    10002: {
        columnClues: [[7], [1, 1, 1], [1, 1, 1], [1, 5], [1], [1], [1, 5], [1, 1, 1], [1, 1, 1], [7]],
        rowClues: [[0], [2, 2], [1, 1, 1, 1], [1, 1], [1, 1], [4, 4], [1, 1, 1, 1], [1, 4, 1], [1, 1, 1, 1], [3, 3]],
    },
    10003: {
        columnClues: [[1], [2]],
        rowClues: [[1], [2]],
    },
    10004: {
        columnClues: [[1], [1], [1]],
        rowClues: [[1], [1], [1]],
    },
    // 10005: {
    //     columnClues: [[1], [1], [1]],
    //     rowClues: [[1], [1], [1]],
    // },
};
