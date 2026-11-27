// *-*-*-*-*-*-* JS 基本工具 *-*-*-*-*-*-*
// 数字、数组、时间等与游戏无关的通用工具。

import * as minecraft from "@minecraft/server";

/** 时间信息。 */
export interface TimeInfo {
    minute?: number;
    second: number;
    tick?: number;
}

/** 数值工具。 */
class NumberUtils {
    /** 在[a, b]取随机整数。 */
    static randomInt(min: number, max: number) {
        // 确保 min <= max
        if (min > max) {
            [min, max] = [max, min];
        }
        return Math.floor(Math.random() * (max - min + 1)) + min; // 生成 [min, max] 之间的随机整数
    }

    /** 在[a, b]取随机数。 */
    static random(min: number, max: number): number {
        return Math.random() * (max - min) + min;
    }

    /** 将数值限制到[a, b]内。 */
    static clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(value, max));
    }

    /** 计算数字数组的和。 */
    static sum(values: number[]) {
        return Array.isArray(values) ? values.reduce((acc, curr) => acc + curr, 0) : 0;
    }

    /** 限定一个浮点数的位数。 */
    static limitDecimal(num: number, digits: number) {
        if (digits < 0 || digits > 20) {
            throw new RangeError("只能保留 0 - 20 位有效数字。");
        }
        return parseFloat(num.toFixed(digits));
    }
}

/** 数组工具。 */
class ArrayUtils {
    /** 打乱一个数组。
     * @remarks 这个方法不会修改原数组。使用 Fisher-Yates 洗牌，保证每种排列概率相等。
     */
    static shuffle<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = NumberUtils.randomInt(0, i);
            const temp = result[i] as T;
            result[i] = result[j] as T;
            result[j] = temp;
        }
        return result;
    }

    /** 删除数组的特定元素。
     * @remarks 这个方法将会修改原数组。
     */
    static removeElement<T>(array: T[], element: T) {
        // 使用循环和splice方法删除所有匹配的元素
        for (let i = array.length - 1; i >= 0; i--) {
            if (array[i] === element) {
                array.splice(i, 1);
            }
        }
    }

    /** 判断两数组的元素是否严格相同（对应索引的元素也必须相同）。 */
    static isSameRestrict<T>(array1: T[], array2: T[]) {
        if (array1.length !== array2.length) return false;
        return array1.every((element, index) => element === array2[index]);
    }

    /** 判断两数组的元素是否相同（只要求两数组拥有相同的元素）。 */
    static isSame<T>(array1: T[], array2: T[]) {
        if (array1.length !== array2.length) return false;
        const set2 = new Set(array2);
        return array1.every(element => set2.has(element));
    }

    /** 获取一个数组中的随机元素。
     * @remarks 这个方法在数组为空时会返回`undefined`。
     */
    static random<T>(array: T[]) {
        return array[NumberUtils.randomInt(0, array.length - 1)] as T;
    }

    /** 按权重随机选取一个元素。
     *
     * 代码由 Deepseek 生成 =P
     * @param items 包含权重属性的数组
     * @returns 被选中的元素，数组为空时返回`undefined`
     */
    static randomWeighted<T extends { weight: number }>(items: T[]): T | undefined {
        if (items.length === 0) return undefined;

        // 1. 计算总权重
        const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);

        // 2. 生成 0 ~ totalWeight 之间的随机数
        let random = Math.random() * totalWeight;

        // 3. 遍历，累减权重，首次 <=0 时命中
        for (const item of items) {
            random -= item.weight;
            if (random <= 0) {
                return item;
            }
        }

        // 4. 兜底（处理浮点精度极边缘情况）
        return items[items.length - 1];
    }

    /** 按权重随机选取一个元素。
     *
     * 代码由 Deepseek 生成 =P
     * @param items 包含权重属性的数组
     * @returns 被选中的元素的索引，数组为空时返回`-1`
     */
    static randomWeightedIndex<T extends { weight: number }>(items: T[]): number {
        if (items.length === 0) return -1;

        const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as T;
            random -= item.weight;
            if (random <= 0) {
                return i;
            }
        }

        // 兜底（极少出现浮点误差）
        return items.length - 1;
    }

    /** 按权重随机选取一个元素。
     *
     * 代码由 Deepseek 生成 =P
     * @param items 包含权重属性的数组
     * @returns 数组为空时返回`0`
     */
    static getTotalWeight<T extends { weight: number }>(items: T[]): number {
        if (items.length === 0) return 0;
        return items.reduce((sum, item) => sum + item.weight, 0);
    }
}

/** 时间显示工具。 */
class TimeDisplayUtils {
    /** 根据游戏刻显示多少秒，保留两位数字，不显示单位。例：230 → 11.50。 */
    static showSecondsByTick(tick: number): string {
        const seconds = tick / 20;
        return seconds.toFixed(2);
    }

    /** 根据游戏刻显示多少分钟多少秒。例：1230 → 1:01.50。 */
    static showMinuteAndSecondsByTick(tick: number): string {
        const totalSeconds = tick / 20;
        const sign = totalSeconds < 0 ? "-" : "";
        const absSeconds = Math.abs(totalSeconds);

        const minutes = Math.floor(absSeconds / 60);
        const seconds = absSeconds % 60;

        // 格式化秒部分：两位整数 + 两位小数
        const [intPart, fracPart] = seconds.toFixed(2).split(".") as [string, string];
        const formattedSeconds = `${intPart.padStart(2, "0")}.${fracPart}`;

        return `${sign}${minutes}:${formattedSeconds}`;
    }

    /** 根据秒数显示多少分钟多少秒。例：61.5 → 1:01。 */
    static showMinuteAndSecondsBySecond(second: number): string {
        const sign = second < 0 ? "-" : "";
        const absSecond = Math.abs(second);
        const minutes = Math.floor(absSecond / 60);
        const seconds = Math.floor(absSecond % 60);
        const formattedSeconds = seconds.toString().padStart(2, "0");
        return `${sign}${minutes}:${formattedSeconds}`;
    }

    /** 返回 YY/MM/DD 形式的日期字符串。例：26/06/28。 */
    static formatDateToYYMMDD(date?: Date): string {
        const d = date ? new Date(date) : new Date(); // 确保传入的值也能转为有效Date
        const year = d.getFullYear().toString().slice(-2); // 取年份后两位
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        return `${year}/${month}/${day}`;
    }
}

/** JavaScript 通用工具。 */
export class JSUtils {
    /** 数值相关方法。 */
    static number = NumberUtils;

    /** 数组相关方法。 */
    static array = ArrayUtils;

    /** 时间显示相关方法。 */
    static timeDisplay = TimeDisplayUtils;

    // ===== 其他方法 =====
    /** 显示换行消息，为数组内每个元素中间添加 "§r\n"，以弥补 Minecraft 原生方法不能换行显示消息的不足 */
    static lineText(message: (minecraft.RawMessage | string)[]) {
        return message
            .slice(0, -1)
            .flatMap(msg => [msg, "§r\n"])
            .concat(message.slice(-1));
    }

    /** 将数字转换为罗马数字的字符串 */
    static intToRoman(num: number) {
        if (num <= 0) {
            return "";
        }
        const romanNumerals = [
            // { value: 1000, symbol: 'M' },
            // { value: 900, symbol: 'CM' },
            // { value: 500, symbol: 'D' },
            // { value: 400, symbol: 'CD' },
            // { value: 100, symbol: 'C' },
            // { value: 90, symbol: 'XC' },
            // { value: 50, symbol: 'L' },
            // { value: 40, symbol: 'XL' },
            { value: 10, symbol: "X" },
            { value: 9, symbol: "IX" },
            { value: 5, symbol: "V" },
            { value: 4, symbol: "IV" },
            { value: 1, symbol: "I" },
        ];
        let result = "";
        for (const { value, symbol } of romanNumerals) {
            while (num >= value) {
                result += symbol;
                num -= value;
            }
        }
        return result;
    }

    /** 在输入的对象中，输出值所对应的键
     * @remark 如果对象所有的值中有重复的，那么会返回第一个对应的键
     */
    static getKeyByValue(obj: object, value: any) {
        for (const [key, val] of Object.entries(obj)) {
            if (val === value) {
                return key;
            }
        }
    }

    /** 判断传入的对象是否为空对象。 */
    static isEmptyObject(obj: object) {
        return Object.keys(obj).length === 0 && obj.constructor === Object;
    }

    /** 判断传入的对象是否为纯对象，而非数组、`null`等形式。 */
    static isPlainObject(value: any): value is object {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }
}
