import { createCorsOriginResolver } from './cors-origin';

function resolveOrigin(rawOrigins: string, origin?: string): boolean | string | undefined {
    const resolver = createCorsOriginResolver(rawOrigins);
    let result: boolean | string | undefined;

    resolver(origin, (error, allow) => {
        if (error) {
            throw error;
        }

        result = allow;
    });

    return result;
}

describe('createCorsOriginResolver', () => {
    it('allows exact origins and normalizes trailing slashes', () => {
        expect(resolveOrigin('https://admin.example.com/', 'https://admin.example.com')).toBe(true);
    });

    it('allows wildcard subdomains', () => {
        expect(
            resolveOrigin(
                'https://admin.example.com,https://*.admin.example.com',
                'https://ops.admin.example.com'
            )
        ).toBe(true);
    });

    it('does not allow parent domains for subdomain wildcards', () => {
        expect(resolveOrigin('https://*.admin.example.com', 'https://admin.example.com')).toBe(
            false
        );
    });

    it('allows wildcard ports', () => {
        expect(resolveOrigin('http://127.0.0.1:*', 'http://127.0.0.1:57301')).toBe(true);
    });

    it('allows custom scheme wildcards', () => {
        expect(resolveOrigin('mimiapp://,exp://*', 'exp://127.0.0.1:8081')).toBe(true);
    });

    it('allows requests without origin by default', () => {
        expect(resolveOrigin('https://admin.example.com')).toBe(true);
    });

    it('blocks unlisted origins', () => {
        expect(resolveOrigin('https://admin.example.com', 'https://evil.example.com')).toBe(false);
    });
});
