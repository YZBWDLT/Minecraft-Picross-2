// *-*-*-*-*-*-* 物品与背包 *-*-*-*-*-*-*
// 物品构造与匹配，背包、装备、末影箱、光标物品的读写。

import * as minecraft from "@minecraft/server";

import { DimensionUtils } from "./dimension";
import { PlayerUtils } from "./entity";
import { JSUtils } from "./js";

/** 附魔信息。 */
export interface EnchantmentInfo {
    /** 附魔 ID。 */
    readonly id: string;

    /** 附魔等级。 | 默认值：`1`
     * @remarks 允许输入 0，但它什么也不会做
     */
    readonly level?: number;
}

/** 物品栏物品信息。 */
export type InventoryItemData = {
    /** 物品信息。 */
    item?: minecraft.ItemStack;

    /** 物品所处的位置。 */
    slot: number;
};

/** 物品栏有效物品信息。 */
export type InventoryValidItemData = {
    /** 物品信息。 */
    item: minecraft.ItemStack;

    /** 物品所处的位置。 */
    slot: number;
};

/** 物品信息可选项。 */
export interface ItemOptions {
    /** 物品数量。 */
    readonly amount?: number;

    /** 物品附魔。 */
    readonly enchantments?: EnchantmentInfo[];

    /** 物品是否锁定。 */
    readonly itemLock?: minecraft.ItemLockMode;

    /** 物品备注。 */
    readonly lore?: (string | minecraft.RawMessage)[];

    /** 物品名称。 */
    readonly name?: string;

    /** 物品可放置于何方块上。 */
    readonly canPlaceOn?: string[];

    /** 物品可破坏何方块。 */
    readonly canDestroy?: string[];

    /** 物品是否在玩家死亡后保留。 */
    readonly keepOnDeath?: boolean;

    /** 物品是否不可破坏。 */
    readonly unbreakable?: boolean;
}

/** 物品信息匹配可选项。代表一个物品是否同时匹配给定的信息。
 * @remarks 暂时不支持附魔查询。
 */
export interface ItemMatchOptions {
    /** 包含的物品 ID。 */
    readonly includeTypeId?: string[];

    /** 物品数量。
     * @remarks 指定为数组形式时，应为一个二元数组，第一个元素为最小值，第二个元素为最大值。
     */
    readonly amount?: number | [number, number];

    /** 物品是否锁定。 */
    readonly itemLock?: minecraft.ItemLockMode;

    /** 物品备注。 */
    readonly lore?: string[];

    /** 物品名称。 */
    readonly name?: string;

    /** 物品可放置于何方块上。 */
    readonly canPlaceOn?: string[];

    /** 物品可破坏何方块。 */
    readonly canDestroy?: string[];

    /** 物品是否在玩家死亡后保留。 */
    readonly keepOnDeath?: boolean;

    /** 物品是否不可破坏。 */
    readonly unbreakable?: boolean;
}

/** 检索物品时，检索哪些位置。 */
export interface ItemSearchInventoryOptions {
    /** 是否检索物品栏。 @default true */
    inventory?: boolean;

    /** 是否检索装备栏。 @default true */
    equipment?: boolean;

    /** 是否检索鼠标物品栏。 @default true */
    cursorInventory?: boolean;

    /** 是否检索末影箱。 @default false */
    enderChest?: boolean;
}

/** 物品栏操作工具。 */
class InventoryUtils {
    /** 获取实体物品栏组件。 */
    static get(entity: minecraft.Entity) {
        return entity.getComponent("minecraft:inventory");
    }

    // ===== 物品栏物品 =====
    /** 获取实体物品栏内的全部物品及对应槽位。 */
    static getItems(entity: minecraft.Entity): InventoryItemData[] {
        const inventory = this.get(entity);
        if (!inventory) return [];
        let inventoryItems = [];
        for (let i = 0; i < inventory.inventorySize; i++) {
            inventoryItems.push({ item: inventory.container.getItem(i), slot: i });
        }
        return inventoryItems;
    }

    /** 获取实体物品栏内的有效物品及对应槽位。 */
    static getValidItems(entity: minecraft.Entity): InventoryValidItemData[] {
        return this.getItems(entity).filter((itemInfo): itemInfo is InventoryValidItemData => itemInfo.item !== undefined);
    }

    /** 获取实体物品栏的某个槽位是否符合给定的信息。 */
    static isItem(entity: minecraft.Entity, slot: number, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.container.getItem(slot);
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }

    /** 给予实体物品，多出的物品将会溢出生成掉落物。
     * @param playSound 给予物品是否会播放拾取物品的音效。设置为`"player"`时会在给定实体为玩家时对玩家播放音效；
     * 设置为`"world"`时会在实体位置全局播放音效；设置为`"no"`时不播放音效。 | 默认值：`"player"`。
     * @param spawnItemWhenOverflow 对于无法塞入物品栏中的物品，是否溢出为掉落物。若不溢出则不再尝试生成。 | 默认值：`true`。
     */
    static add(
        entity: minecraft.Entity,
        itemId: string,
        options?: ItemOptions,
        playSound: "no" | "player" | "world" = "player",
        spawnItemWhenOverflow = true,
    ) {
        // 如果该实体不存在物品栏，终止运行
        const inventory = this.get(entity);
        if (!inventory) return;
        // 生成物品堆叠，并给予玩家物品
        const itemStacks = ItemUtils.generate(itemId, options);
        itemStacks.forEach(itemStack => {
            const leftItemStack = inventory.container.addItem(itemStack);
            if (!leftItemStack) return;
            if (!spawnItemWhenOverflow) return;
            minecraft.world.getDimension(entity.dimension.id).spawnItem(leftItemStack, entity.location).clearVelocity();
        });
        // 播放音效
        if (playSound === "player" && PlayerUtils.isPlayer(entity))
            entity.playSound("random.pop", {
                location: entity.location,
                pitch: JSUtils.number.limitDecimal(JSUtils.number.random(0.6, 2.2), 2),
                volume: 0.25,
            });
        else if (playSound === "world")
            entity.dimension.playSound("random.pop", entity.location, {
                pitch: JSUtils.number.limitDecimal(JSUtils.number.random(0.6, 2.2), 2),
                volume: 0.25,
            });
        return itemStacks;
    }

    /** 设置实体物品栏特定位置的物品。
     * @remarks 超出一组的物品将会自动忽略。
     */
    static set(entity: minecraft.Entity, slot: number, itemId: string, options?: ItemOptions) {
        const inventory = this.get(entity);
        if (!inventory) return;
        const item = ItemUtils.generate(itemId, options)[0];
        inventory.container.setItem(slot, item);
        return item;
    }

    /** 移除实体物品栏特定位置特定数量的物品。
     * @returns 返回已清除的物品数量。
     */
    static remove(entity: minecraft.Entity, slot: number, amount?: number): number {
        // 如果实体不存在物品栏，直接终止程序
        const inventory = this.get(entity);
        if (!inventory) return 0;
        // 如果该槽位本来就没有物品，直接终止程序
        const oldItem = inventory.container.getItem(slot);
        if (!oldItem) return 0;
        // 如果未指定物品数目，或者如果要清除的数量大于该物品原本的物品数量，返回旧物品堆叠的总数并全部清除
        if (!amount || oldItem.amount <= amount) {
            inventory.container.setItem(slot);
            return oldItem.amount;
        }
        // 其余情况，返回已清除过数目的物品堆叠
        const newItem = oldItem.clone();
        newItem.amount = oldItem.amount - amount;
        inventory.container.setItem(slot, newItem);
        return amount;
    }

    /** 对实体物品栏特定位置新增特定数量的物品。
     * @param itemId 当指定的位置不存在物品时，或指定的位置不为该物品时，新增该物品，否则不会新增任何物品。
     * @param options 若新增物品，新增何种物品。
     * @returns 返回已添加的物品数量。
     */
    static addSlot(entity: minecraft.Entity, slot: number, amount: number, itemId?: string, options?: ItemOptions): number {
        // 如果实体不存在物品栏，直接终止程序
        const inventory = this.get(entity);
        if (!inventory) return 0;
        // 获取原本的物品，如果不存在，或物品存在但和指定的物品 ID 不一致，则……
        const oldItem = inventory.container.getItem(slot);
        if (!oldItem || (itemId && oldItem.typeId !== itemId)) {
            // 如果没有设定默认物品，直接终止
            if (!itemId) return 0;
            // 如果设定了默认物品，则设定之，返回成功设定的数量
            return this.set(entity, slot, itemId, { ...options, amount })?.amount ?? 0;
        }
        // 在原本的基础上添加特定数量的物品
        const newItem = oldItem.clone();
        newItem.amount = JSUtils.number.clamp(oldItem.amount + amount, 1, oldItem.maxAmount);
        inventory.container.setItem(slot, newItem);
        return newItem.amount - oldItem.amount;
    }

    // ===== 物品栏槽位 =====
    /** 获取实体物品栏内的全部槽位。 */
    static getSlots(entity: minecraft.Entity) {
        const inventory = this.get(entity);
        if (!inventory) return [];
        let inventorySlots = [];
        for (let i = 0; i < inventory.inventorySize; i++) {
            inventorySlots.push({ containerSlot: inventory.container.getSlot(i), slot: i });
        }
        return inventorySlots;
    }

    /** 获取实体物品栏内拥有有效物品的槽位及对应位置。 */
    static getValidSlots(entity: minecraft.Entity) {
        return this.getSlots(entity).filter(slotInfo => slotInfo.containerSlot.hasItem());
    }

    /** 将物品栏内的所有物品都设置锁定状态。 */
    static lockAllItems(entity: minecraft.Entity, mode: minecraft.ItemLockMode) {
        this.getValidSlots(entity)?.forEach(itemData => (itemData.containerSlot.lockMode = mode));
    }

    /** 获取物品数目。
     * @remarks 该方法不支持在受限执行下调用。
     */
    static getAmount(entity: minecraft.Entity, options: ItemMatchOptions) {
        return JSUtils.number.sum(
            this.getValidItems(entity)
                .filter(itemData => ItemUtils.match(itemData.item, options))
                .map(itemData => itemData.item.amount),
        );
    }

    /** 获取特定 ID 的物品数目。 */
    static getTypeAmount(entity: minecraft.Entity, id: string) {
        return JSUtils.number.sum(
            this.getValidItems(entity)
                .filter(itemData => itemData.item.typeId === id)
                .map(itemData => itemData.item.amount),
        );
    }
}

/** 装备栏操作工具。 */
class EquipmentUtils {
    /** 获取实体装备栏组件。 */
    static get(entity: minecraft.Entity) {
        return entity.getComponent("minecraft:equippable");
    }

    /** 获取实体装备栏内对应槽位的物品。 */
    static getItem(entity: minecraft.Entity, equipmentSlot: minecraft.EquipmentSlot) {
        return this.get(entity)?.getEquipment(equipmentSlot);
    }

    /** 获取实体装备栏内的全部物品及对应槽位。 */
    static getItems(entity: minecraft.Entity) {
        return {
            /** 主手物品。 */
            "slot.weapon.mainhand": this.getItem(entity, minecraft.EquipmentSlot.Mainhand),

            /** 副手物品。 */
            "slot.weapon.offhand": this.getItem(entity, minecraft.EquipmentSlot.Offhand),

            /** 头部物品。 */
            "slot.armor.head": this.getItem(entity, minecraft.EquipmentSlot.Head),

            /** 胸部物品。 */
            "slot.armor.chest": this.getItem(entity, minecraft.EquipmentSlot.Chest),

            /** 腿部物品。 */
            "slot.armor.legs": this.getItem(entity, minecraft.EquipmentSlot.Legs),

            /** 脚部物品。 */
            "slot.armor.feet": this.getItem(entity, minecraft.EquipmentSlot.Feet),
        };
    }

    /** 获取实体装备栏的某个槽位是否符合给定的信息。 */
    static isItem(entity: minecraft.Entity, equipmentSlot: minecraft.EquipmentSlot, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.getEquipment(equipmentSlot);
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }

    /** 设置玩家的装备栏。
     * @remarks 超出一组的装备将会自动忽略。
     */
    static set(entity: minecraft.Entity, itemId: string, slot: minecraft.EquipmentSlot, options: ItemOptions = {}) {
        const item = ItemUtils.generate(itemId, options)[0];
        this.get(entity)?.setEquipment(slot, item);
        return item;
    }

    /** 移除玩家的装备栏。 */
    static remove(player: minecraft.Player, slot: minecraft.EquipmentSlot) {
        this.get(player)?.setEquipment(slot);
    }
}

/** 末影箱操作工具。 */
class EnderChestUtils {
    /** 移除玩家的末影箱物品（命令写法）。 */
    static removeAll(player: minecraft.Player) {
        for (let i = 0; i < 27; i++) player.runCommand(`replaceitem entity @s slot.enderchest ${i} air`);
    }
}

/** 玩家鼠标物品栏操作工具。 */
class CursorInventoryUtils {
    /** 获取鼠标物品栏组件。 */
    static get(player: minecraft.Player) {
        return player.getComponent("cursor_inventory");
    }

    /** 移除玩家的鼠标物品栏。 */
    static remove(player: minecraft.Player) {
        this.get(player)?.clear();
    }

    /** 获取实体鼠标物品栏选择的物品是否符合给定的信息。 */
    static isItem(entity: minecraft.Player, options: ItemMatchOptions) {
        const slotItem = this.get(entity)?.item;
        if (!slotItem) return false;
        return ItemUtils.match(slotItem, options);
    }
}

/** 物品操作工具。 */
export class ItemUtils {
    // ===== 内置工具 =====
    /** 物品栏操作工具。 */
    static inventory = InventoryUtils;

    /** 装备栏操作工具。 */
    static equipment = EquipmentUtils;

    /** 末影箱操作工具。 */
    static enderChest = EnderChestUtils;

    /** 鼠标选中物品操作工具。 */
    static cursorInventory = CursorInventoryUtils;

    // ===== 通用 =====

    /** 按照给定条件生成 ItemStacks。 */
    static generate(itemId: string, options: ItemOptions = {}) {
        // 解构参数
        const { enchantments, itemLock, lore, name, canPlaceOn, canDestroy, keepOnDeath, unbreakable } = options;
        let { amount = 1 } = options;
        const itemStacks: minecraft.ItemStack[] = [];
        // 单组上限只用查一次，放在循环外
        const maxStackSize = new minecraft.ItemStack(itemId).maxAmount;

        // 按组进行计算
        while (amount > 0) {
            const thisStackSize = Math.min(amount, maxStackSize);
            // 上限异常（比如返回 0）时直接退出，否则会死循环
            if (thisStackSize <= 0) break;
            amount -= thisStackSize;

            const itemStack = new minecraft.ItemStack(itemId, thisStackSize);
            if (enchantments) enchantments.forEach(enchantment => this.addEnchantment(itemStack, enchantment));
            if (itemLock) itemStack.lockMode = itemLock;
            if (lore) itemStack.setLore(lore);
            if (name) itemStack.nameTag = name;
            if (canPlaceOn) itemStack.setCanPlaceOn(canPlaceOn);
            if (canDestroy) itemStack.setCanDestroy(canDestroy);
            if (keepOnDeath) itemStack.keepOnDeath = keepOnDeath;
            if (unbreakable) {
                const durabilityComponent = itemStack.getComponent("minecraft:durability");
                if (durabilityComponent) durabilityComponent.unbreakable = unbreakable;
            }

            itemStacks.push(itemStack);
        }

        return itemStacks;
    }

    /** 判断给定的物品是否完全匹配给定的信息。
     * @param options 目前暂时不支持附魔的检查。
     * @remarks 该方法不支持在受限执行下调用。
     */
    static match(itemStack: minecraft.ItemStack, options: ItemMatchOptions) {
        // 获取选项信息和物品相关信息
        const {
            includeTypeId: optionsTypeId,
            name: optionsName,
            itemLock: optionsItemLock,
            keepOnDeath: optionsKeepOnDeath,
            lore: optionsLore,
            canDestroy: optionsCanDestroy,
            canPlaceOn: optionsCanPlaceOn,
            unbreakable: optionsUnbreakable,
        } = options;
        const optionsAmountRange: [number, number] | undefined = (() => {
            if (typeof options.amount === "number") return [options.amount, options.amount];
            return options.amount;
        })();
        const {
            typeId: itemTypeId,
            amount: itemAmount,
            nameTag: itemName,
            lockMode: itemItemLock,
            keepOnDeath: itemKeepOnDeath,
        } = itemStack;
        const itemLore = itemStack.getLore();
        const itemCanDestroy = itemStack.getCanDestroy();
        const itemCanPlaceOn = itemStack.getCanPlaceOn();
        const itemUnbreakable = itemStack.getComponent("durability")?.unbreakable ?? false;
        // 如果指定了筛选某变量 var，当某变量 var 无法匹配时返回 false
        if (optionsTypeId && !optionsTypeId.includes(itemTypeId)) return false;
        if (optionsAmountRange && (optionsAmountRange[0] > itemAmount || optionsAmountRange[1] < itemAmount)) return false;
        if (optionsName && optionsName !== itemName) return false;
        if (optionsItemLock && optionsItemLock !== itemItemLock) return false;
        if (optionsKeepOnDeath && optionsKeepOnDeath !== itemKeepOnDeath) return false;
        if (optionsLore && !JSUtils.array.isSameRestrict(optionsLore, itemLore)) return false;
        if (optionsCanDestroy && !JSUtils.array.isSame(optionsCanDestroy, itemCanDestroy)) return false;
        if (optionsCanPlaceOn && !JSUtils.array.isSame(optionsCanPlaceOn, itemCanPlaceOn)) return false;
        if (optionsUnbreakable && optionsUnbreakable !== itemUnbreakable) return false;
        // 其余情况均认为可筛选
        return true;
    }

    /** 判断实体是否拥有物品。
     * @param entity 仅当实体为玩家时才会检查鼠标物品栏。
     * @param matchOptions 这里的物品数量会检查单组的数量需求。若需要检查物品数量总和，请使用 {@link InventoryUtils} 的 hasItemAmount 方法。
     */
    static hasItem(entity: minecraft.Entity, matchOptions: ItemMatchOptions, searchOptions: ItemSearchInventoryOptions = {}) {
        const { inventory = true, cursorInventory = true, equipment = true } = searchOptions;

        // 检查物品栏的物品
        if (inventory && InventoryUtils.getValidItems(entity).some(itemData => this.match(itemData.item, matchOptions))) return true;
        // 检查鼠标物品栏的物品
        if (cursorInventory && entity.typeId === "minecraft:player") {
            const cursorItem = CursorInventoryUtils.get(entity as minecraft.Player)?.item;
            if (cursorItem && this.match(cursorItem, matchOptions)) return true;
        }
        // 检查装备栏的物品
        if (equipment && Object.values(EquipmentUtils.getItems(entity)).some(item => item && this.match(item, matchOptions)))
            return true;

        return false;
    }

    /** 获取实体是否拥有物品（命令写法）。 */
    static hasItemCommand(
        entity: minecraft.Entity,
        itemId: string,
        quantity?: number | string,
        location?: string,
        slot?: number | string,
        data?: number,
    ) {
        const quantityStr = quantity ? `,quantity=${quantity}` : ``;
        const locationStr = location ? `,location=${location}` : ``;
        const slotStr = slot ? `,slot=${slot}` : ``;
        const dataStr = data ? `,data=${data}` : ``;
        // 检测物品
        return (
            entity.runCommand(`execute if entity @s[hasitem={item=${itemId}${quantityStr}${locationStr}${slotStr}${dataStr} }]`)
                .successCount !== 0
        );
    }

    /** 清除物品（命令写法）。 */
    static removeItem(player: minecraft.Player, itemId: string = "", data: number = -1, maxCount: number = -1) {
        if (itemId.length === 0) {
            player.runCommand(`clear @s`);
            return;
        }
        player.runCommand(`clear @s ${itemId} ${data} ${maxCount}`);
    }

    // ===== 物品掉落物 =====
    /** 在特定位置生成物品掉落物。
     * @param clearVelocity 是否清除掉落物生成时的向量，若不清除则掉落物会随机存在一个向量。 | 默认值：`false`
     */
    static addEntity(
        location: minecraft.Vector3,
        itemId: string,
        options: ItemOptions = {},
        clearVelocity: boolean = false,
        dimension?: string | minecraft.Dimension,
    ) {
        return this.generate(itemId, options).map(itemStack => {
            const item = DimensionUtils.getDefault(dimension).spawnItem(itemStack, location);
            if (clearVelocity) item.clearVelocity();
            return item;
        });
    }

    /** 获取物品掉落物。 */
    static getEntity(itemId?: string, dimension?: string | minecraft.Dimension) {
        const allItems = DimensionUtils.getDefault(dimension).getEntities({ type: "minecraft:item" });
        if (itemId) return allItems.filter(item => item.getComponent("item")?.itemStack.typeId === itemId);
        return allItems;
    }

    /** 清除物品掉落物。 */
    static removeEntity(itemId?: string, dimension?: string | minecraft.Dimension) {
        this.getEntity(itemId, dimension).forEach(item => item.remove());
    }

    // ===== 附魔 =====
    /** 尝试为物品添加附魔，无法添加的附魔将不会添加。 */
    static addEnchantment(item: minecraft.ItemStack, enchantment: EnchantmentInfo) {
        // 如果附魔等级为小于等于 0 级，终止运行
        const { id, level = 1 } = enchantment;
        if (level <= 0) return item;
        // 如果无法附魔，终止运行
        const comp = item.getComponent("minecraft:enchantable");
        if (!comp) return item;
        // 如果附魔不能添加，终止运行
        const enchantmentData: minecraft.Enchantment = { type: new minecraft.EnchantmentType(id), level: level };
        if (!comp.canAddEnchantment(enchantmentData)) return item;
        // 添加附魔
        comp.addEnchantment(enchantmentData);
        return item;
    }

    /** 获取物品的附魔信息。
     * @returns 若物品无法附魔，返回 undefined。
     */
    static getEnchantment(item: minecraft.ItemStack): EnchantmentInfo[] | undefined {
        const comp = item.getComponent("minecraft:enchantable");
        if (!comp) return void 0;
        return comp.getEnchantments().flatMap(enchantment => ({ id: enchantment.type.id, level: enchantment.level }));
    }
}
