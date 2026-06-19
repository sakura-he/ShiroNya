import { createRuntimeLogger, splitSatAudio } from '@app/common';
import { Injectable } from '@nestjs/common';
import { SplitAudioDto } from './dto/sat.dto';
@Injectable()
export class SatService {
    private readonly logger = createRuntimeLogger(SatService.name, {
        module: 'sat',
        domain: 'sat',
        resource: { type: 'sat' }
    });

    /** 按标注信息切分音频并生成对应 metadata 文件。 */
    splitAudio(options: SplitAudioDto) {
        splitSatAudio(options, this.logger)
            .then((result) => {
                this.logger.info.title('SAT 音频切割完成', {
                    result
                });
            })
            .catch((error) => {
                // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 SAT 音频切割失败
                this.logger.error('SAT 音频切割失败', {
                    error
                });
            });
    }
}
