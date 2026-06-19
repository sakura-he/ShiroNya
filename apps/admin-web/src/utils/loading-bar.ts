import type { LoadingBarProviderInst } from "naive-ui/es/loading-bar";

let loadingBar: LoadingBarProviderInst | null = null;
let activeCount = 0;
let pendingError = false;

export function registerLoadingBar(instance: LoadingBarProviderInst) {
    loadingBar = instance;

    if (pendingError) {
        pendingError = false;
        loadingBar.error();
        return;
    }

    if (activeCount > 0) {
        loadingBar.start();
    }
}

export function unregisterLoadingBar(instance: LoadingBarProviderInst) {
    if (loadingBar === instance) {
        loadingBar = null;
    }
}

export function startLoadingBar() {
    const wasIdle = activeCount === 0;
    activeCount += 1;

    if (wasIdle) {
        pendingError = false;
        loadingBar?.start();
    }
}

export function finishLoadingBar() {
    if (activeCount > 0) {
        activeCount -= 1;
    }

    if (activeCount === 0) {
        pendingError = false;
        loadingBar?.finish();
    }
}

export function errorLoadingBar() {
    activeCount = 0;

    if (loadingBar) {
        loadingBar.error();
        return;
    }

    pendingError = true;
}

export const appLoadingBar = {
    start: startLoadingBar,
    finish: finishLoadingBar,
    done: finishLoadingBar,
    error: errorLoadingBar,
};
