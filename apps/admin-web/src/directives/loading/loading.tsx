import { App, ComponentOptions, DefineComponent, defineExpose } from 'vue'
import Icon from './icon'
import styles from './style.module.css'
export let loadingComponentOption: ComponentOptions = {
    name: 'NaLoading',
    setup(prop, { expose }) {

        let text = ref('加载中')
        function setText(value: string) {
            text.value = value
        }
        expose({
            setText
        })
        return () => <div class={styles['na-loading']}>
            <div class={styles['na-loading__mask']}></div>
            <div class={styles['na-loading__content']}>
                <div class={styles['na-loading__icon']}>
                   {h(Icon)}
                </div>
                <div class={styles['na-loading__text']}>{text.value}</div>
            </div>
        </div>
    }
}
interface ICreateLoadingInstanceReturn {
    instance: App,
    vm: any,
    close: () => void
}
export function createLoadingInstance(el: HTMLElement): ICreateLoadingInstanceReturn {
    let instance = createApp(loadingComponentOption);
    let vm = instance.mount(el);
    function close() {
        instance.unmount();
    }
    return {
        instance,
        vm,
        close
    }
}