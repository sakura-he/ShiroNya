type CorsOriginCallback = (error: Error | null, allow?: boolean | string) => void;

export type CorsOriginResolver = (origin: string | undefined, callback: CorsOriginCallback) => void;

export type CorsOriginResolverOptions = {
    allowRequestsWithoutOrigin?: boolean;
};

function stripWrappingQuotes(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }

    return value;
}

function splitCorsOrigins(rawOrigins: string | readonly string[]): string[] {
    const values = typeof rawOrigins === 'string' ? rawOrigins.split(',') : rawOrigins;

    return values.map((item) => stripWrappingQuotes(item.trim())).filter((item) => item.length > 0);
}

function normalizeOrigin(value: string): string {
    const trimmed = stripWrappingQuotes(value.trim());

    if (/^https?:\/\//i.test(trimmed) && !trimmed.includes('*')) {
        try {
            return new URL(trimmed).origin;
        } catch {
            return trimmed.replace(/\/+$/, '');
        }
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/\/+$/, '').toLowerCase();
    }

    return trimmed;
}

function escapeRegExp(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function wildcardPatternToRegExp(pattern: string): RegExp {
    const normalizedPattern = normalizeOrigin(pattern);
    const source = normalizedPattern
        .split('*')
        .map((part) => escapeRegExp(part))
        .join('.*');

    return new RegExp(`^${source}$`, /^https?:\/\//i.test(normalizedPattern) ? 'i' : undefined);
}

/**
 * Builds a Nest/Express CORS origin resolver from comma-separated env values.
 *
 * Supported forms:
 * - Exact origins: https://admin.example.com
 * - Wildcard subdomains/ports: https://*.admin.example.com, http://127.0.0.1:*
 * - Custom scheme wildcards for native tooling: exp://*
 */
export function createCorsOriginResolver(
    rawOrigins: string | readonly string[],
    options: CorsOriginResolverOptions = {}
): CorsOriginResolver {
    const entries = splitCorsOrigins(rawOrigins);
    const allowAnyOrigin = entries.includes('*');
    const exactOrigins = new Set(
        entries.filter((entry) => entry !== '*' && !entry.includes('*')).map((entry) => normalizeOrigin(entry))
    );
    const wildcardOrigins = entries
        .filter((entry) => entry !== '*' && entry.includes('*'))
        .map((entry) => wildcardPatternToRegExp(entry));
    const allowRequestsWithoutOrigin = options.allowRequestsWithoutOrigin ?? true;

    return (origin, callback) => {
        if (!origin) {
            callback(null, allowRequestsWithoutOrigin);
            return;
        }

        const normalizedOrigin = normalizeOrigin(origin);
        const allowed =
            allowAnyOrigin ||
            exactOrigins.has(normalizedOrigin) ||
            wildcardOrigins.some((pattern) => pattern.test(normalizedOrigin));

        callback(null, allowed);
    };
}
