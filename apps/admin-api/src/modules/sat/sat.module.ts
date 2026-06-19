import { Module } from '@nestjs/common';
import { SatService } from './sat.service';
import { SatController } from './sat.controller';

@Module({
    controllers: [SatController],
    providers: [SatService]
})
export class SatModule {}
