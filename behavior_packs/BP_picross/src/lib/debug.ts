// *-*-*-*-*-*-* 调试 *-*-*-*-*-*-*
// 调试信息的输出。

import * as minecraft from "@minecraft/server";

export class Debug {
    /** 发送一个调试性消息 */
    static sendMessage(message: any, messageType: "actionBar" | "chat" = "chat") {
        if (messageType === "chat") minecraft.world.sendMessage(`${message}`);
        else minecraft.world.getPlayers().forEach(player => player.onScreenDisplay.setActionBar(`${message}`));
    }

    /** 打印数组 */
    static printArray(array: any[], arrayName: string) {
        minecraft.world.sendMessage(`§a${arrayName} = §r§f[§b${array.join(", ")}§r§f]`);
    }

    /** 获取对象数据。 */
    static getObjectData(object: Record<string, any> | undefined, hasFunction = true): string {
        /** 待打印的字符串数组 */ let printString: string[] = [];
        // 设置打印的字符串
        if (object == undefined) {
            printString = [`<§6undefined§f>`];
        } else {
            printString.push(`<§6Object ${object.constructor.name}`);
            // 遍历对象中的每个对象
            for (let key in object) {
                let value = object[key];
                let valueName = `§b${value}`; // 如果是普通类型，蓝色，原样显示
                if (value instanceof Function) {
                    // 如果是函数类型，黄色，显示为() => {}
                    if (!hasFunction) continue;
                    valueName = `§e() => {}`;
                } else if (value instanceof Object) {
                    // 如果是对象类型，显示为构建器类型
                    valueName = `§6<Object ${value.constructor.name}>`;
                }
                printString.push(`    §a${key} : ${valueName}`);
            }
            printString.push(`§r>`);
        }
        return printString.join("\n");
    }
}
