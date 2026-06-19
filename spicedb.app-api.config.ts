import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { defineConfig } from '@spicedb-toolkit/core';

function loadProjectEnvFiles() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const envFilePaths = [path.resolve(process.cwd(), `.env.${nodeEnv}`), path.resolve(process.cwd(), '.env')];

    for (const envFilePath of envFilePaths) {
        if (!fs.existsSync(envFilePath)) {
            continue;
        }

        loadDotEnv({
            path: envFilePath,
            override: false
        });
    }
}

function getEnvOrThrow(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`缺少必填的 app-api SpiceDB 环境变量：${name}`);
    }

    return value;
}

function readOptionalFileFromEnv(name: string) {
    const rawPath = process.env[name];
    if (!rawPath) {
        return undefined;
    }

    const filePath = path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`app-api SpiceDB 可选证书文件不存在：${filePath}`);
    }

    return fs.readFileSync(filePath);
}

loadProjectEnvFiles();

export default defineConfig({
    client: {
        endpoint: getEnvOrThrow('APP_SPICEDB_ENDPOINT'),
        token: getEnvOrThrow('APP_SPICEDB_TOKEN'),
        insecure: getEnvOrThrow('APP_SPICEDB_INSECURE') === 'true',
        tlsCert: readOptionalFileFromEnv('APP_SPICEDB_TLS_CA_PATH')
    },
    schema: {
        entry: path.resolve(process.cwd(), 'spicedb/schema.zed'),
        parser: 'official'
    },
    cli: {
        zedBinary: process.env.APP_SPICEDB_ZED_BINARY || process.env.SPICEDB_TOOLKIT_ZED_BINARY
    },
    nestjs: {
        defaultGuardBehavior: 'throw'
    }
});
