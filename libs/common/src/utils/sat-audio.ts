import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'fs-extra';

type SatLogger = {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
};

export type SatSplitAudioOptions = {
    labelJsonPath: string;
    audioFilePath: string;
    outputDir: string;
};

type SatAnnotationValue = {
    start: number;
    end: number;
    labels?: string[];
    choices?: string[];
    text?: string[];
};

type SatAnnotationItem = {
    id: string;
    from_name: string;
    value: SatAnnotationValue;
};

type SatAnnotationTask = {
    annotations?: Array<{
        result?: SatAnnotationItem[];
    }>;
};

export type SatSegment = {
    id: string;
    start: number;
    end: number;
    tool: string[];
    action: string[];
    position: string[];
    strength: string[];
    texture: string[];
    description: string;
};

/**
 * 校验 SAT 切分所需的输入文件是否存在，避免在 ffmpeg 阶段才暴露路径错误。
 */
export async function assertSatInputFilesExist(options: SatSplitAudioOptions): Promise<void> {
    const labelExists = await fs.pathExists(options.labelJsonPath);
    if (!labelExists) {
        throw new Error(`SAT 标注文件不存在: ${options.labelJsonPath}`);
    }

    const audioExists = await fs.pathExists(options.audioFilePath);
    if (!audioExists) {
        throw new Error(`SAT 音频文件不存在: ${options.audioFilePath}`);
    }
}

/**
 * 从 Label Studio 风格的标注 JSON 中提取任务结果数组。
 */
function getSatAnnotationItems(annotationPayload: unknown): SatAnnotationItem[] {
    const annotationTask = (annotationPayload as SatAnnotationTask[])?.[0];
    const items = annotationTask?.annotations?.[0]?.result;
    if (!Array.isArray(items)) {
        throw new Error('SAT 标注数据格式不正确，缺少 annotations[0].result');
    }

    return items;
}

/**
 * 聚合同一 segment 的多条标注，输出统一的片段列表。
 */
export function aggregateSatSegmentsFromItems(items: SatAnnotationItem[]): SatSegment[] {
    const segmentsMap = new Map<string, SatSegment>();
    for (const item of items) {
        const key = item.id;
        const { start, end } = item.value;
        if (!segmentsMap.has(key)) {
            segmentsMap.set(key, {
                id: item.id,
                start,
                end,
                tool: [],
                action: [],
                position: [],
                strength: [],
                texture: [],
                description: ''
            });
        }

        const segment = segmentsMap.get(key)!;
        switch (item.from_name) {
            case 'tool':
                segment.tool.push(...(item.value.labels || []));
                break;
            case 'action':
                segment.action.push(...(item.value.labels || []));
                break;
            case 'position':
                segment.position.push(...(item.value.labels || []));
                break;
            case 'strength':
                segment.strength.push(...(item.value.choices || []));
                break;
            case 'texture':
                segment.texture.push(...(item.value.choices || []));
                break;
            case 'description':
                segment.description = (item.value.text || []).join(' ');
                break;
            default:
                // 非预期的标签来源先忽略，避免中断整批切分。
                break;
        }
    }

    return Array.from(segmentsMap.values());
}

/**
 * 读取原始标注文件，聚合片段后写出 aggregated_segments.json。
 */
export async function aggregateSatSegments(
    labelJsonPath: string,
    outputDir: string
): Promise<{ aggregatedSegmentsFilePath: string; segments: SatSegment[] }> {
    await fs.ensureDir(outputDir);
    const aggregatedSegmentsFilePath = path.join(outputDir, 'aggregated_segments.json');
    const annotationPayload = JSON.parse(await fs.readFile(labelJsonPath, 'utf8'));
    const segments = aggregateSatSegmentsFromItems(getSatAnnotationItems(annotationPayload));
    await fs.writeFile(aggregatedSegmentsFilePath, JSON.stringify(segments, null, 2), 'utf8');
    return {
        aggregatedSegmentsFilePath,
        segments
    };
}

/**
 * 生成 ffmpeg 切割单个音频片段所需的命令参数。
 */
export function buildFfmpegCutArgs(
    audioFilePath: string,
    outputPath: string,
    start: number,
    duration: number
): string[] {
    return [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        audioFilePath,
        '-ss',
        String(start),
        '-t',
        String(duration),
        '-vn',
        outputPath
    ];
}

/**
 * 调用系统 ffmpeg 切割单个音频片段，并把失败原因显式抛出。
 */
export async function runFfmpegAudioCut(
    audioFilePath: string,
    outputPath: string,
    start: number,
    duration: number
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const ffmpegProcess = spawn('ffmpeg', buildFfmpegCutArgs(audioFilePath, outputPath, start, duration), {
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let stderrOutput = '';

        ffmpegProcess.stderr?.on('data', (chunk) => {
            stderrOutput += chunk.toString();
        });

        ffmpegProcess.once('error', (error) => {
            const processError = error as NodeJS.ErrnoException;
            if (processError.code === 'ENOENT') {
                reject(new Error('未找到 ffmpeg 可执行文件，请先安装 ffmpeg 并确保命令已加入 PATH'));
                return;
            }

            reject(new Error(`执行 ffmpeg 失败: ${error.message}`));
        });

        ffmpegProcess.once('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            const normalizedStderr = stderrOutput.trim();
            reject(new Error(normalizedStderr || `ffmpeg 切割失败，退出码: ${String(code)}`));
        });
    });
}

/**
 * 为切分后的音频片段生成 metadata 文本文件。
 */
async function writeSatMetadataFile(splitAudioDir: string, outputFileName: string, segment: SatSegment): Promise<void> {
    const prompt = `tools: ${segment.tool.join('+')}, actions: ${segment.action.join('+')}, position: ${segment.position.join('+')}, strength: ${segment.strength.join('+')}`;
    const metadataPath = path.join(splitAudioDir, outputFileName.replace('.wav', '.TXT'));
    await fs.ensureDir(path.dirname(metadataPath));
    await fs.writeFile(metadataPath, prompt, 'utf8');
}

/**
 * 按聚合后的标注结果切分音频，并写出 metadata 文件。
 */
export async function splitSatAudio(options: SatSplitAudioOptions, logger: SatLogger): Promise<string> {
    await assertSatInputFilesExist(options);
    logger.debug('SAT splitAudio input', {
        audioFilePath: options.audioFilePath,
        labelJsonPath: options.labelJsonPath,
        outputDir: options.outputDir
    });

    const splitAudioDir = path.join(options.outputDir, 'split_audio');
    await fs.ensureDir(splitAudioDir);

    const { aggregatedSegmentsFilePath, segments } = await aggregateSatSegments(
        options.labelJsonPath,
        options.outputDir
    );
    logger.info('SAT 标注聚合完成', {
        aggregatedSegmentsFilePath,
        segmentCount: segments.length
    });

    for (const segment of segments) {
        const duration = segment.end - segment.start;
        if (duration <= 0) {
            throw new Error(`SAT 片段时长非法: segment=${segment.id}, start=${segment.start}, end=${segment.end}`);
        }

        const outputFileName = `cut_${segment.id}.wav`;
        const outputPath = path.join(splitAudioDir, outputFileName);
        await runFfmpegAudioCut(options.audioFilePath, outputPath, segment.start, duration);
        await writeSatMetadataFile(splitAudioDir, outputFileName, segment);

        logger.info('切割并生成 metadata', {
            outputFileName
        });
    }

    return '处理完成！';
}
