import * as crypto from 'node:crypto';
export function md5(str: string) {
    return crypto.createHash('md5').update(str).digest('hex');
}
export function isUndefined(value: any): value is undefined {
    return value === undefined;
}
export function isNull(value: any): value is null {
    return value === null;
}
export function isEmpty(value: any): value is '' | undefined | null {
    return value === '' || isUndefined(value) || isNull(value);
}
