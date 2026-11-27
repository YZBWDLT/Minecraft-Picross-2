// *-*-*-*-*-*-* 实体与玩家 *-*-*-*-*-*-*
// 实体查询、玩家锁定与消息通知。

import * as minecraft from "@minecraft/server";

import { DimensionUtils } from "./dimension";

/** 对一个特定玩家发送一个信息。 */
export interface NotifyOptions {
    /** 显示在聊天栏中的信息。 */
    readonly message?: string | minecraft.RawMessage | (string | minecraft.RawMessage)[];

    /** 播放的音效。 */
    readonly sound?: string;

    /** 播放音效的可选项。
     * @remarks 必须通过 sound 指定一个音频。
     */
    readonly soundOptions?: minecraft.PlayerSoundOptions;

    /** 延迟播放音效的时间。单位：游戏刻。
     * @remarks 必须通过 sound 指定一个音频。
     */
    readonly soundDelay?: number;

    /** 播放的标题。 */
    readonly title?: string | minecraft.RawMessage | (string | minecraft.RawMessage)[];

    /** 播放的副标题。
     * @remarks 必须通过 title 指定一个标题。
     */
    readonly subtitle?: string | minecraft.RawMessage;

    /** 播放标题的可选项
     * @remarks 必须通过 title 指定一个标题。
     * @remarks 要指定副标题时请直接在 subtitle 属性中指定。
     */
    readonly titleOptions?: minecraft.TitleDisplayOptions;
}

/** 对全部玩家公告一个信息。 */
export interface BroadcastOptions extends NotifyOptions {
    /** 对何位置附近的玩家播放。 */
    readonly location?: minecraft.Vector3;

    /** 指定`location`后的距离。 | 默认值：`16` */
    readonly distance?: number;
}

/** 实体操作工具。
 * @remarks 在该工具中的多数方法都接收一个可选的 dimension。在未额外声明的前提下，若不指定则默认使用主世界。
 */
export class EntityUtils {
    /** 生成实体。 */
    static add(
        typeId: string,
        location: minecraft.Vector3,
        dimension?: string | minecraft.Dimension,
        options?: minecraft.SpawnEntityOptions,
    ) {
        return DimensionUtils.getDefault(dimension).spawnEntity(typeId, location, options);
    }

    /** 获取实体。 */
    static get(dimension?: string | minecraft.Dimension, options?: minecraft.EntityQueryOptions) {
        return DimensionUtils.getDefault(dimension).getEntities(options);
    }

    /** 获取特定类型的实体。 */
    static getType(typeId: string, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getEntities({ type: typeId });
    }

    /** 获取附近的实体 */
    static getNearby(typeId: string, location: minecraft.Vector3, distance: number, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getEntities({
            type: typeId,
            location: location,
            maxDistance: distance,
        });
    }

    /** 检查实体是否在特定位置周围。
     * @param dimension 如果不指定，则默认在实体所在的维度执行。
     */
    static isNearby(
        entity: minecraft.Entity,
        location: minecraft.Vector3,
        distance: number,
        dimension?: string | minecraft.Dimension,
    ) {
        const executeDimension = dimension ? DimensionUtils.getDefault(dimension) : entity.dimension;
        return executeDimension
            .getEntities({ location: location, maxDistance: distance })
            .some(nearbyEntity => nearbyEntity.id === entity.id);
    }

    /** 检查实体是否在特定长方体区域内。
     * @param dimension 如果不指定，则默认在实体所在的维度执行。
     */
    static isInVolume(entity: minecraft.Entity, volume: minecraft.BlockVolume, dimension?: string | minecraft.Dimension) {
        // 直接比坐标，比"查实体再比对 id"快得多，也不依赖区块加载
        if (dimension && DimensionUtils.getDefault(dimension).id !== entity.dimension.id) return false;
        const { x, y, z } = entity.location;
        const min = volume.getMin();
        const max = volume.getMax();
        // max 是闭区间的方块坐标，所以上界要放到 max + 1
        return x >= min.x && x < max.x + 1 && y >= min.y && y < max.y + 1 && z >= min.z && z < max.z + 1;
    }

    /** 移除其他除玩家之外的实体
     * @param options 要移除的实体满足的条件，若不填写则选定全部玩家之外的实体
     */
    static removeAll(options?: minecraft.EntityQueryOptions, dimension?: string | minecraft.Dimension) {
        DimensionUtils.getDefault(dimension)
            .getEntities(options)
            .filter(entity => entity.typeId != "minecraft:player")
            .forEach(entity => entity.remove());
    }
}

/** 玩家操作工具。 */
export class PlayerUtils {
    /** 判断实体是否为有效玩家。 */
    static isPlayer(entity: minecraft.Entity): entity is minecraft.Player {
        if (!entity.isValid) return false;
        return entity.typeId === "minecraft:player";
    }

    /** 获取全部玩家。 */
    static getAll(options?: minecraft.EntityQueryOptions) {
        return minecraft.world.getPlayers(options);
    }

    /** 获取玩家数目。 */
    static getAmount() {
        return this.getAll().length;
    }

    /** 获取离特定位置较接近的玩家。 */
    static getNearby(location: minecraft.Vector3, distance: number, dimension?: string | minecraft.Dimension) {
        return DimensionUtils.getDefault(dimension).getPlayers({ location: location, maxDistance: distance });
    }

    /** 对全体玩家广播消息。 */
    static broadcast(options: BroadcastOptions) {
        if (options.location) {
            const { location, distance = 16 } = options;
            const nearbyPlayers = this.getNearby(location, distance);
            nearbyPlayers.forEach(player => this.notify(player, options));
        } else {
            this.getAll().forEach(player => this.notify(player, options));
        }
    }

    /** 对特定玩家发送通知。 */
    static notify(player: minecraft.Player, options: NotifyOptions) {
        const {
            message,
            title,
            subtitle,
            titleOptions = { fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 20 },
            sound,
            soundOptions,
            soundDelay,
        } = options;
        if (message) player.sendMessage(message);
        if (title) player.onScreenDisplay.setTitle(title, { ...titleOptions, subtitle });
        if (sound) {
            if (soundDelay) minecraft.system.runTimeout(() => player.playSound(sound, soundOptions), soundDelay);
            else player.playSound(sound, soundOptions);
        }
    }

    /** 锁定玩家，隐藏 HUD 并禁用玩家的移动。 */
    static lockPlayers(players?: minecraft.Player[]) {
        players = players ?? this.getAll();
        players.forEach(player => {
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Camera, false);
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Movement, false);
            player.onScreenDisplay.setHudVisibility(minecraft.HudVisibility.Hide);
        });
    }

    /** 解除锁定玩家，恢复 HUD 和相机并启用玩家的移动。 */
    static unlockPlayers(players?: minecraft.Player[]) {
        players = players ?? this.getAll();
        players.forEach(player => {
            player.camera.clear();
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Camera, true);
            player.inputPermissions.setPermissionCategory(minecraft.InputPermissionCategory.Movement, true);
            player.onScreenDisplay.setHudVisibility(minecraft.HudVisibility.Reset);
        });
    }
}
