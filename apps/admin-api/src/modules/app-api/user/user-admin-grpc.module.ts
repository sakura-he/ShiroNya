import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import {
    APP_USER_ADMIN_GRPC_LOADER_OPTIONS,
    APP_USER_ADMIN_GRPC_PACKAGE,
    resolveAppUserAdminProtoPath
} from '@app/common';
import { ChannelCredentials } from '@grpc/grpc-js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { USER_ADMIN_GRPC_CLIENT } from './user-admin.tokens';
import { UserAdminGrpcClient } from './user-admin.grpc-client';

function resolveConfigPath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function resolveTargetHost(config: ConfigService): string {
    const configuredHost =
        config.get<string>('APP_USER_ADMIN_GRPC_CLIENT_HOST') ||
        config.get<string>('APP_USER_ADMIN_GRPC_HOST') ||
        '127.0.0.1';
    const host = configuredHost.trim();

    if (host === '0.0.0.0' || host === '::' || host === '[::]') {
        return '127.0.0.1';
    }

    return host;
}

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: USER_ADMIN_GRPC_CLIENT,
                imports: [ConfigModule],
                inject: [ConfigService],
                useFactory: (config: ConfigService) => {
                    const host = resolveTargetHost(config);
                    const port = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_PORT');
                    const caPath = resolveConfigPath(
                        config.get<string>('APP_USER_ADMIN_GRPC_TLS_CA_PATH') ||
                            'docker/config/app-user-admin-grpc/tls/ca.crt'
                    );
                    const clientCertPath = resolveConfigPath(
                        config.get<string>('APP_USER_ADMIN_GRPC_TLS_CLIENT_CERT_PATH') ||
                            'docker/config/app-user-admin-grpc/tls/client.crt'
                    );
                    const clientKeyPath = resolveConfigPath(
                        config.get<string>('APP_USER_ADMIN_GRPC_TLS_CLIENT_KEY_PATH') ||
                            'docker/config/app-user-admin-grpc/tls/client.key'
                    );
                    const tlsServerName = config.get<string>('APP_USER_ADMIN_GRPC_TLS_SERVER_NAME')?.trim();

                    return {
                        transport: Transport.GRPC,
                        options: {
                            package: APP_USER_ADMIN_GRPC_PACKAGE,
                            protoPath: resolveAppUserAdminProtoPath(),
                            url: `${host}:${port}`,
                            loader: APP_USER_ADMIN_GRPC_LOADER_OPTIONS,
                            credentials: ChannelCredentials.createSsl(
                                readFileSync(caPath),
                                readFileSync(clientKeyPath),
                                readFileSync(clientCertPath)
                            ),
                            ...(tlsServerName
                                ? {
                                      channelOptions: {
                                          'grpc.ssl_target_name_override': tlsServerName,
                                          'grpc.default_authority': tlsServerName
                                      }
                                  }
                                : {})
                        }
                    };
                }
            }
        ])
    ],
    providers: [UserAdminGrpcClient],
    exports: [UserAdminGrpcClient]
})
export class UserAdminGrpcModule {}
