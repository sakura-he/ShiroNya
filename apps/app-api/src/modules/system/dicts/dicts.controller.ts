import { AuditLog } from '@app/common';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { SystemDictsService } from './dicts.service';
import {
    CreateDictDto,
    CreateDictCategoryDto,
    CreateDictCategorySchema,
    CreateDictItemSchema,
    CreateDictSchema,
    CreateDictItemDto,
    DeleteDictCategoryDto,
    DeleteDictCategorySchema,
    DeleteDictDto,
    DeleteDictItemSchema,
    DeleteDictSchema,
    DeleteDictItemDto,
    DictDetailDto,
    DictCategoryDto,
    DictCategoryOptionListDto,
    DictItemListDto,
    DictItemRecordDto,
    DictListDto,
    DictNullDto,
    DictOptionListDto,
    DictRecordDto,
    DictStatusOptionListDto,
    QueryDictDetailDto,
    QueryDictCategoryOptionsDto,
    QueryDictCategoryOptionsSchema,
    QueryDictDetailSchema,
    QueryDictItemListDto,
    QueryDictItemListSchema,
    QueryDictListDto,
    QueryDictListSchema,
    QueryDictOptionsDto,
    QueryDictOptionsSchema,
    UpdateDictDto,
    UpdateDictItemSchema,
    UpdateDictItemStatusSchema,
    UpdateDictSchema,
    UpdateDictStatusSchema,
    UpdateDictItemDto,
    UpdateDictItemStatusDto,
    UpdateDictStatusDto
} from './dto/dict.dto';

/**
 * 字典控制器，负责后台字典类型和字典项的查询、维护与选项读取。
 */
@ApiTags('Common/Dict')
@Controller('dict')
export class SystemDictsController {
    /**
     * 注入字典服务。
     */
    constructor(private readonly dictService: SystemDictsService) {}

    /**
     * 返回字典启停状态选项。
     */
    @RbacPermission('system.dict.view')
    @Get('get_status_options')
    @ApiOkResByZod({ summary: '获取字典状态选项', type: DictStatusOptionListDto })
    async getStatusOptions() {
        return this.dictService.getDictStatusOptions();
    }

    /**
     * 返回字典分类下拉选项。
     */
    @RbacPermission('system.dict.view')
    @Post('query_category_options')
    @ApiOkResByZod({ summary: '获取字典分类选项', type: DictCategoryOptionListDto })
    async getCategoryOptions(
        @Body(new ZodValidationPipe(QueryDictCategoryOptionsSchema)) query: QueryDictCategoryOptionsDto
    ) {
        return await this.dictService.getDictCategoryOptions(query);
    }

    /**
     * 创建字典分类。
     */
    @RbacPermission('system.dict.create')
    @Post('create_category')
    @ApiOkResByZod({ summary: '创建字典分类', type: DictCategoryDto })
    @AuditLog({ module: 'dict', action: 'create_category', summary: '创建字典分类', resourceType: 'dict_category' })
    async createCategory(@Body(new ZodValidationPipe(CreateDictCategorySchema)) data: CreateDictCategoryDto) {
        return await this.dictService.createDictCategory(data);
    }

    /**
     * 删除空字典分类。
     */
    @RbacPermission('system.dict.delete')
    @Post('delete_category')
    @ApiOkResByZod({ summary: '删除字典分类', type: DictNullDto })
    @AuditLog({
        module: 'dict',
        action: 'delete_category',
        summary: '删除字典分类',
        resourceType: 'dict_category',
        resourceIdPath: 'body.name'
    })
    async deleteCategory(@Body(new ZodValidationPipe(DeleteDictCategorySchema)) data: DeleteDictCategoryDto) {
        return await this.dictService.deleteDictCategory(data);
    }

    /**
     * 分页查询字典主表。
     */
    @RbacPermission('system.dict.view')
    @Post('query_dict_list')
    @ApiOkResByZod({ summary: '分页查询字典列表', type: DictListDto })
    async getDictList(@Body(new ZodValidationPipe(QueryDictListSchema)) query: QueryDictListDto) {
        return await this.dictService.getDictList(query);
    }

    /**
     * 查询字典详情和字典项。
     */
    @RbacPermission('system.dict.view')
    @Get('get_dict_detail')
    @ApiOkResByZod({ summary: '查询字典详情', type: DictDetailDto })
    async getDictDetail(@Query(new ZodValidationPipe(QueryDictDetailSchema)) query: QueryDictDetailDto) {
        return await this.dictService.getDictDetail(query.id);
    }

    /**
     * 创建字典主记录。
     */
    @RbacPermission('system.dict.create')
    @Post('create_dict')
    @ApiOkResByZod({ summary: '创建字典', type: DictRecordDto })
    @AuditLog({ module: 'dict', action: 'create_dict', summary: '创建字典', resourceType: 'dict' })
    async createDict(@Body(new ZodValidationPipe(CreateDictSchema)) data: CreateDictDto) {
        return await this.dictService.createDict(data);
    }

    /**
     * 更新字典主记录。
     */
    @RbacPermission('system.dict.update')
    @Post('update_dict')
    @ApiOkResByZod({ summary: '更新字典', type: DictRecordDto })
    @AuditLog({
        module: 'dict',
        action: 'update_dict',
        summary: '更新字典',
        resourceType: 'dict',
        resourceIdPath: 'body.id'
    })
    async updateDict(@Body(new ZodValidationPipe(UpdateDictSchema)) data: UpdateDictDto) {
        return await this.dictService.updateDict(data);
    }

    /**
     * 更新字典启停状态。
     */
    @RbacPermission('system.dict.update')
    @Post('update_dict_status')
    @ApiOkResByZod({ summary: '更新字典状态', type: DictNullDto })
    @AuditLog({
        module: 'dict',
        action: 'update_dict_status',
        summary: '更新字典状态',
        resourceType: 'dict',
        resourceIdPath: 'body.id'
    })
    async updateDictStatus(@Body(new ZodValidationPipe(UpdateDictStatusSchema)) data: UpdateDictStatusDto) {
        return await this.dictService.updateDictStatus(data);
    }

    /**
     * 删除字典主记录及其字典项。
     */
    @RbacPermission('system.dict.delete')
    @Post('delete_dict')
    @ApiOkResByZod({ summary: '删除字典', type: DictNullDto })
    @AuditLog({
        module: 'dict',
        action: 'delete_dict',
        summary: '删除字典',
        resourceType: 'dict',
        resourceIdPath: 'body.id'
    })
    async deleteDict(@Body(new ZodValidationPipe(DeleteDictSchema)) data: DeleteDictDto) {
        return await this.dictService.deleteDict(data);
    }

    /**
     * 分页查询字典项。
     */
    @RbacPermission('system.dict.view')
    @Post('query_item_list')
    @ApiOkResByZod({ summary: '分页查询字典项', type: DictItemListDto })
    async getDictItemList(@Body(new ZodValidationPipe(QueryDictItemListSchema)) query: QueryDictItemListDto) {
        return await this.dictService.getDictItemList(query);
    }

    /**
     * 根据字典定位信息查询可直接用于前端下拉的选项。
     */
    @RbacPermission('system.dict.view')
    @Post('query_options')
    @ApiOkResByZod({ summary: '查询字典下拉选项', type: DictOptionListDto })
    async getDictOptions(@Body(new ZodValidationPipe(QueryDictOptionsSchema)) query: QueryDictOptionsDto) {
        return await this.dictService.getDictOptions(query);
    }

    /**
     * 创建字典项。
     */
    @RbacPermission('system.dict-item.create')
    @Post('create_item')
    @ApiOkResByZod({ summary: '创建字典项', type: DictItemRecordDto })
    @AuditLog({ module: 'dict', action: 'create_dict_item', summary: '创建字典项', resourceType: 'dict_item' })
    async createDictItem(@Body(new ZodValidationPipe(CreateDictItemSchema)) data: CreateDictItemDto) {
        return await this.dictService.createDictItem(data);
    }

    /**
     * 更新字典项。
     */
    @RbacPermission('system.dict-item.update')
    @Post('update_item')
    @ApiOkResByZod({ summary: '更新字典项', type: DictItemRecordDto })
    @AuditLog({
        module: 'dict',
        action: 'update_dict_item',
        summary: '更新字典项',
        resourceType: 'dict_item',
        resourceIdPath: 'body.id'
    })
    async updateDictItem(@Body(new ZodValidationPipe(UpdateDictItemSchema)) data: UpdateDictItemDto) {
        return await this.dictService.updateDictItem(data);
    }

    /**
     * 更新字典项启停状态。
     */
    @RbacPermission('system.dict-item.update')
    @Post('update_item_status')
    @ApiOkResByZod({ summary: '更新字典项状态', type: DictNullDto })
    @AuditLog({
        module: 'dict',
        action: 'update_dict_item_status',
        summary: '更新字典项状态',
        resourceType: 'dict_item',
        resourceIdPath: 'body.id'
    })
    async updateDictItemStatus(@Body(new ZodValidationPipe(UpdateDictItemStatusSchema)) data: UpdateDictItemStatusDto) {
        return await this.dictService.updateDictItemStatus(data);
    }

    /**
     * 删除字典项。
     */
    @RbacPermission('system.dict-item.delete')
    @Post('delete_item')
    @ApiOkResByZod({ summary: '删除字典项', type: DictNullDto })
    @AuditLog({
        module: 'dict',
        action: 'delete_dict_item',
        summary: '删除字典项',
        resourceType: 'dict_item',
        resourceIdPath: 'body.id'
    })
    async deleteDictItem(@Body(new ZodValidationPipe(DeleteDictItemSchema)) data: DeleteDictItemDto) {
        return await this.dictService.deleteDictItem(data);
    }
}
