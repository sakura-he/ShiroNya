/**
 * Character Controller
 * 角色卡管理控制器 - 处理角色卡 CRUD 和 V3 导入导出
 *
 * Requirements: 1-7
 */

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { CharacterService } from './character.service';
import { CreateCharacterDto, UpdateCharacterDto, QueryCharacterDto } from './dto/character-req.dto';
import {
    CharacterResDto,
    CharacterListDataDto,
    DeleteCharacterResDto,
    V3CharacterExportResDto
} from './dto/character-res.dto';
import type { V3CharacterCard } from './schemas/v3-character-card.schema';

@ApiTags('Character')
@Controller('character')
export class CharacterController {
    constructor(private readonly characterService: CharacterService) {}

    /** 创建角色卡 */
    @Post()
    @ApiOkResByZod({
        summary: '创建角色卡',
        description: '创建新的角色卡，支持简单字段或完整 V3 数据结构',
        type: CharacterResDto
    })
    async create(@Session() session: BetterAuthSession, @Body() dto: CreateCharacterDto) {
        const character = await this.characterService.create(session.user.id, dto);
        return character;
    }

    /** 获取角色卡列表 */
    @Get()
    @ApiOkResByZod({
        summary: '获取角色卡列表',
        description: '获取当前用户的角色卡列表，支持分页、搜索和标签筛选',
        type: CharacterListDataDto
    })
    async findAll(@Session() session: BetterAuthSession, @Query() query: QueryCharacterDto) {
        const result = await this.characterService.findAll(session.user.id, query);
        return result;
    }

    /** 获取角色卡详情 */
    @Get(':id')
    @ApiOkResByZod({
        summary: '获取角色卡详情',
        description: '获取指定角色卡的完整信息',
        type: CharacterResDto
    })
    async findOne(@Session() session: BetterAuthSession, @Param('id') id: string) {
        const character = await this.characterService.findOne(session.user.id, id);
        return character;
    }

    /** 更新角色卡 */
    @Post(':id/update')
    @ApiOkResByZod({
        summary: '更新角色卡',
        description: '更新指定角色卡的信息，只能更新自己拥有的角色卡',
        type: CharacterResDto
    })
    async update(@Session() session: BetterAuthSession, @Param('id') id: string, @Body() dto: UpdateCharacterDto) {
        const character = await this.characterService.update(session.user.id, id, dto);
        return character;
    }

    /** 删除角色卡 */
    @Post(':id/delete')
    @ApiOkResByZod({
        summary: '删除角色卡',
        description: '删除指定角色卡，只能删除自己拥有的角色卡',
        type: DeleteCharacterResDto
    })
    async remove(@Session() session: BetterAuthSession, @Param('id') id: string) {
        await this.characterService.remove(session.user.id, id);
        return { message: 'Character deleted successfully' };
    }

    /** 导入 V3 角色卡 */
    @Post('import')
    @ApiOkResByZod({
        summary: '导入 V3 角色卡',
        description: '从 V3 JSON 格式导入角色卡',
        type: CharacterResDto
    })
    async importV3(@Session() session: BetterAuthSession, @Body() v3Data: V3CharacterCard) {
        const character = await this.characterService.importV3(session.user.id, v3Data);
        return character;
    }

    /** 导出 V3 角色卡 */
    @Get(':id/export')
    @ApiOkResByZod({
        summary: '导出 V3 角色卡',
        description: '将角色卡导出为 V3 JSON 格式',
        type: V3CharacterExportResDto
    })
    async exportV3(@Session() session: BetterAuthSession, @Param('id') id: string) {
        const v3Card = await this.characterService.exportV3(session.user.id, id);
        return v3Card;
    }
}
