import { Public } from '@app/common';
import { Controller, Get } from '@nestjs/common';
import { SatService } from './sat.service';

/**
 * SAT 模块控制器
 * 当前所有接口均为公开接口，不参与任何权限校验
 */
@Controller('sat')
export class SatController {
    constructor(private readonly satService: SatService) {}

    // 音频分割接口（公开接口）
    @Public()
    @Get('split_audio')
    splitAudio() {
        let options = {
            labelJsonPath: 'D:\\d\\dataset\\label.json',
            audioFilePath: 'D:\\d\\dataset\\asmr.mp3',
            outputDir: 'D:\\d\\dataset\\audio'
        };
        return this.satService.splitAudio(options);
    }
}
