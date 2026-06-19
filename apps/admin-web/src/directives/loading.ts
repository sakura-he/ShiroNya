import { App, Directive, DirectiveBinding, VNode } from "vue";
import { createLoadingInstance } from "./loading/loading";
import loadingStyles from "./loading/style.module.css";
export const DIRECTIVE_NAME = "loading";
interface ILoadingElement extends HTMLElement {
    $loading: Record<string, any>;
}
function hasPosition(el: HTMLElement) {
    let elStyle = getComputedStyle(el);
    return elStyle.position !== "static";
}
function createLoadingElement(el: ILoadingElement, binding: DirectiveBinding, vnode: VNode) {
    let isLoading = binding.value;
    let oldIsLoading = binding.oldValue;
    if (isLoading !== oldIsLoading) {
        if (isLoading) {
            !el.$loading && (el.$loading = {});
            if (!el.$loading.hasInstance) {
                let { vm, instance } = createLoadingInstance(document.createElement("div"));
                vnode.props?.["na-loading-text"] && vm.setText(vnode.props["na-loading-text"]);
                el.$loading.instance = instance;

                el.$loading.vm = vm;
                el.$loading.hasInstance = true;
            }
            el.appendChild(el.$loading.vm.$el);
            if (!hasPosition(el)) {
                el.classList.add(loadingStyles["el--loading-position"]);
            }
        } else {
            el.classList.remove(loadingStyles["el--loading-position"]);
            if (el.$loading?.hasInstance) {
                el.removeChild(el.$loading.vm.$el);
                el.$loading.instance.unmount();
                el.$loading.hasInstance = false;
            }
        }
    }
}
export const directive: Directive = {
    mounted(el: HTMLElement, binding, vnode) {
        createLoadingElement(el as ILoadingElement, binding, vnode);
    },
    updated(el: HTMLElement, binding, vnode) {
        createLoadingElement(el as ILoadingElement, binding, vnode);
    },
    unmounted(el: ILoadingElement, binding) {
        if (typeof el.$loading === "object") {
            el.$loading.instance.unmount();
        }
    },
};
export default function installLoadingDirective(app: App) {
    app.directive(DIRECTIVE_NAME, directive);
}
