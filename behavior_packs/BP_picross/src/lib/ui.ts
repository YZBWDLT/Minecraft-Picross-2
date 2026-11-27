// *-*-*-*-*-*-* UI *-*-*-*-*-*-*
// 动作栏、消息与模态表单的封装。

import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

// --- UI 数据 ---

/** UI 数据。 */
interface UIDataBase {
    /** UI 标题。 */
    readonly title?: string | minecraft.RawMessage;

    /** UI 的父表单，在此表单关闭后显示的表单。
     * @remarks 通常来说该参数无需额外定义，在启动子界面时会自动注册父界面。
     */
    parentForm?: UIData;
}

/** ActionUI 数据。 */
export interface ActionUIData extends UIDataBase {
    readonly type: "action";

    /** UI 内部的文字简介信息。 */
    readonly body?: string | minecraft.RawMessage;

    /** UI 使用的表单组件。 */
    readonly components?: ActionUIComponent[];

    /** UI 被取消时执行的事件。 */
    readonly onCancel?: (reason?: ui.FormCancelationReason, thisForm?: ActionUIData | ModalUIData) => void | OpenNewFormOptions;
}

/** MessageUI 数据。 */
export interface MessageUIData extends UIDataBase {
    readonly type: "message";

    /** UI 内部的文字简介信息。 */
    readonly body?: string | minecraft.RawMessage;

    /** UI 的第一个按钮。 */
    readonly button1: FormButtonComponent;

    /** UI 的第二个按钮。 */
    readonly button2: FormButtonComponent;
}

/** ModalUI 数据。 */
export interface ModalUIData extends UIDataBase {
    readonly type: "modal";

    /** UI 的提交信息。 */
    readonly submitButton?: string | minecraft.RawMessage;

    /** UI 使用的表单组件。 */
    readonly components?: ModalUIComponent[];

    /** UI 被取消时执行的事件，该事件会在各组件的数据处理完后执行。 */
    readonly onCancel?: (reason?: ui.FormCancelationReason, thisForm?: ActionUIData | ModalUIData) => void | OpenNewFormOptions;

    /** UI 被提交后执行的事件，该事件会在各组件的数据处理完后执行。 */
    readonly onSubmit?: (
        result?: (string | number | boolean | undefined)[],
        thisForm?: ActionUIData | ModalUIData,
    ) => void | OpenNewFormOptions;
}

export type UIData = ActionUIData | MessageUIData | ModalUIData;

// --- UI 组件 ---

/** 表单组件。 */
interface FormComponentBase {
    /** 是否可见。 | 默认值：`true`
     * @remarks 对 MessageUI 无效，因为该 UI 固定使用两个按钮
     */
    readonly visible?: boolean;
}

/** ModalUI 表单组件。 */
interface ModalFormComponentBase extends FormComponentBase {
    /** 描述。 */
    readonly description: string | minecraft.RawMessage;

    /** 默认值。 */
    readonly default?: number | boolean | string;

    /** 旁侧提示文本。 */
    readonly tipText?: string | minecraft.RawMessage;
}

/** 标题表单组件。 */
export interface FormHeaderComponent extends FormComponentBase {
    readonly type: "header";

    /** 标题文本。 */
    readonly text: string | minecraft.RawMessage;
}

/** 文本表单组件。 */
export interface FormLabelComponent extends FormComponentBase {
    readonly type: "label";

    /** 文本。 */
    readonly text: string | minecraft.RawMessage;
}

/** 分割线表单组件。 */
export interface FormDividerComponent extends FormComponentBase {
    readonly type: "divider";
}

/** 按钮表单组件。 */
export interface FormButtonComponent extends FormComponentBase {
    readonly type: "button";

    /** 按钮文本。 */
    readonly text: string | minecraft.RawMessage;

    /** 按钮图标。
     * @remarks 仅限 ActionUI 可用。
     * @example "textures/items/apple"
     */
    readonly icon?: string;

    /** 按钮被选中后的设置。 */
    readonly onClick: () => void | OpenNewFormOptions;
}

/** 下拉栏表单组件。 */
export interface FormDropdownComponent extends ModalFormComponentBase {
    readonly type: "dropdown";
    readonly default?: number;

    /** 下拉栏全部可用选项。 */
    readonly items: (minecraft.RawMessage | string)[];

    /** 在此下拉栏选择特定值提交后执行的函数。 */
    readonly onSubmit: (result: number, items: (minecraft.RawMessage | string)[]) => void;
}

/** 滑块表单组件。 */
export interface FormSliderComponent extends ModalFormComponentBase {
    readonly type: "slider";
    readonly default?: number;

    /** 滑块范围最小值。 */
    readonly min: number;

    /** 滑块范围最大值。 */
    readonly max: number;

    /** 每次滑动滑块时的步长。 | 默认值：`1` */
    readonly step?: number;

    /** 在此滑块选择特定值提交后执行的函数。 */
    readonly onSubmit: (result: number) => void;
}

/** 文字输入框表单组件。 */
export interface FormTextFieldComponent extends ModalFormComponentBase {
    readonly type: "textField";
    readonly default?: string;

    /** 文本输入框背景字。 */
    readonly placeholderText: string | minecraft.RawMessage;

    /** 在此文本输入框输入特定值提交后执行的函数。 */
    readonly onSubmit: (result: string) => void;
}

/** 开关表单组件。 */
export interface FormToggleComponent extends ModalFormComponentBase {
    readonly type: "toggle";
    readonly default?: boolean;

    /** 在此开关选择特定值提交后执行的函数。 */
    readonly onSubmit: (result: boolean) => void;
}

export type ActionUIComponent = FormHeaderComponent | FormLabelComponent | FormDividerComponent | FormButtonComponent;
export type ModalUIComponent =
    | FormHeaderComponent
    | FormLabelComponent
    | FormDividerComponent
    | FormDropdownComponent
    | FormSliderComponent
    | FormTextFieldComponent
    | FormToggleComponent;

/** 打开新表单选项。 */
export interface OpenNewFormOptions {
    /** 子界面。
     * @remarks 在该子界面打开后会自动为该子界面注册父界面。
     */
    readonly childForm?: UIData;

    /** 在关闭该界面后打开何界面，在不存在对应界面时直接跳过。 */
    readonly openForm: "childForm" | "parentForm";
}

export class UIUtils {
    /** 当玩家选择特定按钮、提交特定表单或关闭特定表单后，显示的新 UI。 */
    private static handleNewFormData(
        thisFormData: UIData,
        showPlayer: minecraft.Player,
        parentForm: UIData | undefined,
        newFormData: void | OpenNewFormOptions,
    ) {
        // 如果没有指定新界面，则直接终止
        if (!newFormData) return;
        // 如果指定显示子界面，在子界面存在的情况下打开子界面，并注册本界面为子界面的父界面
        const { childForm, openForm } = newFormData;
        if (openForm == "childForm" && childForm) {
            childForm.parentForm = thisFormData;
            this.createAutomatically(showPlayer, childForm);
        }
        // 如果指定显示父界面，打开父界面
        else if (parentForm) {
            this.createAutomatically(showPlayer, parentForm);
        }
    }
    /** 添加一个 ActionUI，并对玩家显示。 */
    static createAction(showPlayer: minecraft.Player, formData: ActionUIData) {
        // 表单创建
        const form = new ui.ActionFormData();
        if (formData.title) form.title(formData.title);
        if (formData.body) form.body(formData.body);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false) return;
                switch (component.type) {
                    case "header":
                        form.header(component.text);
                        return;
                    case "label":
                        form.label(component.text);
                        return;
                    case "divider":
                        form.divider();
                        return;
                    case "button":
                        form.button(component.text, component.icon);
                        return;
                    default:
                        return;
                }
            });

        // 显示设置
        // 筛选出所有的 button 组件
        const buttons =
            formData.components
                ?.filter(component => component.type === "button")
                .filter(buttonComponent => buttonComponent.visible !== false) ?? [];
        form.show(showPlayer)
            .then(response => {
                const { selection, canceled, cancelationReason } = response;
                const parentForm = formData.parentForm;
                // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = (() => {
                    // 选择了特定按钮后
                    if (selection !== undefined) return buttons[selection]?.onClick();
                    // 取消表单后
                    else if (canceled && formData.onCancel) return formData.onCancel(cancelationReason, formData);
                })();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 添加一个 MessageFormUI，并对玩家显示。 */
    static createMessage(showPlayer: minecraft.Player, formData: MessageUIData) {
        // 表单创建
        const form = new ui.MessageFormData();
        if (formData.title) form.title(formData.title);
        if (formData.body) form.body(formData.body);
        form.button1(formData.button1.text);
        form.button2(formData.button2.text);

        // 显示设置
        // 筛选出所有的 button 组件
        const buttons = [formData.button1, formData.button2];
        form.show(showPlayer)
            .then(response => {
                const { selection } = response;
                const parentForm = formData.parentForm;
                // 当玩家选择了特定按钮后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = buttons[selection ?? 0]?.onClick();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 添加一个 ModalFormUI，并对玩家显示。 */
    static createModal(showPlayer: minecraft.Player, formData: ModalUIData) {
        // 表单创建
        const form = new ui.ModalFormData();
        if (formData.title) form.title(formData.title);
        if (formData.submitButton) form.submitButton(formData.submitButton);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false) return;
                switch (component.type) {
                    case "header":
                        form.header(component.text);
                        break;
                    case "label":
                        form.label(component.text);
                        break;
                    case "divider":
                        form.divider();
                        break;
                    case "dropdown":
                        form.dropdown(component.description, component.items, {
                            defaultValueIndex: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    case "slider":
                        form.slider(component.description, component.min, component.max, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                            valueStep: component.step,
                        });
                        break;
                    case "textField":
                        form.textField(component.description, component.placeholderText, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    case "toggle":
                        form.toggle(component.description, {
                            defaultValue: component.default,
                            tooltip: component.tipText,
                        });
                        break;
                    default:
                        break;
                }
            });

        // 显示设置
        // 筛选出所有有效组件
        form.show(showPlayer)
            .then(response => {
                const { formValues, canceled, cancelationReason } = response;
                const parentForm = formData.parentForm;
                // 玩家提交后
                if (formValues !== undefined) {
                    // 处理提交事件

                    /** 所有能提供数值的有效组件 */
                    const valueComponents: (
                        | FormDropdownComponent
                        | FormSliderComponent
                        | FormTextFieldComponent
                        | FormToggleComponent
                    )[] = [];
                    /** 所有数值 */
                    const values: (string | number | boolean | undefined)[] = [];
                    formData.components
                        ?.filter(component => component.visible !== false)
                        .forEach((component, index) => {
                            if (["dropdown", "toggle", "textField", "slider"].includes(component.type)) {
                                valueComponents.push(
                                    component as
                                        | FormDropdownComponent
                                        | FormSliderComponent
                                        | FormTextFieldComponent
                                        | FormToggleComponent,
                                );
                                values.push(formValues[index]);
                            }
                        });
                    // 对每个选项执行事件
                    valueComponents.forEach((component, index) => {
                        switch (component.type) {
                            case "dropdown":
                                component.onSubmit(values[index] as number, component.items);
                                break;
                            case "slider":
                                component.onSubmit(values[index] as number);
                                break;
                            case "textField":
                                component.onSubmit(values[index] as string);
                                break;
                            case "toggle":
                                component.onSubmit(values[index] as boolean);
                                break;
                            default:
                                break;
                        }
                    });
                }
                // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
                const newFormData = (() => {
                    // 提交后
                    if (formValues !== undefined && formData.onSubmit) return formData.onSubmit(formValues, formData);
                    // 取消表单后
                    else if (canceled && formData.onCancel) return formData.onCancel(cancelationReason, formData);
                })();
                UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
            })
            .catch(() => {});

        return form;
    }

    /** 按照 formData 所给信息自动创建表单。 */
    static createAutomatically(showPlayer: minecraft.Player, formData: UIData) {
        switch (formData.type) {
            case "action":
                return this.createAction(showPlayer, formData);
            case "message":
                return this.createMessage(showPlayer, formData);
            case "modal":
                return this.createModal(showPlayer, formData);
        }
    }

    /** 关闭所有 UI。 */
    static close(player: minecraft.Player) {
        ui.uiManager.closeAllForms(player);
    }
}
