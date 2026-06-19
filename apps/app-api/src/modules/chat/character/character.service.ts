/**
 * Character Service
 * 角色卡管理服务 - 处理角色卡业务逻辑
 *
 * Requirements: 1.1-1.5, 2.1-2.5, 3.1-3.3, 4.1-4.3, 5.1-5.3, 6.1-6.5, 7.1-7.3
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterData,
    CharacterExtensions,
    DepthPrompt
} from '@app/mongodb/schemas/character.schema';
import { BusinessException, ErrorCodes } from '@app/common';
import { CreateCharacterDto, UpdateCharacterDto, QueryCharacterDto } from './dto/character-req.dto';
import { V3CharacterCard, validateV3Object, parseV3Json } from './schemas/v3-character-card.schema';

/**
 * 分页结果接口
 */
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class CharacterService {
    constructor(
        @InjectModel(Character.name)
        private characterModel: Model<CharacterDocument>
    ) {}

    /**
     * 创建角色卡
     * Requirements: 1.1, 1.3, 1.4, 1.5
     *
     * @param userId - 当前用户ID
     * @param dto - 创建角色卡数据
     * @returns 创建的角色卡文档
     */
    async create(userId: string, dto: CreateCharacterDto): Promise<CharacterDocument> {
        // 构建嵌套 data 对象，同步顶层字段和嵌套字段
        const characterData: CharacterData = this.buildCharacterData(dto);

        // 构建角色卡文档
        const character = new this.characterModel({
            // 规范字段 - 默认值 (Requirement 1.4)
            spec: 'chara_card_v3',
            spec_version: '3.0',

            // 顶层字段 (Requirement 1.5 - 同步)
            name: dto.name,
            description: dto.description ?? '',
            personality: dto.personality ?? '',
            scenario: dto.scenario ?? '',
            first_mes: dto.first_mes ?? '',
            mes_example: dto.mes_example ?? '',
            creatorcomment: dto.data?.creator_notes ?? '',
            post_history_instructions: dto.data?.post_history_instructions ?? '',
            tags: dto.tags ?? [],
            create_date: new Date(),
            avatar: 'none',

            // 默认值 (Requirement 1.4)
            talkativeness: 0.5,
            fav: false,
            is_public: dto.is_public ?? false,

            // 嵌套数据 (Requirement 1.5)
            data: characterData,

            // 系统字段 (Requirement 1.3)
            user_id: userId
        });

        return character.save();
    }

    /**
     * 查询角色卡列表
     * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
     *
     * @param userId - 当前用户ID
     * @param query - 查询参数
     * @returns 分页角色卡列表
     */
    async findAll(userId: string, query: QueryCharacterDto): Promise<PaginatedResult<CharacterDocument>> {
        const { page = 1, limit = 20, search, tags, is_public } = query;
        const skip = (page - 1) * limit;

        // 构建查询条件
        const filter: Record<string, any> = {};

        if (is_public) {
            // Requirement 2.2: 查询公开角色
            filter.is_public = true;
        } else {
            // Requirement 2.1: 查询用户自己的角色
            filter.user_id = userId;
        }

        // Requirement 2.4: 标签筛选
        if (tags) {
            const tagArray = tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
            if (tagArray.length > 0) {
                filter.tags = { $all: tagArray };
            }
        }

        // Requirement 2.5: 文本搜索 (name 和 description)
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // 执行查询
        const [items, total] = await Promise.all([
            this.characterModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
            this.characterModel.countDocuments(filter).exec()
        ]);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * 获取角色卡详情
     * Requirements: 3.1, 3.2, 3.3
     *
     * @param userId - 当前用户ID
     * @param id - 角色卡ID
     * @returns 角色卡文档
     */
    async findOne(userId: string, id: string): Promise<CharacterDocument> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // Requirement 3.1: 获取完整文档
        const character = await this.characterModel.findById(id).exec();

        // Requirement 3.2: 不存在返回 404
        if (!character) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 3.3: 验证访问权限 (所有者或公开)
        if (character.user_id !== userId && !character.is_public) {
            throw new BusinessException(ErrorCodes.FORBIDDEN);
        }

        return character;
    }

    /**
     * 更新角色卡
     * Requirements: 4.1, 4.2, 4.3
     *
     * @param userId - 当前用户ID
     * @param id - 角色卡ID
     * @param dto - 更新数据
     * @returns 更新后的角色卡文档
     */
    async update(userId: string, id: string, dto: UpdateCharacterDto): Promise<CharacterDocument> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        // 获取现有角色卡
        const character = await this.characterModel.findById(id).exec();

        if (!character) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 4.2: 验证所有权
        await this.validateOwnership(userId, character);

        // Requirement 4.3: 同步顶层和嵌套字段
        const updateData = this.buildUpdateData(character, dto);

        // Requirement 4.1: 更新并返回更新后的文档
        const updated = await this.characterModel.findByIdAndUpdate(id, { $set: updateData }, { new: true }).exec();

        if (!updated) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        return updated;
    }

    /**
     * 删除角色卡
     * Requirements: 5.1, 5.2, 5.3
     *
     * @param userId - 当前用户ID
     * @param id - 角色卡ID
     */
    async remove(userId: string, id: string): Promise<void> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        const character = await this.characterModel.findById(id).exec();

        if (!character) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // Requirement 5.2: 验证所有权
        await this.validateOwnership(userId, character);

        // Requirement 5.1, 5.3: 删除角色卡 (会话保留 character_name 快照)
        await this.characterModel.findByIdAndDelete(id).exec();
    }

    /**
     * 导入 V3 格式角色卡
     * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
     *
     * @param userId - 当前用户ID
     * @param v3Data - V3 角色卡数据 (对象或 JSON 字符串)
     * @returns 创建的角色卡文档
     */
    async importV3(userId: string, v3Data: V3CharacterCard | string): Promise<CharacterDocument> {
        // 如果是字符串，先解析 JSON
        let validatedData: V3CharacterCard;

        if (typeof v3Data === 'string') {
            // Requirement 6.2: 解析 JSON，返回解析错误
            const parseResult = parseV3Json(v3Data);
            if (!parseResult.success || !parseResult.data) {
                const errorCode = parseResult.error?.code === 'INVALID_JSON' ? '400001' : '400002';
                throw new BusinessException({
                    code: parseInt(errorCode),
                    message: parseResult.error?.message || 'Invalid V3 JSON'
                });
            }
            validatedData = parseResult.data;
        } else {
            // Requirement 6.3: 验证 V3 格式
            const validateResult = validateV3Object(v3Data);
            if (!validateResult.success || !validateResult.data) {
                const errorCode = validateResult.error?.code === 'UNSUPPORTED_SPEC' ? '400003' : '400002';
                throw new BusinessException({
                    code: parseInt(errorCode),
                    message: validateResult.error?.message || 'Invalid V3 format'
                });
            }
            validatedData = validateResult.data;
        }

        // Requirement 6.4: 映射 V3 字段到 Character schema
        const characterData = this.mapV3ToCharacterData(validatedData);

        // 构建角色卡文档
        const character = new this.characterModel({
            // 规范字段
            spec: validatedData.spec,
            spec_version: validatedData.spec_version,

            // 顶层字段 (从 V3 映射)
            name: validatedData.name,
            description: validatedData.description,
            personality: validatedData.personality,
            scenario: validatedData.scenario,
            first_mes: validatedData.first_mes,
            mes_example: validatedData.mes_example,
            creatorcomment: validatedData.creatorcomment,
            post_history_instructions: validatedData.post_history_instructions,
            tags: validatedData.tags,
            create_date: validatedData.create_date ? new Date(validatedData.create_date) : new Date(),
            avatar: validatedData.avatar,
            talkativeness:
                typeof validatedData.talkativeness === 'string'
                    ? parseFloat(validatedData.talkativeness) || 0.5
                    : validatedData.talkativeness,
            fav: validatedData.fav,

            // Requirement 6.5: 设置 user_id 和 is_public
            user_id: userId,
            is_public: false,

            // 嵌套数据
            data: characterData
        });

        return character.save();
    }

    /**
     * 导出 V3 格式角色卡
     * Requirements: 7.1, 7.2, 7.3
     *
     * @param userId - 当前用户ID
     * @param id - 角色卡ID
     * @returns V3 格式角色卡 JSON
     */
    async exportV3(userId: string, id: string): Promise<V3CharacterCard> {
        // 验证 ObjectId 格式
        if (!Types.ObjectId.isValid(id)) {
            throw new BusinessException(ErrorCodes.BAD_REQUEST);
        }

        const character = await this.characterModel.findById(id).exec();

        if (!character) {
            throw new BusinessException(ErrorCodes.NOT_FOUND);
        }

        // 验证访问权限 (所有者或公开)
        if (character.user_id !== userId && !character.is_public) {
            throw new BusinessException(ErrorCodes.FORBIDDEN);
        }

        // Requirement 7.1, 7.2, 7.3: 生成 V3 JSON，排除系统字段
        return this.mapCharacterToV3(character);
    }

    /**
     * 从 JSON 字符串导入 V3 角色卡
     * 便捷方法，用于文件上传场景
     *
     * @param userId - 当前用户ID
     * @param jsonString - V3 JSON 字符串
     * @returns 创建的角色卡文档
     */
    async importV3FromJson(userId: string, jsonString: string): Promise<CharacterDocument> {
        return this.importV3(userId, jsonString);
    }

    /**
     * 映射 V3 数据到 CharacterData
     *
     * @param v3Data - V3 角色卡数据
     * @returns CharacterData 对象
     */
    private mapV3ToCharacterData(v3Data: V3CharacterCard): CharacterData {
        const v3DataObj = v3Data.data;

        // 映射 regex_scripts，确保 enabled 字段有默认值
        const regexScripts = (v3DataObj.extensions?.regex_scripts ?? []).map((script) => ({
            name: script.name,
            pattern: script.pattern,
            replacement: script.replacement,
            enabled: script.enabled ?? true
        }));

        return {
            name: v3DataObj.name,
            description: v3DataObj.description,
            personality: v3DataObj.personality,
            scenario: v3DataObj.scenario,
            first_mes: v3DataObj.first_mes,
            mes_example: v3DataObj.mes_example,
            creator_notes: v3DataObj.creator_notes,
            system_prompt: v3DataObj.system_prompt,
            post_history_instructions: v3DataObj.post_history_instructions,
            tags: v3DataObj.tags,
            creator: v3DataObj.creator,
            character_version: v3DataObj.character_version,
            alternate_greetings: v3DataObj.alternate_greetings,
            group_only_greetings: v3DataObj.group_only_greetings,
            extensions: {
                talkativeness:
                    typeof v3DataObj.extensions?.talkativeness === 'string'
                        ? parseFloat(v3DataObj.extensions.talkativeness) || 0.5
                        : (v3DataObj.extensions?.talkativeness ?? 0.5),
                fav: v3DataObj.extensions?.fav ?? false,
                depth_prompt: {
                    prompt: v3DataObj.extensions?.depth_prompt?.prompt ?? '',
                    depth: v3DataObj.extensions?.depth_prompt?.depth ?? 4,
                    role: v3DataObj.extensions?.depth_prompt?.role ?? 'system'
                } as DepthPrompt,
                regex_scripts: regexScripts
            }
        };
    }

    /**
     * 映射 Character 到 V3 格式
     * Requirement 7.2: 排除系统字段 (user_id, is_public, _id)
     * Requirement 7.3: 包含所有 V3 规范必需字段
     *
     * @param character - 角色卡文档
     * @returns V3 格式角色卡
     */
    private mapCharacterToV3(character: CharacterDocument): V3CharacterCard {
        // 映射 regex_scripts，确保 enabled 字段有默认值
        const regexScripts = (character.data?.extensions?.regex_scripts ?? []).map((script) => ({
            name: script.name,
            pattern: script.pattern,
            replacement: script.replacement,
            enabled: script.enabled ?? true
        }));

        return {
            // V3 规范字段
            spec: 'chara_card_v3',
            spec_version: character.spec_version || '3.0',

            // 顶层字段
            name: character.name,
            description: character.description || '',
            personality: character.personality || '',
            scenario: character.scenario || '',
            first_mes: character.first_mes || '',
            mes_example: character.mes_example || '',
            creatorcomment: character.creatorcomment || '',
            post_history_instructions: character.post_history_instructions || '',
            tags: character.tags || [],
            create_date: character.create_date?.toISOString() || new Date().toISOString(),
            avatar: character.avatar || 'none',
            talkativeness: character.talkativeness ?? 0.5,
            fav: character.fav ?? false,

            // 嵌套数据
            data: {
                name: character.data?.name || character.name,
                description: character.data?.description || character.description || '',
                personality: character.data?.personality || character.personality || '',
                scenario: character.data?.scenario || character.scenario || '',
                first_mes: character.data?.first_mes || character.first_mes || '',
                mes_example: character.data?.mes_example || character.mes_example || '',
                creator_notes: character.data?.creator_notes || '',
                system_prompt: character.data?.system_prompt || '',
                post_history_instructions:
                    character.data?.post_history_instructions || character.post_history_instructions || '',
                tags: character.data?.tags || character.tags || [],
                creator: character.data?.creator || '',
                character_version: character.data?.character_version || '1.0',
                alternate_greetings: character.data?.alternate_greetings || [],
                group_only_greetings: character.data?.group_only_greetings || [],
                extensions: {
                    talkativeness: character.data?.extensions?.talkativeness ?? character.talkativeness ?? 0.5,
                    fav: character.data?.extensions?.fav ?? character.fav ?? false,
                    depth_prompt: {
                        prompt: character.data?.extensions?.depth_prompt?.prompt || '',
                        depth: character.data?.extensions?.depth_prompt?.depth ?? 4,
                        role: character.data?.extensions?.depth_prompt?.role || 'system'
                    },
                    regex_scripts: regexScripts
                }
            }
        };
    }

    /**
     * 验证所有权
     * 检查用户是否拥有该角色卡
     *
     * @param userId - 当前用户ID
     * @param character - 角色卡文档
     */
    private async validateOwnership(userId: string, character: CharacterDocument): Promise<void> {
        if (character.user_id !== userId) {
            throw new BusinessException(ErrorCodes.FORBIDDEN);
        }
    }

    /**
     * 构建角色卡嵌套数据对象
     * 用于创建时初始化 data 字段
     *
     * @param dto - 创建角色卡数据
     * @returns CharacterData 对象
     */
    private buildCharacterData(dto: CreateCharacterDto): CharacterData {
        // 如果提供了完整的 data 对象，使用它并补充默认值
        if (dto.data) {
            return {
                name: dto.data.name || dto.name,
                description: dto.data.description ?? dto.description ?? '',
                personality: dto.data.personality ?? dto.personality ?? '',
                scenario: dto.data.scenario ?? dto.scenario ?? '',
                first_mes: dto.data.first_mes ?? dto.first_mes ?? '',
                mes_example: dto.data.mes_example ?? dto.mes_example ?? '',
                creator_notes: dto.data.creator_notes ?? '',
                system_prompt: dto.data.system_prompt ?? '',
                post_history_instructions: dto.data.post_history_instructions ?? '',
                tags: dto.data.tags ?? dto.tags ?? [],
                creator: dto.data.creator ?? '',
                character_version: dto.data.character_version ?? '1.0',
                alternate_greetings: dto.data.alternate_greetings ?? [],
                group_only_greetings: dto.data.group_only_greetings ?? [],
                extensions: this.buildDefaultExtensions()
            };
        }

        // 从顶层字段构建 data 对象
        return {
            name: dto.name,
            description: dto.description ?? '',
            personality: dto.personality ?? '',
            scenario: dto.scenario ?? '',
            first_mes: dto.first_mes ?? '',
            mes_example: dto.mes_example ?? '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            tags: dto.tags ?? [],
            creator: '',
            character_version: '1.0',
            alternate_greetings: [],
            group_only_greetings: [],
            extensions: this.buildDefaultExtensions()
        };
    }

    /**
     * 构建默认扩展配置
     */
    private buildDefaultExtensions(): CharacterExtensions {
        return {
            talkativeness: 0.5,
            fav: false,
            depth_prompt: {
                prompt: '',
                depth: 4,
                role: 'system'
            } as DepthPrompt,
            regex_scripts: []
        };
    }

    /**
     * 构建更新数据
     * 同步顶层字段和嵌套 data 字段
     *
     * @param character - 现有角色卡
     * @param dto - 更新数据
     * @returns 更新数据对象
     */
    private buildUpdateData(character: CharacterDocument, dto: UpdateCharacterDto): Record<string, any> {
        const updateData: Record<string, any> = {};

        // 更新顶层字段
        if (dto.name !== undefined) {
            updateData.name = dto.name;
            updateData['data.name'] = dto.name;
        }
        if (dto.description !== undefined) {
            updateData.description = dto.description;
            updateData['data.description'] = dto.description;
        }
        if (dto.personality !== undefined) {
            updateData.personality = dto.personality;
            updateData['data.personality'] = dto.personality;
        }
        if (dto.scenario !== undefined) {
            updateData.scenario = dto.scenario;
            updateData['data.scenario'] = dto.scenario;
        }
        if (dto.first_mes !== undefined) {
            updateData.first_mes = dto.first_mes;
            updateData['data.first_mes'] = dto.first_mes;
        }
        if (dto.mes_example !== undefined) {
            updateData.mes_example = dto.mes_example;
            updateData['data.mes_example'] = dto.mes_example;
        }
        if (dto.tags !== undefined) {
            updateData.tags = dto.tags;
            updateData['data.tags'] = dto.tags;
        }
        if (dto.is_public !== undefined) {
            updateData.is_public = dto.is_public;
        }

        // 如果提供了完整的 data 对象，更新嵌套字段
        if (dto.data) {
            if (dto.data.name !== undefined) {
                updateData.name = dto.data.name;
                updateData['data.name'] = dto.data.name;
            }
            if (dto.data.description !== undefined) {
                updateData.description = dto.data.description;
                updateData['data.description'] = dto.data.description;
            }
            if (dto.data.personality !== undefined) {
                updateData.personality = dto.data.personality;
                updateData['data.personality'] = dto.data.personality;
            }
            if (dto.data.scenario !== undefined) {
                updateData.scenario = dto.data.scenario;
                updateData['data.scenario'] = dto.data.scenario;
            }
            if (dto.data.first_mes !== undefined) {
                updateData.first_mes = dto.data.first_mes;
                updateData['data.first_mes'] = dto.data.first_mes;
            }
            if (dto.data.mes_example !== undefined) {
                updateData.mes_example = dto.data.mes_example;
                updateData['data.mes_example'] = dto.data.mes_example;
            }
            if (dto.data.creator_notes !== undefined) {
                updateData.creatorcomment = dto.data.creator_notes;
                updateData['data.creator_notes'] = dto.data.creator_notes;
            }
            if (dto.data.system_prompt !== undefined) {
                updateData['data.system_prompt'] = dto.data.system_prompt;
            }
            if (dto.data.post_history_instructions !== undefined) {
                updateData.post_history_instructions = dto.data.post_history_instructions;
                updateData['data.post_history_instructions'] = dto.data.post_history_instructions;
            }
            if (dto.data.tags !== undefined) {
                updateData.tags = dto.data.tags;
                updateData['data.tags'] = dto.data.tags;
            }
            if (dto.data.creator !== undefined) {
                updateData['data.creator'] = dto.data.creator;
            }
            if (dto.data.character_version !== undefined) {
                updateData['data.character_version'] = dto.data.character_version;
            }
            if (dto.data.alternate_greetings !== undefined) {
                updateData['data.alternate_greetings'] = dto.data.alternate_greetings;
            }
            if (dto.data.group_only_greetings !== undefined) {
                updateData['data.group_only_greetings'] = dto.data.group_only_greetings;
            }
        }

        return updateData;
    }
}
