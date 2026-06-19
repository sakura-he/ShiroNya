import { Ref, ref } from "vue";
type observable = HTMLElement;
type observer = (entries: ResizeObserverEntry[]) => any;
export default function useResizeObserver({
    el,
    observer,
}: {
    el: observable | Ref<HTMLElement>;
    observer: observer;
}) {
    let observable = ref<null | HTMLElement>(null);
    if (el instanceof HTMLElement) {
        observable.value = el;
    } else {
        observable.value = el.value;
    }
    let resizeObserver = new ResizeObserver(observer);
    resizeObserver.observe(observable.value);
    function stopObserver() {
        resizeObserver.disconnect();
    }
    return { observable, resizeObserver, stopObserver };
}
