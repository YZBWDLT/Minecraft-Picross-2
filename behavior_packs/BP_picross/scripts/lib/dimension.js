// *-*-*-*-*-*-* 维度 *-*-*-*-*-*-*
// 维度查询与体积切分。
import * as minecraft from "@minecraft/server";
/** 维度操作工具。 */
export class DimensionUtils {
    /** 获取维度信息。
     * @returns 若指定的维度不存在，返回 undefined。
     */
    static get(dimension) {
        if (typeof dimension === "string") {
            try {
                return minecraft.world.getDimension(dimension);
            }
            catch {
                return void 0;
            }
        }
        else
            return dimension;
    }
    /** 获取存在默认值的维度信息。
     * @param dimension 若未给定维度信息，或给定的维度 ID 无效，则返回主世界的维度。
     */
    static getDefault(dimension) {
        const overworld = this.get("overworld");
        if (!dimension)
            return overworld;
        return this.get(dimension) ?? overworld;
    }
    /** 获取主世界。 */
    static getOverworld() {
        return minecraft.world.getDimension("overworld");
    }
    /** 将一个大区域分割成多个小的子区域。
     * @param maxCapacity 每个子区域允许的最大体积。 | 默认值：32768。
     */
    static divideVolume(volume, maxCapacity = 32768) {
        // 如果区域容量小于最大容量，直接返回该区域
        const volumeCapacity = volume.getCapacity();
        if (volumeCapacity <= maxCapacity)
            return [volume];
        // 【整体思路】
        // 1. 先对 *最长轴* 按 *非最长轴的截面积* 均分，得到最长轴上的 *子区域高度*。这个高度至少为 1。
        // 2. 通过最长轴高度和子区域高度得到应拆分的 *子区域数量*。
        // 3. 对第 n 个子区域，在非最长轴上的坐标直接使用最小值和最大值，
        //    而在最长轴上的坐标分别使用 (min+子区域高度*(n-1))~(min+子区域高度*(n-1)+(子区域高度-1))，
        //    即 (min+子区域高度*(n-1))~(min+子区域高度*n-1)。
        //    考虑到通常是使用索引，对索引为 i 的子区域的坐标分别使用(min+子区域高度*i)~(min+子区域高度*(i+1)-1)
        //    特别地，考虑到最后一个子区域的高度可能不足，坐标应使用 (min+子区域高度*(n-1))~max。
        // 4. 如果每个子区域的容量仍然大于最大容量（这可能是由于截面积过大引起的），则应做递归处理。
        // --- 获取基础信息 ---
        const { x: minX, y: minY, z: minZ } = volume.getMin();
        const { x: maxX, y: maxY, z: maxZ } = volume.getMax();
        const { x: lengthX, y: lengthY, z: lengthZ } = volume.getSpan();
        const axisInfo = {
            x: { length: lengthX, min: minX, max: maxX },
            y: { length: lengthY, min: minY, max: maxY },
            z: { length: lengthZ, min: minZ, max: maxZ },
        };
        /** 最长轴 */
        const longestAxis = Object.keys(axisInfo).sort((axis1, axis2) => axisInfo[axis2].length - axisInfo[axis1].length)[0];
        const longestAxisInfo = axisInfo[longestAxis];
        /** 非最长轴的截面积 */
        const subVolumeArea = {
            x: lengthY * lengthZ,
            y: lengthZ * lengthX,
            z: lengthX * lengthY,
        }[longestAxis];
        /** 子区域高度 */
        const subVolumeHeight = Math.max(Math.floor(maxCapacity / subVolumeArea), 1);
        /** 子区域数量 */
        const subVolumeAmount = Math.ceil(longestAxisInfo.length / subVolumeHeight);
        // --- 拆分区域（参见【整体思路】第 3 步） ---
        /** 所有子区域 */
        const subVolumes = [];
        for (let i = 0; i < subVolumeAmount; i++) {
            const thisVolumeLongestAxisMin = longestAxisInfo.min + subVolumeHeight * i;
            const thisVolumeLongestAxisMax = Math.min(longestAxisInfo.min + subVolumeHeight * (i + 1) - 1, longestAxisInfo.max);
            const thisVolumeFrom = { ...volume.from };
            thisVolumeFrom[longestAxis] = thisVolumeLongestAxisMin;
            const thisVolumeTo = { ...volume.to };
            thisVolumeTo[longestAxis] = thisVolumeLongestAxisMax;
            const thisVolume = new minecraft.BlockVolume(thisVolumeFrom, thisVolumeTo);
            subVolumes.push(...this.divideVolume(thisVolume, maxCapacity));
        }
        return subVolumes;
    }
    /** 镂空一个大区域。 */
    static hollowVolume(volume) {
        const { x: minX, y: minY, z: minZ } = volume.getMin();
        const { x: maxX, y: maxY, z: maxZ } = volume.getMax();
        const hollowedVolume = new minecraft.BlockVolume({ x: minX + 1, y: minY + 1, z: minZ + 1 }, { x: maxX - 1, y: maxY - 1, z: maxZ - 1 });
        const borderVolume = [
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: minX, y: maxY, z: maxZ }),
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: maxX, y: minY, z: maxZ }),
            new minecraft.BlockVolume({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: maxX, y: minY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: minX, y: maxY, z: minZ }),
            new minecraft.BlockVolume({ x: maxX, y: maxY, z: maxZ }, { x: minX, y: minY, z: maxZ }),
        ];
        return {
            /** 边界区域，由该区域的六面组成。 */
            borderVolume,
            /** 被镂空的区域。 */
            hollowedVolume,
        };
    }
    /** 获取一个区域内的所有位置。 */
    static getLocationsFromVolume(volume) {
        const iterator = volume.getBlockLocationIterator();
        const locations = [];
        while (true) {
            const { value: location, done } = iterator.next();
            if (done)
                break;
            if (!location)
                continue;
            locations.push(location);
        }
        return locations;
    }
}
