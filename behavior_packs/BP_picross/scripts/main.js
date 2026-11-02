import * as minecraft from "@minecraft/server";
minecraft.world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    if (!event.isFirstEvent)
        return;
    const block = event.block;
    // @ts-ignore
    const isSolved = block.permutation.getState("picross:solved");
    if (isSolved === undefined)
        return;
    minecraft.system.run(() => {
        // @ts-ignore
        block.setPermutation(block.permutation.withState("picross:solved", !isSolved));
    });
});
/** 代表一个广义的数织关卡。这个广义的数织关卡可能包括大厅关卡、游戏关卡等，支持启动关卡、退出关卡等操作。 */
class LevelBase {
    constructor() { }
    /** 启动关卡。 */
    start() { }
    /** 离开关卡。 */
    exit() { }
}
