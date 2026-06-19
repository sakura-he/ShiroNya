export default function createCache(prefix?: string) {
    class Cache {
        // 前缀；没有设置前缀的默认前缀为_
        prefix = prefix ? prefix + "_" : "_";
        // 设置缓存
        setCache(key: string, value: any, expire?: number) {
            let cacheKey = `${this.prefix}${key}`.toUpperCase();
            let cacheValue = JSON.stringify({
                value,
                expire: expire && Date.now() + expire,
            });
            localStorage.setItem(cacheKey, cacheValue);
        }
        // 获取缓存
        getCache(key: string): any | null {
            let cacheKey = `${this.prefix}${key}`.toUpperCase();
            let localStorageItem = localStorage.getItem(cacheKey);
            if (!localStorageItem) return null;
            let value = JSON.parse(localStorageItem);
            // 没有设置过期时间或者没有过期直接返回
            if (!value.expire || Date.now() < value.expire) {
                return value.value;
            }
            // 已过期
            localStorage.removeItem(cacheKey);
            return null;
        }
        // 删除指定key
        removeCache(key: string) {
            let cacheKey = `${this.prefix}${key}`.toUpperCase();
            localStorage.removeItem(cacheKey);
        }
    }
    return new Cache();
}
// 删除指定前缀的所有key,传入前缀删除指定的,不传入,删除所有没有前缀的
export function removeStoreByPrefix(prefix?: string) {
    prefix = prefix ? prefix.toUpperCase() + "_" : "_";
    console.log("要删除的前缀为:", prefix);
    let keyLength = localStorage.length;
    let keyMap: string[] = [];
    for (let index = 0; index < keyLength; index++) {
        keyMap.push(localStorage.key(index) as string);
    }
    console.log(keyMap);
    keyMap.forEach((storageKey) => {
        let regexp = new RegExp(`^${prefix}[\\d\\D]+`);
        if (regexp.test(storageKey)) {
            console.log("删除的key为:", storageKey);
            localStorage.removeItem(storageKey);
        }
    });
}
