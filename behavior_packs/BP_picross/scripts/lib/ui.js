// *-*-*-*-*-*-* UI *-*-*-*-*-*-*
// 动作栏、消息与模态表单的封装。
import * as minecraft from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
export class UIUtils {
    /** 当玩家选择特定按钮、提交特定表单或关闭特定表单后，显示的新 UI。 */
    static handleNewFormData(thisFormData, showPlayer, parentForm, newFormData) {
        // 如果没有指定新界面，则直接终止
        if (!newFormData)
            return;
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
    static createAction(showPlayer, formData) {
        // 表单创建
        const form = new ui.ActionFormData();
        if (formData.title)
            form.title(formData.title);
        if (formData.body)
            form.body(formData.body);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false)
                    return;
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
        const buttons = formData.components
            ?.filter(component => component.type === "button")
            .filter(buttonComponent => buttonComponent.visible !== false) ?? [];
        form.show(showPlayer)
            .then(response => {
            const { selection, canceled, cancelationReason } = response;
            const parentForm = formData.parentForm;
            // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
            const newFormData = (() => {
                // 选择了特定按钮后
                if (selection !== undefined)
                    return buttons[selection]?.onClick();
                // 取消表单后
                else if (canceled && formData.onCancel)
                    return formData.onCancel(cancelationReason, formData);
            })();
            UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
        })
            .catch(() => { });
        return form;
    }
    /** 添加一个 MessageFormUI，并对玩家显示。 */
    static createMessage(showPlayer, formData) {
        // 表单创建
        const form = new ui.MessageFormData();
        if (formData.title)
            form.title(formData.title);
        if (formData.body)
            form.body(formData.body);
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
            .catch(() => { });
        return form;
    }
    /** 添加一个 ModalFormUI，并对玩家显示。 */
    static createModal(showPlayer, formData) {
        // 表单创建
        const form = new ui.ModalFormData();
        if (formData.title)
            form.title(formData.title);
        if (formData.submitButton)
            form.submitButton(formData.submitButton);
        if (formData.components)
            formData.components.forEach(component => {
                if (component.visible === false)
                    return;
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
                const valueComponents = [];
                /** 所有数值 */
                const values = [];
                formData.components
                    ?.filter(component => component.visible !== false)
                    .forEach((component, index) => {
                    if (["dropdown", "toggle", "textField", "slider"].includes(component.type)) {
                        valueComponents.push(component);
                        values.push(formValues[index]);
                    }
                });
                // 对每个选项执行事件
                valueComponents.forEach((component, index) => {
                    switch (component.type) {
                        case "dropdown":
                            component.onSubmit(values[index], component.items);
                            break;
                        case "slider":
                            component.onSubmit(values[index]);
                            break;
                        case "textField":
                            component.onSubmit(values[index]);
                            break;
                        case "toggle":
                            component.onSubmit(values[index]);
                            break;
                        default:
                            break;
                    }
                });
            }
            // 当玩家进行特定操作后，立刻执行对应事件，并获取返回值以确认是否要打开一个新的界面
            const newFormData = (() => {
                // 提交后
                if (formValues !== undefined && formData.onSubmit)
                    return formData.onSubmit(formValues, formData);
                // 取消表单后
                else if (canceled && formData.onCancel)
                    return formData.onCancel(cancelationReason, formData);
            })();
            UIUtils.handleNewFormData(formData, showPlayer, parentForm, newFormData);
        })
            .catch(() => { });
        return form;
    }
    /** 按照 formData 所给信息自动创建表单。 */
    static createAutomatically(showPlayer, formData) {
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
    static close(player) {
        ui.uiManager.closeAllForms(player);
    }
}
