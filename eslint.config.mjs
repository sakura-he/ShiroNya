import tsParser from '@typescript-eslint/parser';

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'coverage/**',
            'backup/**',
            '.tmp/**',
            'apps/**/dist/**',
            'libs/prisma-admin/src/generated/**',
            'libs/prisma-app/src/generated/**'
        ]
    },
    {
        files: ['apps/**/*.ts', 'libs/**/*.ts', 'scripts/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            }
        },
        rules: {}
    }
];
