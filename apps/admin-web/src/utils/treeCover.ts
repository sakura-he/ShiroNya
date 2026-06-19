import { cloneDeep } from "es-toolkit";
interface CoverOptions {
    fieldsPath?: string | number | Array<string | number>;
    sequential?: boolean;
}

interface TreeIconRecord {
    icon?: string | null;
    iconName?: string | null;
    children?: TreeIconRecord[];
    [key: string]: any;
}

// 按字段名链读取排序值，字段不存在时直接暴露数据问题。
function getFieldValue(record: any, fieldsPath: string | number | Array<string | number>) {
    const path = Array.isArray(fieldsPath) ? fieldsPath : [fieldsPath];
    let current = record;
    for (const key of path) {
        if (current === null || current === undefined || !(key in current)) {
            throw new Error(`排序字段不存在：${String(key)}`);
        }
        current = current[key];
    }
    return current;
}

// 按指定字段对同级节点排序，排序字段必须存在且可做数值比较。
function arrSort(arr: any[], options?: CoverOptions) {
    const { fieldsPath = "order", sequential = true } = options || {};
    arr.sort((a: any, b: any) => {
        let aSort = getFieldValue(a, fieldsPath);
        let bSort = getFieldValue(b, fieldsPath);

        return sequential ? aSort - bSort : bSort - aSort;
    });
}

// 将扁平化数据转换为树形结构
export function flat2treeByArr(flats: any[], option?: CoverOptions) {
    let _flats = cloneDeep(flats);
    const tree: any[] = [];
    let getChildren = (children: any[], pid: number | null) => {
        _flats.forEach((item: any) => {
            if (item.pid === pid) {
                let son = { ...item, children: [] };
                children.push(son);
                getChildren(son.children, son.id);
            }
        });
        arrSort(children, option);
    };
    getChildren(tree, null);
    return tree;
}

// 将扁平化菜单通过 Map 快速转换为树形结构，根节点必须显式使用 pid=null。
export function flat2treeByMap(flats: any[], options?: CoverOptions) {
    let _flats = cloneDeep(flats);
    const idMap = new Map();
    const tree: any[] = [];
    // 先将所有节点根据节点 id 存入 Map 中，并添加 children 属性。
    _flats.forEach((item: any) => {
        if (typeof item.id !== "number") {
            throw new Error(`菜单节点缺少数字 id：${JSON.stringify(item)}`);
        }
        if (idMap.has(item.id)) {
            throw new Error(`菜单节点 id 重复：${item.id}`);
        }
        idMap.set(item.id, { ...item, children: [] });
    });
    for (const node of idMap.values()) {
        // 根节点只能使用 null，undefined 或缺失父节点都视为数据错误。
        if (node.pid === null) {
            tree.push(node);
            arrSort(tree, options);
        } else {
            const parent = idMap.get(node.pid);
            if (!parent) {
                throw new Error(`菜单节点 ${node.id} 的父节点不存在：${node.pid}`);
            }
            parent.children.push(node);
            arrSort(parent.children, options);
        }
    }
    return tree;
}

export function flatToTree2ByFilter(flats: any) {
    let _flats = cloneDeep(flats);

    return _flats.filter((parent: any) => {
        let son = _flats.filter((child: any) => {
            return parent.id === child.pid;
        });
        son.length > 0 ? (parent.children = son) : (parent.children = []);
        return parent.pid === null;
    });
}

// 将后端菜单 icon 字符串移到 iconName，避免 Arco Tree 把字符串当作渲染函数执行
export function moveTreeIconToIconName<T extends TreeIconRecord>(tree: T[]): T[] {
    return tree.map((node) => {
        const nextNode = {
            ...node,
            iconName: node.icon ?? node.iconName ?? null,
        };
        delete nextNode.icon;

        if (Array.isArray(node.children)) {
            nextNode.children = moveTreeIconToIconName(node.children);
        }

        return nextNode as T;
    });
}

// 校验菜单路径片段，目录和页面必须是不带斜杠的相对片段，按钮不参与路由拼接。
function resolveMenuFullPath(item: any, parentPath: string) {
    if (item.type === "Button") {
        return item.path ?? null;
    }

    if (typeof item.path !== "string" || item.path.trim().length === 0) {
        throw new Error(`菜单 ${item.requiredPermissionCode ?? item.id} 缺少路径片段`);
    }
    if (item.path.startsWith("/") || item.path.includes("//")) {
        throw new Error(
            `菜单 ${item.requiredPermissionCode ?? item.id} 的 path 必须是不带 / 的路径片段：${item.path}`,
        );
    }

    const prefix = parentPath === "" ? "" : parentPath;
    return `${prefix}/${item.path}`;
}

// 将树形结构转换为扁平化数据，并按父子关系生成最终绝对路由路径。
export function tree2flat(tree: any[], options?: CoverOptions) {
    let _tree = cloneDeep(tree);
    let flats: any[] = [];
    function coverChild(children: any[], parrentPath: string) {
        arrSort(children, options);
        children.forEach((child) => {
            const { children, ...item } = child;
            item.path = resolveMenuFullPath(item, parrentPath);
            flats.push(item);
            if (children && children.length >= 1) {
                coverChild(children, item.type === "Button" ? parrentPath : item.path);
            }
        });
    }
    coverChild(_tree, "");
    return flats;
}

// 将扁平菜单先构造成树，再输出已排序且带完整路径的扁平路由菜单。
export function flatOrder(flats: any[], options?: CoverOptions) {
    let tree = flat2treeByMap(flats, options);
    return tree2flat(tree, options);
}
