import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import { defineConfig } from '@spicedb-toolkit/core';

/** 按项目约定优先加载环境专属配置，再回填基础 `.env`，保证 CLI 与 Nest 共用同一套 SpiceDB 环境变量。 */
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

/** 读取必填环境变量，避免启动后才因为缺少 SpiceDB 配置而出现隐式失败。 */
function getEnvOrThrow(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`缺少必填的 SpiceDB 环境变量：${name}`);
    }

    return value;
}

/** 读取可选 CA 证书；本地开发默认使用明文连接，因此允许留空。 */
function readOptionalFileFromEnv(name: string) {
    const rawPath = process.env[name];
    if (!rawPath) {
        return undefined;
    }

    const filePath = path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`SpiceDB 可选证书文件不存在：${filePath}`);
    }

    return fs.readFileSync(filePath);
}

loadProjectEnvFiles();

export default defineConfig({
    client: {
        endpoint: getEnvOrThrow('ADMIN_SPICEDB_ENDPOINT'),
        token: getEnvOrThrow('ADMIN_SPICEDB_TOKEN'),
        insecure: getEnvOrThrow('ADMIN_SPICEDB_INSECURE') === 'true',
        tlsCert: readOptionalFileFromEnv('ADMIN_SPICEDB_TLS_CA_PATH')
    },
    schema: {
        entry: path.resolve(process.cwd(), 'spicedb/schema.zed'),
        parser: 'official'
    },
    cli: {
        zedBinary: process.env.ADMIN_SPICEDB_ZED_BINARY || process.env.SPICEDB_TOOLKIT_ZED_BINARY
    },
    nestjs: {
        defaultGuardBehavior: 'throw'
    }
});
