import type { Api as FormCreateApi } from "@form-create/arco-design";
import { nextTick } from "vue";

type ApiFieldErrors = Record<string, string[]>;

type ApiValidationErrorData = {
    formErrors?: unknown;
    fieldErrors?: unknown;
};

type ApiErrorBody = {
    data?: ApiValidationErrorData;
    message?: unknown;
    msg?: unknown;
    code?: unknown;
};

type FormCreateApiWithValidation = FormCreateApi & {
    getRule?: (field: string) => { wrap?: Record<string, unknown> };
    updateRule?: (field: string, rule: Record<string, unknown>) => void;
    sync?: (field: string) => void;
};

type ClearableFormInstance = { clearValidate?: (fields?: string | string[]) => void };

type FormCreateFormInstance = ClearableFormInstance & {
    proxy?: ClearableFormInstance;
    exposed?: ClearableFormInstance;
};

const formCreateServerErrorState = new WeakMap<object, Map<string, unknown>>();

function getApiErrorBody(error: unknown): ApiErrorBody {
    if (error && typeof error === "object" && "response" in error) {
        const response = (error as { response?: { data?: unknown } }).response;
        if (response?.data && typeof response.data === "object") {
            return response.data as ApiErrorBody;
        }
    }

    return error && typeof error === "object" ? (error as ApiErrorBody) : {};
}

function firstString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * 从后端 DTO 校验结构中提取第一条适合 toast 展示的错误文案。
 * fieldErrors 仍保留给表单字段回填使用，这里只负责全局提示的兜底文案。
 */
export function getApiErrorMessage(error: unknown, fallback = "请求失败"): string {
    const body = getApiErrorBody(error);
    const formErrors = body.data?.formErrors;

    if (Array.isArray(formErrors)) {
        const formMessage = formErrors.find((item) => firstString(item));
        if (formMessage) return formMessage;
    }

    const fieldErrors = getApiFieldErrors(error);
    const fieldMessage = Object.values(fieldErrors)
        .flat()
        .find((item) => firstString(item));
    if (fieldMessage) return fieldMessage;

    return firstString(body.message) ?? firstString(body.msg) ?? fallback;
}

/**
 * 读取后端 z.flattenError 返回的字段错误。
 * 返回值按字段名分组，方便调用方决定展示在 toast、表单项或其他 UI 中。
 */
export function getApiFieldErrors(error: unknown): ApiFieldErrors {
    const fieldErrors = getApiErrorBody(error).data?.fieldErrors;
    if (!fieldErrors || typeof fieldErrors !== "object" || Array.isArray(fieldErrors)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(fieldErrors)
            .map(([field, messages]) => {
                const normalizedMessages = Array.isArray(messages)
                    ? messages.filter(
                          (message): message is string => firstString(message) !== undefined,
                      )
                    : [];
                return normalizedMessages.length > 0 ? [field, normalizedMessages] : null;
            })
            .filter(Boolean) as Array<[string, string[]]>,
    );
}

/**
 * 清理 form-create 表单的校验展示状态，并保持字段为未校验的中性样式。
 *
 * @form-create/arco-design 3.2.41 的 api.clearValidateState() 会把字段状态写成 success，
 * 因此这里通过 form-create 暴露的 formEl() 调用底层 Arco Form.clearValidate()。
 */
export function clearFormCreateValidate(
    api: FormCreateApi | null,
    fields?: string | string[],
): void {
    const formEl = api?.formEl?.() as FormCreateFormInstance | undefined;
    const form = formEl && "clearValidate" in formEl ? formEl : (formEl?.proxy ?? formEl?.exposed);

    form?.clearValidate?.(fields);
}

/**
 * 把服务端 DTO 字段错误写回 form-create 字段项。
 * form-create 3.x 没有公开 setFieldError API，这里直接更新字段 FormItem 的 wrap 状态。
 */
export async function applyApiFieldErrorsToFormCreate(
    api: FormCreateApi | null,
    error: unknown,
): Promise<boolean> {
    const formCreateApi = api as FormCreateApiWithValidation | null;
    if (!formCreateApi?.getRule || !formCreateApi.updateRule) {
        return false;
    }

    const fieldEntries = Object.entries(getApiFieldErrors(error))
        .map(([field, messages]) => {
            const message = messages.join("；");
            return message ? [field, message] : null;
        })
        .filter(Boolean) as Array<[string, string]>;

    if (fieldEntries.length === 0) {
        return false;
    }

    clearApiFieldErrorsFromFormCreate(api);
    const state = new Map<string, unknown>();
    fieldEntries.forEach(([formField, message]) => {
        const currentRule = formCreateApi.getRule?.(formField);
        const originalWrap = currentRule?.wrap ? { ...currentRule.wrap } : undefined;
        state.set(formField, originalWrap);
        formCreateApi.updateRule?.(formField, {
            wrap: {
                ...(currentRule?.wrap ?? {}),
                validateStatus: "error",
                help: message,
            },
        });
        formCreateApi.sync?.(formField);
    });

    formCreateServerErrorState.set(api as object, state);
    await nextTick();
    return true;
}

/**
 * 清理由 applyApiFieldErrorsToFormCreate 写入的服务端字段错误。
 * 在重新提交、重新打开弹窗或重置表单时调用，避免服务端错误残留。
 */
export function clearApiFieldErrorsFromFormCreate(api: FormCreateApi | null): void {
    if (!api) return;
    const state = formCreateServerErrorState.get(api as object);
    const formCreateApi = api as FormCreateApiWithValidation;
    if (!state || !formCreateApi.updateRule) return;

    state.forEach((originalWrap, field) => {
        formCreateApi.updateRule?.(field, {
            wrap: originalWrap ?? {
                validateStatus: undefined,
                help: undefined,
            },
        });
        formCreateApi.sync?.(field);
    });
    formCreateServerErrorState.delete(api as object);
}
