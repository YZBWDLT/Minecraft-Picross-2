// *-*-*-*-*-*-* 常加载区域 *-*-*-*-*-*-*
// 常加载区域的增删查。
import * as minecraft from "@minecraft/server";
import { DimensionUtils } from "./dimension";
export class TickingAreaUtils {
    /** 添加特定 ID 的常加载区域。
     * @returns 若常加载区域已添加，则返回`undefined`。
     */
    static add(id, from, to, dimension) {
        try {
            return minecraft.world.tickingAreaManager.createTickingArea(id, {
                from,
                to,
                dimension: DimensionUtils.getDefault(dimension),
            });
        }
        catch {
            return;
        }
    }
    /** 获取特定 ID 的常加载区域。 */
    static get(id) {
        return minecraft.world.tickingAreaManager.getTickingArea(id);
    }
    /** 移除特定 ID 的常加载区域。
     * @returns 返回是否成功移除常加载区域。
     */
    static remove(id) {
        try {
            minecraft.world.tickingAreaManager.removeTickingArea(id);
            return true;
        }
        catch {
            return false;
        }
    }
    /** 移除全部常加载区域。
     * @returns 返回是否成功移除常加载区域。
     */
    static removeAll() {
        try {
            minecraft.world.tickingAreaManager.removeAllTickingAreas();
            return true;
        }
        catch {
            return false;
        }
    }
}
