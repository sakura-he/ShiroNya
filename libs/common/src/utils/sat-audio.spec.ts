import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { aggregateSatSegments, aggregateSatSegmentsFromItems, buildFfmpegCutArgs, type SatSegment } from './sat-audio';

describe('sat audio utils', () => {
    /**
     * 验证 ffmpeg 参数构造是否稳定，避免命令顺序漂移导致切割行为变化。
     */
    it('should build deterministic ffmpeg cut args', () => {
        expect(buildFfmpegCutArgs('input.mp3', 'output.wav', 1.25, 3.5)).toEqual([
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            'input.mp3',
            '-ss',
            '1.25',
            '-t',
            '3.5',
            '-vn',
            'output.wav'
        ]);
    });

    /**
     * 验证聚合逻辑会把同一 segment 的多条标注合并，并写出聚合文件。
     */
    it('should aggregate sat segments and persist aggregated json', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-api-sat-'));
        const labelJsonPath = path.join(tempDir, 'label.json');
        const annotationPayload = [
            {
                annotations: [
                    {
                        result: [
                            {
                                id: 'seg_1',
                                from_name: 'tool',
                                value: { start: 0, end: 2, labels: ['brush'] }
                            },
                            {
                                id: 'seg_1',
                                from_name: 'action',
                                value: { start: 0, end: 2, labels: ['tap'] }
                            },
                            {
                                id: 'seg_1',
                                from_name: 'description',
                                value: { start: 0, end: 2, text: ['soft', 'sound'] }
                            },
                            {
                                id: 'seg_2',
                                from_name: 'strength',
                                value: { start: 2, end: 4, choices: ['medium'] }
                            }
                        ]
                    }
                ]
            }
        ];
        fs.writeFileSync(labelJsonPath, JSON.stringify(annotationPayload), 'utf8');

        const { aggregatedSegmentsFilePath, segments } = await aggregateSatSegments(labelJsonPath, tempDir);
        const persistedSegments = JSON.parse(fs.readFileSync(aggregatedSegmentsFilePath, 'utf8')) as SatSegment[];

        expect(segments).toEqual([
            {
                id: 'seg_1',
                start: 0,
                end: 2,
                tool: ['brush'],
                action: ['tap'],
                position: [],
                strength: [],
                texture: [],
                description: 'soft sound'
            },
            {
                id: 'seg_2',
                start: 2,
                end: 4,
                tool: [],
                action: [],
                position: [],
                strength: ['medium'],
                texture: [],
                description: ''
            }
        ]);
        expect(persistedSegments).toEqual(segments);
    });

    /**
     * 验证未知标签来源不会打断聚合，避免存量异常数据导致整个任务失败。
     */
    it('should ignore unknown from_name when aggregating items', () => {
        expect(
            aggregateSatSegmentsFromItems([
                {
                    id: 'seg_1',
                    from_name: 'unknown',
                    value: { start: 1, end: 3 }
                }
            ])
        ).toEqual([
            {
                id: 'seg_1',
                start: 1,
                end: 3,
                tool: [],
                action: [],
                position: [],
                strength: [],
                texture: [],
                description: ''
            }
        ]);
    });
});
