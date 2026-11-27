// *-*-*-*-*-*-* 游戏系统 *-*-*-*-*-*-*
// 时间线、延迟与事件的订阅管理。

import * as minecraft from "@minecraft/server";

/** 游戏原生的 XXXEventSignal。 */
type GameEventSignal = { subscribe: (...args: any) => (callback: any) => void; unsubscribe: (callback: any) => void };

/** 从 EventSignal 获取对应 Event。 */
type gameEvent<S> = S extends { subscribe: (callback: (arg0: infer E) => void) => void } ? E : never; // S = EventSignal, E = Event

/** 从 EventSignal 获取对应 Options。 */
type gameEventOptions<S> = S extends { subscribe: (callback: any, options: infer O) => void } ? O : undefined; // S = EventSignal, O = EventOptions

/** 代表一个游戏系统，负责订阅或取消订阅一个事件或时间线。 */
class GameSystem {
    constructor() {}

    /** 所有时间线对应的数字 ID。 */
    private readonly gameTimeline: Record<string, number> = {};

    /** 所有延迟对应的数字 ID。 */
    private readonly gameDelay: Record<string, number> = {};

    /** 所有事件对应的 EventSignal 和 gameEventCallback 函数。 */
    private readonly gameEvent: Record<string, { gameEventSignal: GameEventSignal; gameEventCallback: (callback: any) => void }> = {};

    /** 是否显示调试信息，若显示则在注册时间线或事件时显示。 */
    showDebugMessage = false;

    // ===== 时间线管理器 =====

    /** 订阅特定 ID 的时间线。
     * @param callback 接受一个回调函数，参数`time`：该函数执行的次数，从`1`计起。若返回`false`则终止时间线的运行，
     * @returns 返回是否成功订阅时间线。
     */
    subscribeTimeline(id: string, callback: (time: number) => boolean | void, interval = 1) {
        // 检查时间线是否重叠，若存在重叠则阻止运行
        if (Object.prototype.hasOwnProperty.call(this.gameTimeline, id)) return false;
        // 订阅时间线，并记录到时间线列表中，同时追踪该时间线
        let time = 1;
        const numberId = minecraft.system.runInterval(() => {
            const shouldExist = callback(time);
            if (shouldExist === false) this.unsubscribeTimeline(id);
            time++;
        }, interval);
        this.gameTimeline[id] = numberId;
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 时间线 ${id}`);
        return true;
    }

    /** 取消订阅特定 ID 的时间线。
     * @returns 返回是否成功取消订阅时间线。
     */
    unsubscribeTimeline(id: string) {
        // 检查时间线是否存在，若不存在则终止运行
        const numberId = this.gameTimeline[id];
        if (numberId === undefined) return false;
        // 取消时间线
        minecraft.system.clearRun(numberId);
        delete this.gameTimeline[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 时间线 ${id}`);
        return true;
    }

    /** 取消多个时间线。 */
    unsubscribeTimelines(...ids: string[]) {
        return ids.map(id => this.unsubscribeTimeline(id));
    }

    /** 获取所有时间线的 ID。 */
    getAllTimelineIds() {
        return Object.keys(this.gameTimeline);
    }

    /** 取消订阅所有时间线。 */
    unsubscribeAllTimelines() {
        this.getAllTimelineIds().forEach(timelineId => this.unsubscribeTimeline(timelineId));
    }

    // ===== 延迟管理器 =====

    /** 订阅特定 ID 的延迟。
     * @remarks 在该延迟执行后将立刻清除之，不会保留。
     * @param callback 若为 false 则终止延迟的运行
     * @returns 返回是否成功订阅延迟。
     */
    subscribeDelay(id: string, callback: () => void, tickDelay = 1) {
        // 检查延迟是否重叠，若存在重叠则阻止运行
        if (Object.prototype.hasOwnProperty.call(this.gameDelay, id)) return false;
        // 订阅延迟，并记录到延迟列表中，同时追踪该延迟
        const numberId = minecraft.system.runTimeout(() => {
            callback();
            this.unsubscribeDelay(id);
        }, tickDelay);
        this.gameDelay[id] = numberId;
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 延迟 ${id}`);
        return true;
    }

    /** 取消订阅特定 ID 的延迟。
     * @returns 返回是否成功取消订阅延迟。
     */
    unsubscribeDelay(id: string) {
        // 检查延迟是否存在，若不存在则终止运行
        const numberId = this.gameDelay[id];
        if (numberId === undefined) return false;
        // 取消延迟
        minecraft.system.clearRun(numberId);
        delete this.gameDelay[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 延迟 ${id}`);
        return true;
    }

    /** 获取所有延迟的 ID。 */
    getAllDelayIds() {
        return Object.keys(this.gameDelay);
    }

    /** 取消订阅所有延迟。 */
    unsubscribeAllDelays() {
        this.getAllDelayIds().forEach(delayId => this.unsubscribeDelay(delayId));
    }

    // ===== 事件管理器 =====

    /** 订阅特定 ID 的游戏事件。
     * @param callback 若为 false 则终止事件的运行。
     * @returns 返回是否成功添加事件。
     */
    subscribeEvent<S extends GameEventSignal>(
        id: string,
        event: S,
        callback: (arg0: gameEvent<S>) => void | boolean,
        options?: gameEventOptions<S>,
    ) {
        // 检查事件是否重叠，若存在重叠则阻止运行
        if (Object.prototype.hasOwnProperty.call(this.gameEvent, id)) return false;
        // 添加事件，并记录到事件列表中，同时追踪该事件
        /** 实际在subscribe函数内执行的回调函数 */
        const subscribeCallback = (event: any) => {
            const shouldExist = callback(event);
            if (shouldExist === false) this.unsubscribeEvent(id);
        };
        /** 游戏返回的回调函数，用于unsubscribe */
        const eventCallback = options ? event.subscribe(subscribeCallback, options) : event.subscribe(subscribeCallback);
        this.gameEvent[id] = { gameEventSignal: event, gameEventCallback: eventCallback };
        if (this.showDebugMessage) minecraft.world.sendMessage(`§a+ 事件 ${id}`);

        return true;
    }

    /** 取消订阅游戏事件、
     * @returns 返回是否成功取消订阅事件。
     */
    unsubscribeEvent(id: string) {
        // 检查事件是否存在，若不存在则终止运行
        const event = this.gameEvent[id];
        if (!event) return false;
        // 取消事件
        event.gameEventSignal.unsubscribe(event.gameEventCallback);
        delete this.gameEvent[id];
        if (this.showDebugMessage) minecraft.world.sendMessage(`§c- 事件 ${id}`);
        return true;
    }

    /** 取消多个事件。 */
    unsubscribeEvents(...ids: string[]) {
        return ids.map(id => this.unsubscribeEvent(id));
    }

    /** 获取所有事件 ID。 */
    getAllEventIds() {
        return Object.keys(this.gameEvent);
    }

    /** 取消订阅所有事件。 */
    unsubscribeAllEvents() {
        this.getAllEventIds().forEach(eventId => this.unsubscribeEvent(eventId));
    }
}
export const gameSystem = new GameSystem();
