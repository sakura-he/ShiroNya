import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig, Method } from "axios";
import { computed, reactive, ref } from "vue";

export type ApiTraceStatus = "pending" | "success" | "error";

export type SpiceDbDebugOperation = {
    operation: string;
    durationMs: number;
    count?: number;
    status: "success" | "error";
    errorCode?: string;
    nativeDebug?: unknown;
};

export type ApiTraceDebug = {
    http?: {
        serverDurationMs?: number;
    };
    spicedb?: {
        count: number;
        totalMs: number;
        operations: SpiceDbDebugOperation[];
    };
};

export type ApiTraceRecord = {
    id: string;
    method: string;
    url: string;
    status: ApiTraceStatus;
    startedAt: number;
    finishedAt?: number;
    clientDurationMs?: number;
    httpStatus?: number;
    bizCode?: number;
    message?: string;
    debug?: ApiTraceDebug;
    responseData?: unknown;
    error?: string;
    replayConfig: {
        url?: string;
        method?: Method | string;
        params?: unknown;
        data?: unknown;
    };
};

type TraceConfig = InternalAxiosRequestConfig & {
    __shiroApiTraceId?: string;
    __shiroApiTraceStartedAt?: number;
};

const MAX_RECORDS = 100;
const BACKEND_DEBUG_ENABLED_HEADER = "x-admin-api-devtools-enabled";

const records = ref<ApiTraceRecord[]>([]);
const activeRecordId = ref<string | null>(null);
const backendDebugEnabled = ref(false);

export const apiTraceState = reactive({
    records,
    activeRecordId,
    backendDebugEnabled,
    activeRecord: computed(
        () =>
            records.value.find((record) => record.id === activeRecordId.value) ??
            records.value[0] ??
            null,
    ),
    counts: computed(() => ({
        total: records.value.length,
        pending: records.value.filter((record) => record.status === "pending").length,
        success: records.value.filter((record) => record.status === "success").length,
        error: records.value.filter((record) => record.status === "error").length,
        spicedb: records.value.filter((record) => (record.debug?.spicedb?.count ?? 0) > 0).length,
    })),
});

export function prepareApiTrace(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    if (!backendDebugEnabled.value) {
        return config;
    }

    const traceConfig = config as TraceConfig;
    const traceId = createTraceId();
    const startedAt = performance.now();
    traceConfig.__shiroApiTraceId = traceId;
    traceConfig.__shiroApiTraceStartedAt = startedAt;
    traceConfig.headers.set("x-admin-api-devtools", "1");

    const record: ApiTraceRecord = {
        id: traceId,
        method: normalizeMethod(config.method),
        url: buildDisplayUrl(config),
        status: "pending",
        startedAt,
        replayConfig: {
            url: config.url,
            method: config.method,
            params: clonePlain(config.params),
            data: clonePlain(config.data),
        },
    };
    records.value = [record, ...records.value].slice(0, MAX_RECORDS);
    activeRecordId.value = activeRecordId.value ?? traceId;

    return config;
}

export function completeApiTrace(response: AxiosResponse): void {
    syncBackendDebugMode(response);
    const config = response.config as TraceConfig;
    updateRecord(config, {
        status: "success",
        httpStatus: response.status,
        bizCode: readBizCode(response.data),
        message: readMessage(response.data),
        debug: readDebug(response.data),
        responseData: readResponseData(response.data),
    });
}

export function failApiTrace(error: AxiosError | unknown): void {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
        syncBackendDebugMode(axiosError.response);
    }
    const config = axiosError.config as TraceConfig | undefined;
    if (!config) {
        return;
    }
    updateRecord(config, {
        status: "error",
        httpStatus: axiosError.response?.status,
        bizCode: readBizCode(axiosError.response?.data),
        message: readMessage(axiosError.response?.data),
        debug: readDebug(axiosError.response?.data),
        responseData: readResponseData(axiosError.response?.data),
        error: axiosError.message,
    });
}

export function clearApiTraceRecords(): void {
    records.value = [];
    activeRecordId.value = null;
}

export function selectApiTraceRecord(id: string): void {
    activeRecordId.value = id;
}

function updateRecord(config: TraceConfig, patch: Partial<ApiTraceRecord>): void {
    const traceId = config.__shiroApiTraceId;
    if (!traceId) {
        return;
    }

    const finishedAt = performance.now();
    records.value = records.value.map((record) => {
        if (record.id !== traceId) {
            return record;
        }

        return {
            ...record,
            ...patch,
            finishedAt,
            clientDurationMs: roundMs(
                finishedAt - (config.__shiroApiTraceStartedAt ?? record.startedAt),
            ),
        };
    });
}

function createTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMethod(method?: string): string {
    return (method || "GET").toUpperCase();
}

function buildDisplayUrl(config: InternalAxiosRequestConfig): string {
    const url = config.url || "";
    const params = stringifyParams(config.params);
    return params ? `${url}?${params}` : url;
}

function stringifyParams(params: unknown): string {
    if (!params) {
        return "";
    }

    if (typeof params === "string") {
        return params;
    }

    if (params instanceof URLSearchParams) {
        return params.toString();
    }

    if (typeof params !== "object") {
        return String(params);
    }

    try {
        const searchParams = new URLSearchParams();
        Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }

            if (Array.isArray(value)) {
                value.forEach((item) => searchParams.append(key, String(item)));
                return;
            }

            searchParams.append(
                key,
                typeof value === "object" ? JSON.stringify(value) : String(value),
            );
        });
        return searchParams.toString();
    } catch {
        return "";
    }
}

function readBizCode(value: unknown): number | undefined {
    return value &&
        typeof value === "object" &&
        typeof (value as { code?: unknown }).code === "number"
        ? (value as { code: number }).code
        : undefined;
}

function readMessage(value: unknown): string | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }

    const message =
        (value as { message?: unknown; msg?: unknown }).message ?? (value as { msg?: unknown }).msg;
    return typeof message === "string" ? message : undefined;
}

function readDebug(value: unknown): ApiTraceDebug | undefined {
    return value && typeof value === "object"
        ? ((value as { debug?: ApiTraceDebug }).debug ?? undefined)
        : undefined;
}

function readResponseData(value: unknown): unknown {
    return value && typeof value === "object" && "data" in value
        ? (value as { data?: unknown }).data
        : value;
}

function clonePlain(value: unknown): unknown {
    if (value === undefined || value === null) {
        return value;
    }

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function roundMs(value: number): number {
    return Math.round(value * 100) / 100;
}

function syncBackendDebugMode(response: Pick<AxiosResponse, "headers">): void {
    const headerValue = readHeader(response.headers[BACKEND_DEBUG_ENABLED_HEADER]);
    backendDebugEnabled.value = headerValue === "1" || headerValue?.toLowerCase() === "true";
}

function readHeader(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return typeof value[0] === "string" ? value[0] : undefined;
    }
    return typeof value === "string" ? value : undefined;
}
