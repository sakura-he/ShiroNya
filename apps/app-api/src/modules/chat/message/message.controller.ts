/**
 * ChatMessage Controller
 * 聊天消息管理控制器 - 处理消息发送和 AI 回复管理
 *
 * Requirements: 12-15
 */

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { MessageService } from './message.service';
import { SendMessageDto, QueryMessageDto, SwitchSwipeDto, RegenerateMessageDto } from './dto/message-req.dto';
import { MessageResDto, MessageListResDto } from './dto/message-res.dto';

@ApiTags('ChatMessage')
@Controller('chat/message')
export class MessageController {
    constructor(private readonly messageService: MessageService) {}

    /** 发送消息 - 在指定会话中发送用户消息 */
    @Post()
    @ApiOkResByZod({ summary: '发送消息', description: '在指定会话中发送用户消息', type: MessageResDto })
    async send(@Session() session: BetterAuthSession, @Body() dto: SendMessageDto) {
        const message = await this.messageService.send(session.user.id, dto);
        return message;
    }

    /** 获取会话消息 - 支持游标分页 */
    @Get(':sessionId')
    @ApiOkResByZod({
        summary: '获取会话消息',
        description: '获取指定会话的消息列表，支持游标分页',
        type: MessageListResDto
    })
    async findBySession(
        @Session() session: BetterAuthSession,
        @Param('sessionId') sessionId: string,
        @Query() query: QueryMessageDto
    ) {
        const result = await this.messageService.findBySession(session.user.id, sessionId, query);
        return result;
    }

    /** 重新生成回复 - 为 AI 消息重新生成一个候选回复 */
    @Post(':id/regenerate')
    @ApiOkResByZod({
        summary: '重新生成回复',
        description: '为 AI 消息重新生成一个候选回复，添加到 swipes 数组中',
        type: MessageResDto
    })
    async regenerate(@Session() session: BetterAuthSession, @Param('id') id: string, @Body() dto: RegenerateMessageDto) {
        const message = await this.messageService.regenerate(session.user.id, id, dto.mes, dto.extra);
        return message;
    }

    /** 切换候选回复 - 切换到指定索引的候选回复 */
    @Post(':id/swipe')
    @ApiOkResByZod({ summary: '切换候选回复', description: '切换到指定索引的候选回复', type: MessageResDto })
    async switchSwipe(@Session() session: BetterAuthSession, @Param('id') id: string, @Body() dto: SwitchSwipeDto) {
        const message = await this.messageService.switchSwipe(session.user.id, id, dto.swipe_id);
        return message;
    }
}
