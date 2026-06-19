/**
 * Character Module
 * 角色卡管理模块
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '@app/mongodb/schemas/character.schema';
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';

@Module({
    imports: [MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }])],
    controllers: [CharacterController],
    providers: [CharacterService],
    exports: [CharacterService]
})
export class CharacterModule {}
