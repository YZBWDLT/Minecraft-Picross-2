// *-*-*-*-*-*-* 坐标 *-*-*-*-*-*-*
// 二维与三维坐标的运算。

import * as minecraft from "@minecraft/server";

/** 代表一个坐标与一个区域相对位置的关系。 */
type VolumeSector = {
    /** 是否超出这个区域。如果超出，代表超出的方位。 */
    direction?: minecraft.Direction;
    /** 超出区域的距离。若未超出则为 0。 */
    distance: number;
};

/** Vector2 的操作方法 */
export class Vector2Utils {
    /** 返回两个坐标是否相同。 */
    static isEqual(location1: minecraft.Vector2, location2: minecraft.Vector2) {
        return location1.x === location2.x && location1.y === location2.y;
    }
}

/** Vector3 的操作方法 */
export class Vector3Utils {
    /** 返回复制后的坐标。 */
    static copy(location: minecraft.Vector3): minecraft.Vector3 {
        return { x: location.x, y: location.y, z: location.z };
    }

    /** 将某个轴的坐标添加某个特定的值。 */
    static add(location: minecraft.Vector3, xAdder = 0, yAdder = 0, zAdder = 0): minecraft.Vector3 {
        return { x: location.x + xAdder, y: location.y + yAdder, z: location.z + zAdder };
    }

    /** 返回将输入坐标中心化的坐标。 */
    static center(location: minecraft.Vector3) {
        return this.add(location, 0.5, 0.5, 0.5);
    }

    /** 返回两个坐标是否相同。 */
    static isEqual(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        return location1.x === location2.x && location1.y === location2.y && location1.z === location2.z;
    }

    /** 检查在多个坐标下是否存在特定的坐标。 */
    static hasPosition(locationList: minecraft.Vector3[], testLocation: minecraft.Vector3) {
        return locationList.some(position => this.isEqual(testLocation, position));
    }

    /** 返回两个坐标之间的距离。
     * @param squared 是否返回模长的平方值以避免运算根号。| 默认值：`false`
     */
    static distance(location1: minecraft.Vector3, location2: minecraft.Vector3, squared = false) {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return this.magnitude({ x: x2 - x1, y: y2 - y1, z: z2 - z1 }, squared);
    }

    /** 返回向量模长。
     * @param squared 是否返回模长的平方值以避免运算根号。| 默认值：`false`
     */
    static magnitude(location: minecraft.Vector3, squared = false) {
        const lengthSquared = location.x ** 2 + location.y ** 2 + location.z ** 2;
        if (squared) return lengthSquared;
        return Math.sqrt(lengthSquared);
    }

    /** 返回归一化的向量。
     * @remarks 传入零向量时返回零向量（零向量没有方向，强行归一化会得到 `NaN`）。
     */
    static normalize(location: minecraft.Vector3): minecraft.Vector3 {
        const length = this.magnitude(location);
        if (length === 0) return { x: 0, y: 0, z: 0 };
        return { x: location.x / length, y: location.y / length, z: location.z / length };
    }

    /** 返回北方的向量。 */
    static north(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, 0, -length);
    }

    /** 返回南方的向量。 */
    static south(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, 0, length);
    }

    /** 返回西方的向量。 */
    static west(location: minecraft.Vector3, length = 1) {
        return this.add(location, -length, 0, 0);
    }

    /** 返回东方的向量。 */
    static east(location: minecraft.Vector3, length = 1) {
        return this.add(location, length, 0, 0);
    }

    /** 返回上方的向量。 */
    static up(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, length, 0);
    }

    /** 返回下方的向量。 */
    static down(location: minecraft.Vector3, length = 1) {
        return this.add(location, 0, -length, 0);
    }

    /** 返回两向量的点乘（内积）。 */
    static dotProduct(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return x1 * x2 + y1 * y2 + z1 * z2;
    }

    /** 返回两向量的叉乘（向量积）。 */
    static crossProduct(location1: minecraft.Vector3, location2: minecraft.Vector3): minecraft.Vector3 {
        const { x: x1, y: y1, z: z1 } = location1;
        const { x: x2, y: y2, z: z2 } = location2;
        return { x: y1 * z2 - y2 * z1, y: z1 * x2 - z2 * x1, z: x1 * y2 - x2 * y1 };
    }

    /** 返回两向量所成的角度（rad） */
    static angle(location1: minecraft.Vector3, location2: minecraft.Vector3) {
        const cosAlpha = this.dotProduct(location1, location2) / this.magnitude(location1) / this.magnitude(location2);
        return Math.acos(cosAlpha);
    }

    /** 返回`locationArray`中距离`location`最近的坐标。
     * @remarks 不要对`locationArray`传入一个空数组，否则会报错。
     */
    static getClosest(location: minecraft.Vector3, locationArray: minecraft.Vector3[]) {
        let closestLocation = locationArray[0] as minecraft.Vector3;
        // 全程使用平方距离，避免开根号，也避免"平方值 vs 真实值"混比较
        let closestDistanceSquared = this.distance(location, closestLocation, true);
        locationArray.forEach(thisLocation => {
            const thisDistanceSquared = this.distance(location, thisLocation, true);
            if (thisDistanceSquared < closestDistanceSquared) {
                closestDistanceSquared = thisDistanceSquared;
                closestLocation = thisLocation;
            }
        });
        return closestLocation;
    }

    /** 返回给定坐标与给定区域相对位置的关系。
     * @returns 若返回`Direction`，代表给定坐标在给定区域外侧，偏向何方。若返回`undefined`，代表给定坐标在给定区域内侧。
     */
    static getVolumeSector(location: minecraft.Vector3, volume: minecraft.BlockVolume): VolumeSector {
        const { x: xMax, y: yMax, z: zMax } = volume.getMax();
        const { x: xMin, y: yMin, z: zMin } = volume.getMin();
        // 北 ↑
        // <- O -> X
        //    ↓ Z
        if (location.x > xMax) return { direction: minecraft.Direction.East, distance: location.x - xMax };
        if (location.x < xMin) return { direction: minecraft.Direction.West, distance: xMin - location.x };
        if (location.z > zMax) return { direction: minecraft.Direction.South, distance: location.z - zMax };
        if (location.z < zMin) return { direction: minecraft.Direction.North, distance: zMin - location.z };
        if (location.y > yMax) return { direction: minecraft.Direction.Up, distance: location.y - yMax };
        if (location.y < yMin) return { direction: minecraft.Direction.Down, distance: yMin - location.y };
        return { distance: 0 };
    }

    /** 将向量等比例延长。 */
    static scale(vector: minecraft.Vector3, scale: number): minecraft.Vector3 {
        const { x, y, z } = vector;
        return { x: x * scale, y: y * scale, z: z * scale };
    }

    /** 将一个形式为`"x y z"`的字符串输出为`Vector3`格式。 */
    static parseString(location: string): minecraft.Vector3 {
        const parts = location.trim().split(" ");
        if (parts.length !== 3) throw new Error(`Invalid location format: expected "X Y Z", got "${location}"`);

        const [xStr, yStr, zStr] = parts;
        const x = Number(xStr);
        const y = Number(yStr);
        const z = Number(zStr);
        if (isNaN(x) || isNaN(y) || isNaN(z)) throw new Error(`Invalid numeric value in location string: "${location}"`);

        return { x, y, z };
    }

    /** 将一个坐标转换为字符串格式。 */
    static toString(location: minecraft.Vector3): string {
        return `${location.x} ${location.y} ${location.z}`;
    }
}
