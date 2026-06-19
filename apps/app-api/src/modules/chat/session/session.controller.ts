/**
 * ChatSession Controller
 * 聊天会话管理控制器 - 处理会话 CRUD
 *
 * Requirements: 8-11
 */

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { SessionService } from './session.service';
import { CreateSessionDto, QuerySessionDto } from './dto/session-req.dto';
import { SessionResDto, SessionListResDto, DeleteSessionResDto } from './dto/session-res.dto';

@ApiTags('ChatSession')
@Controller('chat/session')
export class SessionController {
    constructor(private readonly sessionService: SessionService) {}

    /** 创建聊天会话 - 创建与指定角色的新聊天会话 */
    @Post()
    @ApiOkResByZod({
        summary: '创建聊天会话',
        description: '创建与指定角色的新聊天会话，自动快照用户名和角色',
        type: SessionResDto
    })
    async create(@Session() session: BetterAuthSession, @Body() dto: CreateSessionDto) {
        const result = await this.sessionService.create(session.user.id, dto);
        return result;
    }

    /** 获取会话列表 - 获取当前用户的聊天会话列表，支持分页和按角色筛选 */
    @Get()
    @ApiOkResByZod({
        summary: '获取会话列表',
        description: '获取当前用户的聊天会话列表，支持分页和按角色筛选',
        type: SessionListResDto
    })
    async findAll(@Session() session: BetterAuthSession, @Query() query: QuerySessionDto) {
        const result = await this.sessionService.findAll(session.user.id, query);
        return result;
    }

    /** 获取会话详情 - 获取指定会话的完整信息，包含关联的角色数据 */
    @Get(':id')
    @ApiOkResByZod({
        summary: '获取会话详情',
        description: '获取指定会话的完整信息，包含关联的角色数据',
        type: SessionResDto
    })
    async findOne(@Session() session: BetterAuthSession, @Param('id') id: string) {
        const result = await this.sessionService.findOne(session.user.id, id);
        return result;
    }

    /** 删除会话 - 删除指定会话及其所有关联消息 */
    @Post(':id/delete')
    @ApiOkResByZod({
        summary: '删除会话',
        description: '删除指定会话及其所有关联消息，只能删除自己拥有的会话',
        type: DeleteSessionResDto
    })
    async remove(@Session() session: BetterAuthSession, @Param('id') id: string) {
        await this.sessionService.remove(session.user.id, id);
        return { message: 'Session deleted successfully' };
    }
}
