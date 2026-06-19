import fs from 'fs-extra';
import forge from 'node-forge';
import nodePath from 'node:path';

import type { DeployConfig } from '../../core/types.ts';

/**
 * 文件作用：
 * 这个模块负责为部署目录生成本地 TLS 证书。
 *
 * 这些证书主要用于容器之间的安全通信，例如：
 * - admin-api 调用 app-api 的 gRPC 管理接口。
 * - API 服务访问 Cerbos。
 *
 * 设计原则：
 * - 如果证书目录已经完整存在，默认不覆盖，避免每次部署都让服务证书变化。
 * - 如果需要强制重新生成，设置环境变量 `SHIRO_NYA_REGENERATE_CERTS=1`。
 */

type CertificateSet = {
    caCommonName: string;
    clientCommonName: string;
    output: string;
    serverCommonName: string;
    serverDnsNames: string[];
    serverIpAddresses: string[];
};

type KeyPair = forge.pki.rsa.KeyPair;
type CertificateLogger = (source: string, message: string) => Promise<void>;

const requiredCertificateFiles = ['ca.crt', 'ca.key', 'server.crt', 'server.key', 'client.crt', 'client.key'];
const noopLogger: CertificateLogger = async () => undefined;

/** 判断一个证书目录是否已经具备 CA、服务端、客户端三组证书和私钥。 */
function certDirComplete(certDir: string): boolean {
    // every 表示 requiredCertificateFiles 里的每个文件都存在才算完整。
    // 只缺一个文件也会返回 false，并触发整套证书重新生成。
    return requiredCertificateFiles.every((file) => fs.existsSync(nodePath.join(certDir, file)));
}

/**
 * 生成证书序列号。
 *
 * 证书序列号需要是正整数，不能是空值。
 * X.509 serialNumber 是 ASN.1 INTEGER：
 * - 如果最高位是 1，一些 Go 版本会把它当作负数并拒绝加载证书。
 * - 所以这里把第一个字节强制压到 0x01~0x7f，保证整数一定是正数。
 * - `replace(/^00+/, '')` 仍然保留，用于去掉理论上的多余前导 00。
 */
function createSerialNumber(): string {
    // 生成 16 字节随机数，作为证书序列号的随机来源。
    const bytes = forge.util.createBuffer(forge.random.getBytesSync(16));
    const firstByte = bytes.at(0);
    // `(firstByte & 0x7f) || 0x01` 的含义：
    // - `& 0x7f` 会把最高位清零，避免 ASN.1 INTEGER 被解析成负数。
    // - `|| 0x01` 避免第一个字节变成 0，减少前导 0 造成的歧义。
    bytes.setAt(0, (firstByte & 0x7f) || 0x01);

    // 转成十六进制字符串，便于写入 X.509 证书 serialNumber 字段。
    const hex = forge.util.bytesToHex(bytes.getBytes());

    // 去掉开头连续的 00，避免序列号被解释成带多余前导 0 的值。
    return hex.replace(/^00+/, '') || '01';
}

/** 构造证书 Subject/Issuer 中的 commonName 字段。 */
function createSubject(commonName: string): forge.pki.CertificateField[] {
    return [{ name: 'commonName', value: commonName }];
}

/**
 * 把 RSA 私钥转成 PKCS#8 PEM 文本。
 *
 * node-forge 默认可导出 RSA 私钥 ASN.1，这里再包一层 privateKeyInfo，
 * 是为了生成更通用的 `-----BEGIN PRIVATE KEY-----` 格式。
 */
function createPrivateKeyPem(key: forge.pki.rsa.PrivateKey): string {
    // RSA 私钥先转 ASN.1 结构，这是底层二进制证书/密钥格式的对象表示。
    const rsaPrivateKey = forge.pki.privateKeyToAsn1(key);

    // wrapRsaPrivateKey 会把 RSA 私钥包装成 PKCS#8 PrivateKeyInfo。
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKey);

    // 最后输出 PEM 文本，方便 nginx、Cerbos、Node.js TLS 直接读取。
    return forge.pki.privateKeyInfoToPem(privateKeyInfo);
}

/**
 * 生成 4096 位 RSA 密钥对。
 *
 * `workers: 2` 表示让 node-forge 使用两个工作线程做大整数计算。
 * RSA 4096 生成较慢，但部署时只在缺证书或强制重生成时执行。
 */
function generateRsaKeyPair(): Promise<KeyPair> {
    return new Promise((resolve, reject) => {
        // node-forge 的 generateKeyPair 是回调式 API，这里包成 Promise，方便 async/await 调用。
        forge.pki.rsa.generateKeyPair({ bits: 4096, workers: 2 }, (error, keyPair) => {
            if (error) {
                // 生成失败时 reject，调用方会进入部署错误处理流程。
                reject(error);
                return;
            }

            // 生成成功后返回 publicKey/privateKey。
            resolve(keyPair);
        });
    });
}

/**
 * 创建自签名 CA 证书。
 *
 * CA 是后续 server/client 证书的签发者：
 * - `setSubject` 和 `setIssuer` 都是同一个 commonName，所以它是自签名证书。
 * - `basicConstraints cA: true` 表示它可以签发下级证书。
 * - `keyCertSign` / `cRLSign` 表示允许签证书和签吊销列表。
 */
async function createCertificateAuthority(
    commonName: string,
    validYears: number
): Promise<{ cert: forge.pki.Certificate; keys: KeyPair }> {
    // 每个 CA 都有自己独立的密钥对，不能和 server/client 共用。
    const keys = await generateRsaKeyPair();

    // createCertificate 创建一个空证书对象，下面逐项填入公钥、序列号、有效期、扩展等字段。
    const cert = forge.pki.createCertificate();
    const now = new Date();

    // CA 证书里的公钥来自刚生成的 CA 密钥对。
    cert.publicKey = keys.publicKey;
    cert.serialNumber = createSerialNumber();

    // notBefore 往前拨 24 小时，避免机器时间略有偏差时出现“证书尚未生效”。
    cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now);

    // CA 有效期比 leaf 证书长，减少重复生成整套证书的频率。
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + validYears);

    // 自签 CA 的 subject 和 issuer 相同。
    cert.setSubject(createSubject(commonName));
    cert.setIssuer(createSubject(commonName));
    cert.setExtensions([
        // basicConstraints cA=true 告诉 TLS 库：这个证书可以作为 CA。
        { cA: true, critical: true, name: 'basicConstraints' },
        // keyUsage 限制 CA 私钥用途，只允许签证书和签吊销列表。
        { cRLSign: true, critical: true, keyCertSign: true, name: 'keyUsage' },
        { name: 'subjectKeyIdentifier' }
    ]);
    // 使用 CA 自己的私钥签名，所以这是自签证书。
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return { cert, keys };
}

/**
 * 创建由 CA 签名的服务端或客户端证书。
 *
 * usage 参数决定证书用途：
 * - `server`：添加 serverAuth，供服务端在 TLS 握手时证明身份。
 * - `client`：添加 clientAuth，供客户端在双向 TLS 场景证明身份。
 *
 * subjectAltName 说明：
 * - DNS 名称使用 type=2。
 * - IP 地址使用 type=7。
 * - 如果服务通过 Docker service name 访问，就必须把 service name 写进 DNS SAN。
 */
async function createSignedLeafCertificate(
    commonName: string,
    authority: { cert: forge.pki.Certificate; keys: KeyPair },
    usage: 'server' | 'client',
    options: {
        dnsNames?: string[];
        ipAddresses?: string[];
        validYears: number;
    }
): Promise<{ cert: forge.pki.Certificate; keys: KeyPair }> {
    // leaf 证书也生成独立密钥对，避免多个服务共享同一把私钥。
    const keys = await generateRsaKeyPair();
    const cert = forge.pki.createCertificate();
    const now = new Date();

    // SAN 列表用于告诉客户端“哪些 DNS 名称/IP 可以匹配这张证书”。
    const altNames = [
        // type=2 是 DNSName，例如 app-api、admin-api-cerbos。
        ...(options.dnsNames ?? []).map((value) => ({ type: 2, value })),
        // type=7 是 IPAddress，例如 127.0.0.1 或宿主机局域网 IP。
        ...(options.ipAddresses ?? []).map((ip) => ({ ip, type: 7 }))
    ];

    cert.publicKey = keys.publicKey;
    cert.serialNumber = createSerialNumber();
    cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now);
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + options.validYears);
    cert.setSubject(createSubject(commonName));

    // leaf 证书的 issuer 必须是 CA 的 subject，表示它由这张 CA 签发。
    cert.setIssuer(authority.cert.subject.attributes);
    cert.setExtensions([
        // leaf 证书不能继续签发下级证书，所以 cA=false。
        { cA: false, critical: true, name: 'basicConstraints' },
        // digitalSignature/keyEncipherment 是 TLS 服务端/客户端证书常见用途。
        { critical: true, digitalSignature: true, keyEncipherment: true, name: 'keyUsage' },
        usage === 'server'
            // serverAuth 表示服务端证书；clientAuth 表示客户端证书。
            ? { name: 'extKeyUsage', serverAuth: true }
            : { clientAuth: true, name: 'extKeyUsage' },
        // altNames 为空时不写 subjectAltName，避免生成空扩展。
        ...(altNames.length ? [{ altNames, name: 'subjectAltName' }] : []),
        { name: 'subjectKeyIdentifier' }
    ]);
    // leaf 证书用 CA 私钥签名，客户端只要信任 ca.crt 就能验证它。
    cert.sign(authority.keys.privateKey, forge.md.sha256.create());

    return { cert, keys };
}

/**
 * 写 PEM 文件并尽量设置权限。
 *
 * 权限数字说明：
 * - `0o644`：所有人可读，只有 owner 可写，适合 `.crt` 公钥证书。
 * - `0o600`：只有 owner 可读写，适合 `.key` 私钥文件。
 * - 前缀 `0o` 表示八进制数字，这是 Unix 文件权限常用写法。
 *
 * Windows 对 chmod 支持有限，所以失败时吞掉错误，不影响部署继续。
 */
async function writePemFile(filePath: string, text: string, mode: number): Promise<void> {
    // PEM 是 ASCII 文本格式，用 ascii 写入可以避免编码转换带来不可见字符。
    await fs.writeFile(filePath, text, 'ascii');

    // chmod 在 Windows 上可能无效，catch 后忽略是为了保持跨平台可运行。
    await fs.chmod(filePath, mode).catch(() => undefined);
}

/**
 * 生成一整套 CA/server/client 证书文件。
 *
 * 每个证书目录会得到：
 * - ca.crt / ca.key：签发者证书和私钥。
 * - server.crt / server.key：服务端证书和私钥。
 * - client.crt / client.key：客户端证书和私钥。
 */
async function generateCertificateSet(certSet: CertificateSet): Promise<void> {
    // 先确保输出目录存在，后续 ca/server/client 文件都会写到这里。
    await fs.ensureDir(certSet.output);

    // 生成 CA，再用 CA 分别签发 server 和 client 证书。
    const authority = await createCertificateAuthority(certSet.caCommonName, 10);
    const server = await createSignedLeafCertificate(certSet.serverCommonName, authority, 'server', {
        dnsNames: certSet.serverDnsNames,
        ipAddresses: certSet.serverIpAddresses,
        validYears: 5
    });
    const client = await createSignedLeafCertificate(certSet.clientCommonName, authority, 'client', {
        validYears: 5
    });

    // .crt 是证书公钥部分，权限可宽一些；.key 是私钥，权限必须尽量收紧。
    await writePemFile(nodePath.join(certSet.output, 'ca.crt'), forge.pki.certificateToPem(authority.cert), 0o644);
    await writePemFile(nodePath.join(certSet.output, 'ca.key'), createPrivateKeyPem(authority.keys.privateKey), 0o600);
    await writePemFile(nodePath.join(certSet.output, 'server.crt'), forge.pki.certificateToPem(server.cert), 0o644);
    await writePemFile(nodePath.join(certSet.output, 'server.key'), createPrivateKeyPem(server.keys.privateKey), 0o600);
    await writePemFile(nodePath.join(certSet.output, 'client.crt'), forge.pki.certificateToPem(client.cert), 0o644);
    await writePemFile(nodePath.join(certSet.output, 'client.key'), createPrivateKeyPem(client.keys.privateKey), 0o600);
}

/**
 * 确保部署所需的所有 TLS 证书存在。
 *
 * 这里定义了三套证书：
 * 1. app-user-admin-grpc：admin-api 调用 app-api 管理 gRPC。
 * 2. app-api-cerbos：app-api 访问自己的 Cerbos。
 * 3. admin-api-cerbos：admin-api 访问自己的 Cerbos。
 *
 * Loki/Promtail/Grafana 在同一个 Docker 内部网络里使用 HTTP 通信，不再为开源本地部署生成 Loki mTLS 证书。
 */
export async function ensureDeploymentCertificates(
    config: DeployConfig,
    logMessage: CertificateLogger = noopLogger
): Promise<void> {
    // 证书都生成到目标 docker/config 目录下，和 compose 挂载路径保持一致。
    const certRoot = nodePath.join(config.targetDockerDir, 'config');

    // 设置 SHIRO_NYA_REGENERATE_CERTS=1 时，即使证书文件齐全也重新生成。
    const regenerate = process.env.SHIRO_NYA_REGENERATE_CERTS === '1';
    const certSets: CertificateSet[] = [
        {
            // admin-api 作为客户端访问 app-api 暴露的管理 gRPC 时使用这套证书。
            caCommonName: 'AppUserAdmin gRPC CA',
            clientCommonName: 'admin-api-app-user-client',
            output: nodePath.join(certRoot, 'app-user-admin-grpc', 'tls'),
            serverCommonName: 'app-api',
            // app-api 和 app-user-admin-grpc 是 Docker 网络里的服务名，必须写进 DNS SAN。
            serverDnsNames: ['app-api', 'app-user-admin-grpc'],
            serverIpAddresses: ['127.0.0.1']
        },
        {
            // app-api 访问 app-api-cerbos / app-api-cerbos-grpc-proxy 时使用这套证书。
            caCommonName: 'Cerbos TLS CA',
            clientCommonName: 'cerbos-client',
            output: nodePath.join(certRoot, 'app-api-cerbos', 'tls'),
            serverCommonName: 'cerbos-server',
            serverDnsNames: ['cerbos-server', 'app-api-cerbos', 'app-api-cerbos-grpc-proxy'],
            serverIpAddresses: config.certServerIps
        },
        {
            // admin-api 访问 admin-api-cerbos / admin-api-cerbos-grpc-proxy 时使用这套证书。
            caCommonName: 'Admin Cerbos TLS CA',
            clientCommonName: 'admin-cerbos-client',
            output: nodePath.join(certRoot, 'admin-api-cerbos', 'tls'),
            serverCommonName: 'admin-cerbos-server',
            serverDnsNames: ['admin-cerbos-server', 'admin-api-cerbos', 'admin-api-cerbos-grpc-proxy'],
            serverIpAddresses: config.certServerIps
        }
    ];

    for (const certSet of certSets) {
        // 默认策略是“目录完整就复用”，这样服务端证书不会因为重复部署而频繁变化。
        if (!regenerate && certDirComplete(certSet.output)) {
            await logMessage('tls certs', `证书已存在，跳过生成: ${certSet.output}`);
            continue;
        }

        // 证书不存在、不完整，或显式要求重生成时，才会进入这里。
        await logMessage('tls certs', `生成证书: ${certSet.output}`);
        await generateCertificateSet(certSet);
    }
}
