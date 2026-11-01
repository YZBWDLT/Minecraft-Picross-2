// @ts-check

import * as minecraft from "@minecraft/server";

minecraft.world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    if (!event.isFirstEvent) return;
    const block = event.block;
    /** @type {boolean | undefined} */ // @ts-ignore
    const isSolved = block.permutation.getState("picross:solved");
    if (isSolved === undefined) return;
    minecraft.system.run(() => {
        // @ts-ignore
        block.setPermutation(block.permutation.withState("picross:solved", !isSolved));
    });
});
