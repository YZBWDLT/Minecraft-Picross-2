// *-*-*-*-*-*-* 表单 *-*-*-*-*-*-*
// 用数据驱动 UI（CustomForm / MessageBox）的写法，封装传统表单 ActionFormData / ModalFormData / MessageFormData。
// 部分写法因两个表单的特性差异，可能会有所不同（例如动态 UI、可观察变量等）。
import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
/** 判断玩家是否正在显示表单。
 * @description 正在显示表单的玩家不能显示另一个表单，必须手动 close 后再显示新的，以和 DDUI 的表现对齐。
 */
const showingPlayerIds = new Set();
// ==============================================
/** 自定义表单，可动态添加按钮、文本、开关、下拉框等组件。 */
export class CustomForm {
    /**
     * @param player 要显示的玩家。
     * @param title 表单的标题。
     * @param type 表单的类型。
     */
    constructor(player, title, type) {
        this.player = player;
        this.type = type;
        if (type === "action")
            this.form = new ui.ActionFormData().title(title);
        else
            this.form = new ui.ModalFormData().title(title);
    }
    /** 表单对应的玩家。 */
    player;
    /** 表单的类型。 */
    type;
    /** 表单。 */
    form;
    /** 表单所使用的全部按钮。仅限 action 表单可用。 */
    buttons = [];
    /** 表单所使用的全部组件。 */
    modalComponents = [];
    /** 该表单当前是否正在展示给玩家。 */
    showing = false;
    /** 向表单添加一个可点击按钮。
     * @param label 按钮上显示的文本。
     * @param onClick 玩家点击按钮时调用的回调。
     * @param options 按钮的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     * @remarks 该组件只能用于 action 类型的表单。
     */
    button(label, onClick, options) {
        if (options?.visible === false)
            return this;
        if (this.type === "modal")
            return this;
        this.form.button(label, options?.imageDetails?.imageSrc);
        this.buttons.push(onClick);
        return this;
    }
    /** 关闭该表单当前展示给玩家的界面。 */
    close() {
        ui.uiManager.closeAllForms(this.player);
        this.showing = false;
        showingPlayerIds.delete(this.player.id);
    }
    /** 向表单添加一条水平分隔线。
     * @param options 分隔线的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     */
    divider(options) {
        if (options?.visible === false)
            return this;
        this.form.divider();
        if (this.type === "modal")
            this.modalComponents.push({ type: "other", onSubmit: () => { } });
        return this;
    }
    /** 向表单添加一个下拉框。
     * @param label 下拉框的标签。
     * @param onSubmit 提交表单后执行的函数，回调函数返回选择的 item 的值。（此处和 DDUI 有差异）
     * @param items 下拉框的条目。
     * @param options 下拉框的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     * @remarks 该组件只能用于 modal 类型的表单。
     */
    dropdown(label, onSubmit, items, options) {
        if (options?.visible === false)
            return this;
        if (this.type === "action")
            return this;
        const firstDefaultIndex = items.findIndex(item => item.isDefault);
        this.form.dropdown(label, items.map(item => item.label), { defaultValueIndex: firstDefaultIndex === -1 ? 0 : firstDefaultIndex, tooltip: options?.tooltip });
        this.modalComponents.push({ type: "dropdown", onSubmit, dropdownValues: items.map(item => item.value) });
        return this;
    }
    /** 向表单添加一个标题文本。
     * @param text 标题内容。
     * @param options 文本的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     */
    header(text, options) {
        if (options?.visible === false)
            return this;
        this.form.header(text);
        if (this.type === "modal")
            this.modalComponents.push({ type: "other", onSubmit: () => { } });
        return this;
    }
    /** 该表单当前是否正在展示给玩家。 */
    isShowing() {
        return this.showing;
    }
    /** 向表单添加一段只读文本。
     * @param text 标签内容。
     * @param options 文本的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     */
    label(text, options) {
        if (options?.visible === false)
            return this;
        this.form.label(text);
        if (this.type === "modal")
            this.modalComponents.push({ type: "other", onSubmit: () => { } });
        return this;
    }
    /** 把该表单展示给玩家，异步返回界面关闭的原因。 */
    async show() {
        // 如果玩家的界面正在显示，则视为用户繁忙
        if (showingPlayerIds.has(this.player.id))
            return ScreenClosedReason.UserBusy;
        showingPlayerIds.add(this.player.id);
        this.showing = true;
        try {
            // 玩家正忙于其他界面时，旧接口不会抛错，而是返回一个被取消的响应并标上 UserBusy
            let cancelationReason;
            if (this.type === "action") {
                const response = await this.form.show(this.player);
                cancelationReason = response.cancelationReason;
                // 如果玩家已做出选择，执行对应的按钮，并视为服务端关闭
                if (response.selection !== undefined) {
                    this.buttons[response.selection]?.();
                    return ScreenClosedReason.ServerClosed;
                }
            }
            else {
                const response = await this.form.show(this.player);
                cancelationReason = response.cancelationReason;
                // 如果玩家已做出选择，执行对应的组件回调，并视为服务端关闭
                if (response.formValues !== undefined) {
                    const formValues = response.formValues;
                    this.modalComponents.forEach((comp, index) => {
                        const formValue = formValues[index];
                        switch (comp.type) {
                            // 对于下拉栏，返回被选中的 item 中指定的 value，但若未命中则返回索引值
                            case "dropdown": {
                                const value = comp.dropdownValues?.[formValue] ?? formValue;
                                comp.onSubmit(value);
                                return;
                            }
                            // 对于滑块、文本输入框和开关，直接返回值
                            case "slider":
                            case "textField":
                            case "toggle": {
                                comp.onSubmit(formValue);
                                return;
                            }
                        }
                    });
                    return ScreenClosedReason.ServerClosed;
                }
            }
            // 玩家正忙于其他界面：界面根本没显示出来
            if (cancelationReason === ui.FormCancelationReason.UserBusy)
                return ScreenClosedReason.UserBusy;
            // 其余情况视为玩家主动关闭了表单
            return ScreenClosedReason.ClientClosed;
        }
        finally {
            // 回调里可能已经 close 并打开了新表单，那时占用锁的已经不是自己了，不能替别人解锁
            if (this.showing)
                showingPlayerIds.delete(this.player.id);
            this.showing = false;
        }
    }
    /** 向表单添加一个数值滑块。
     * @param label 滑块的标签。
     * @param onSubmit 提交表单后执行的函数，回调函数返回选择的值。（此处和 DDUI 有差异）
     * @param min 滑块的最小值。
     * @param max 滑块的最大值。
     * @param options 滑块的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     * @remarks 该组件只能用于 modal 类型的表单。
     */
    slider(label, onSubmit, min, max, options) {
        if (options?.visible === false)
            return this;
        if (this.type === "action")
            return this;
        this.form.slider(label, min, max, {
            defaultValue: options?.default,
            tooltip: options?.tooltip,
            valueStep: options?.step,
        });
        this.modalComponents.push({ type: "slider", onSubmit });
        return this;
    }
    /** 向表单添加一个文本输入框，输入内容保存在指定的可观察对象中。
     * @param label 输入框的标签。
     * @param onSubmit 提交表单后执行的函数，回调函数返回输入的值。（此处和 DDUI 有差异）
     * @param options 输入框的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     * @remarks 该组件只能用于 modal 类型的表单。
     */
    textField(label, onSubmit, options) {
        if (options?.visible === false)
            return this;
        if (this.type === "action")
            return this;
        this.form.textField(label, "", { defaultValue: options?.default, tooltip: options?.tooltip });
        this.modalComponents.push({ type: "textField", onSubmit });
        return this;
    }
    /** 向表单添加一个开关，状态保存在指定的可观察对象中。
     * @param label 开关的标签。
     * @param onSubmit 提交表单后执行的函数，回调函数返回选择的值。（此处和 DDUI 有差异）
     * @param options 开关的附加选项（可选）。
     * @returns 该表单本身，便于链式调用。
     * @remarks 该组件只能用于 modal 类型的表单。
     */
    toggle(label, onSubmit, options) {
        if (options?.visible === false)
            return this;
        if (this.type === "action")
            return this;
        this.form.toggle(label, { defaultValue: options?.default, tooltip: options?.tooltip });
        this.modalComponents.push({ type: "toggle", onSubmit });
        return this;
    }
}
/** 消息框，由标题、正文与最多两个按钮组成。 */
export class MessageBox {
    /**
     * @param player 要显示的玩家。
     * @param title 表单的标题。
     */
    constructor(player, title) {
        this.player = player;
        this.form = new ui.MessageFormData().title(title);
    }
    /** 表单对应的玩家。 */
    player;
    /** 表单。 */
    form;
    /** 该消息框当前是否正在展示给玩家。 */
    showing = false;
    /** 设置消息框的正文。
     * @param body 消息框的正文。
     * @returns 该消息框本身，便于链式调用。
     */
    body(body) {
        this.form.body(body);
        return this;
    }
    /** 设置消息框第一个按钮的文本与提示。
     * @param label 按钮的文本。
     * @returns 该消息框本身，便于链式调用。
     */
    button1(label) {
        this.form.button1(label);
        return this;
    }
    /** 设置消息框第二个按钮的文本与提示。
     * @param label 按钮的文本。
     * @returns 该消息框本身，便于链式调用。
     */
    button2(label) {
        this.form.button2(label);
        return this;
    }
    /** 关闭该消息框当前展示给玩家的界面。 */
    close() {
        ui.uiManager.closeAllForms(this.player);
        this.showing = false;
        showingPlayerIds.delete(this.player.id);
    }
    /** 该消息框当前是否正在展示给玩家。 */
    isShowing() {
        return this.showing;
    }
    /** 把该消息框展示给玩家，异步返回玩家点击的按钮。
     * @returns 玩家点击按钮的结果。
     */
    async show() {
        // 如果玩家的界面正在显示，则视为用户繁忙
        if (showingPlayerIds.has(this.player.id))
            return { closeReason: ScreenClosedReason.UserBusy };
        showingPlayerIds.add(this.player.id);
        this.showing = true;
        try {
            const response = await this.form.show(this.player);
            if (response.selection !== undefined) {
                return { closeReason: ScreenClosedReason.ServerClosed, selection: response.selection + 1 };
            }
            // 玩家正忙于其他界面：界面根本没显示出来
            if (response.cancelationReason === ui.FormCancelationReason.UserBusy) {
                return { closeReason: ScreenClosedReason.UserBusy };
            }
            return { closeReason: ScreenClosedReason.ClientClosed };
        }
        finally {
            // 回调里可能已经 close 并打开了新界面，那时占用锁的已经不是自己了，不能替别人解锁
            if (this.showing)
                showingPlayerIds.delete(this.player.id);
            this.showing = false;
        }
    }
}
/** UI 界面（消息框或自定义表单）关闭的原因。 */
export var ScreenClosedReason;
(function (ScreenClosedReason) {
    /** 客户端关闭了界面，例如玩家按下关闭按钮。 */
    ScreenClosedReason["ClientClosed"] = "ClientClosed";
    /** 服务器关闭了界面。 */
    ScreenClosedReason["ServerClosed"] = "ServerClosed";
    /** 玩家正忙于其他界面，界面无法展示。 */
    ScreenClosedReason["UserBusy"] = "UserBusy";
})(ScreenClosedReason || (ScreenClosedReason = {}));
