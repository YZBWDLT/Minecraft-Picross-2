// *-*-*-*-*-*-* 结构 *-*-*-*-*-*-*
// 结构的放置、创建、查询与删除。
import * as minecraft from "@minecraft/server";
import { DimensionUtils } from "./dimension";
/** 结构操作工具。 */
export class StructureUtils {
    /** 放置结构（支持异步）。 */
    static placeAsync(structure, location, options, dimension) {
        minecraft.world.structureManager.place(structure, DimensionUtils.getDefault(dimension), location, options);
        let animationSeconds = options?.animationSeconds ? options.animationSeconds : 0;
        return minecraft.system.waitTicks(animationSeconds * 20);
    }
    /** 创建特定 ID 的结构。 */
    static add(structureId, dimension, from, to, options) {
        return minecraft.world.structureManager.createFromWorld(structureId, DimensionUtils.getDefault(dimension), from, to, options);
    }
    /** 获取特定 ID 的结构。
     * @param structureId 结构 ID，需包含命名空间。
     */
    static get(structureId) {
        return minecraft.world.structureManager.get(structureId);
    }
    /** 获取所有结构 ID。 */
    static getAll() {
        return minecraft.world.structureManager.getWorldStructureIds();
    }
    /** 移除特定 ID 的结构。
     * @param structureId 结构 ID，包含命名空间
     */
    static remove(structureId) {
        let executed = true;
        try {
            minecraft.world.structureManager.delete(structureId);
        }
        catch {
            executed = false;
        }
        return executed;
    }
    /** 移除所有结构。 */
    static removeAll() {
        this.getAll().forEach(id => this.remove(id));
    }
}
