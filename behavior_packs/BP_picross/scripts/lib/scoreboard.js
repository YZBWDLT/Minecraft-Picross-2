// *-*-*-*-*-*-* 记分板 *-*-*-*-*-*-*
// 记分板板、目标与记分板项的读写。
import * as minecraft from "@minecraft/server";
/** 记分板的记分项操作工具。 */
class ScoreboardObjectiveUtils {
    /** 添加特定 ID 的记分项。 */
    static add(id, displayName) {
        return this.get(id) ?? minecraft.world.scoreboard.addObjective(id, displayName);
    }
    /** 获取特定 ID 的记分项。 */
    static get(id) {
        return minecraft.world.scoreboard.getObjective(id);
    }
    /** 获取所有记分项。 */
    static getAll() {
        return minecraft.world.scoreboard.getObjectives();
    }
    /** 移除特定 ID 的记分项。
     * @returns 返回是否成功执行。
     */
    static remove(id) {
        try {
            minecraft.world.scoreboard.removeObjective(id);
            return true;
        }
        catch {
            return false;
        }
    }
    /** 移除所有记分项。 */
    static removeAll() {
        this.getAll().forEach(obj => this.remove(obj));
    }
    /** 在特定位置显示特定 ID 的记分项。
     * @returns 返回上一个在该位置显示的记分项数据。
     */
    static display(displaySlot, id, order = minecraft.ObjectiveSortOrder.Descending) {
        const objective = this.get(id);
        /** 上一个记分项 */
        let lastObjective = minecraft.world.scoreboard.getObjectiveAtDisplaySlot(displaySlot)?.objective;
        // 当待显示的记分项为无效记分项时，直接返回上一个记分项的信息
        if (!objective)
            return lastObjective;
        // 尝试显示新记分项，如果报错则返回上一个记分项
        return minecraft.world.scoreboard.setObjectiveAtDisplaySlot(displaySlot, {
            objective: objective,
            sortOrder: order,
        });
    }
    /** 添加特定 ID 的记分项，并在特定位置显示该记分项。
     * @returns 返回该记分项和上一个在该位置显示的记分项数据。
     */
    static addThenDisplay(id, displaySlot, displayName, order = minecraft.ObjectiveSortOrder.Descending) {
        let newObjective = this.add(id, displayName);
        let lastDisplayed = this.display(displaySlot, id, order);
        return { newObjective, lastDisplayed };
    }
    /** 隐藏特定显示位置的记分项。
     * @returns 返回上一个在该位置显示的记分项数据。
     */
    static hide(displaySlot) {
        return minecraft.world.scoreboard.clearObjectiveAtDisplaySlot(displaySlot);
    }
}
/** 记分板的玩家操作工具 */
class ScoreboardPlayerUtils {
    /** 为特定的追踪对象添加分数。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static add(objectiveId, participant, score) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        return objective.addScore(participant, score);
    }
    /** 为追踪对象设置分数。
     * @param score 设置为 boolean 时，false = 0 分，true = 1 分。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static set(objectiveId, participant, score) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        if (typeof score === "boolean")
            score = score ? 1 : 0;
        objective.setScore(participant, score);
        return score;
    }
    /** 获取追踪对象的分数。
     * @returns 如果指定的记分项不存在，或指定的对象未在追踪状态，则返回 undefined。
     */
    static get(objectiveId, participant) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        try {
            return objective.getScore(participant);
        }
        catch {
            return;
        }
    }
    /** 获取正在追踪特定追踪对象的所有记分项。 */
    static getObjective(participantName) {
        return ScoreboardObjectiveUtils.getAll().filter(obj => obj.getScores().some(info => info.participant.displayName === participantName));
    }
    /** 获取分数，若获取不到则设置为默认值。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getOrSetDefault(objectiveId, participant, defaultScore) {
        return this.get(objectiveId, participant) ?? this.set(objectiveId, participant, defaultScore);
    }
    /** 移除追踪对象的分数。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static remove(objectiveId, participant) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        return objective.removeParticipant(participant);
    }
    /** 获取拥有特定分数的追踪对象。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getPlayerWithScore(objectiveId, score) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        // 一次取全部分数再过滤，避免每个参与者都重新查一遍 objective
        return objective
            .getScores()
            .filter(info => info.score === score)
            .map(info => info.participant);
    }
    /** 获取已离线的玩家。
     * @returns 如果指定的记分项不存在，则返回 undefined。
     */
    static getOfflinePlayers(objectiveId) {
        const objective = ScoreboardObjectiveUtils.get(objectiveId);
        if (!objective)
            return;
        return objective.getParticipants().filter(player => {
            if (player.type !== "Player") {
                return false;
            }
            else {
                try {
                    player.getEntity();
                }
                catch {
                    return true;
                }
                return false;
            }
        });
    }
}
/** 记分板操作工具。 */
export class ScoreboardUtils {
    /** 记分板的记分项操作工具。 */
    static objective = ScoreboardObjectiveUtils;
    /** 记分板的追踪对象操作工具。 */
    static player = ScoreboardPlayerUtils;
}
