// *-*-*-*-*-*-* 文本展示 *-*-*-*-*-*-*
// 文本展示实体的管理。

import * as minecraft from "@minecraft/server";

import { Vector3Utils } from "./vector";

export class TextDisplayUtils {
    /** 添加一个悬浮文本。 */
    static add(text: minecraft.RawMessage | string, location: minecraft.Vector3) {
        const textDisplay = new minecraft.TextPrimitive(Vector3Utils.add(location, 0.5, 0, 0.5), text);
        minecraft.world.primitiveShapesManager.addText(textDisplay);
        return textDisplay;
    }

    /** 移除一个悬浮文本。 */
    static remove(textDisplay: minecraft.TextPrimitive) {
        minecraft.world.primitiveShapesManager.removeText(textDisplay);
    }

    /** 移除全部悬浮文本。 */
    static removeAll() {
        minecraft.world.primitiveShapesManager.removeAll();
    }
}
