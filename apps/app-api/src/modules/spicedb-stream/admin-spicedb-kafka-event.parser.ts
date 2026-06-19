import { createHash } from 'node:crypto';
import { AdminSpiceDbRelationshipChangeEvent as ProjectionRelationshipChangeEvent } from '../spicedb-projection/spicedb-projection.constants';

export type AdminSpiceDbRelationshipChangeEvent = ProjectionRelationshipChangeEvent & {
    raw: Record<string, unknown>;
};

export type ParsedSpiceDbKafkaEvent =
    | {
          ok: true;
          events: AdminSpiceDbRelationshipChangeEvent[];
          event: AdminSpiceDbRelationshipChangeEvent;
          eventKey: string;
          payload: Record<string, unknown>;
      }
    | {
          ok: false;
          reason: string;
          payload: unknown;
      };

type UnknownRecord = Record<string, unknown>;

/**
 * 将 Kafka 消息 value 解析为 SpiceDB Watch 关系事件，并保留原始 payload 便于日志审计。
 */
export function parseSpiceDbKafkaEvent(value: Buffer | null): ParsedSpiceDbKafkaEvent {
    if (!value) {
        return {
            ok: false,
            reason: 'empty_value',
            payload: null
        };
    }

    let payload: unknown;
    try {
        payload = JSON.parse(value.toString('utf8'));
    } catch {
        return {
            ok: false,
            reason: 'malformed_json',
            payload: value.toString('utf8')
        };
    }

    if (!isRecord(payload)) {
        return {
            ok: false,
            reason: 'payload_not_object',
            payload
        };
    }

    const events = extractRelationshipChangeEvents(payload);
    if (events.length === 0) {
        return {
            ok: false,
            reason: 'updates_missing',
            payload
        };
    }

    return {
        ok: true,
        events,
        event: events[0],
        eventKey: createSpiceDbBatchEventKey(events),
        payload
    };
}

/**
 * 生成稳定事件 key，便于 Kafka offset 之外按业务关系检索事件。
 */
export function createSpiceDbEventKey(event: AdminSpiceDbRelationshipChangeEvent): string {
    return [
        event.operation,
        event.resourceType ?? '',
        event.resourceId ?? '',
        event.relation ?? '',
        event.subjectType ?? '',
        event.subjectId ?? '',
        event.subjectRelation ?? ''
    ].join(':');
}

/**
 * 生成一条 Kafka 消息内全部 SpiceDB 事件的稳定 key。
 */
export function createSpiceDbBatchEventKey(events: AdminSpiceDbRelationshipChangeEvent[]): string {
    const eventKeys = events.map((event) => createSpiceDbEventKey(event));
    if (eventKeys.length === 1) {
        return eventKeys[0];
    }

    return `batch:${eventKeys.length}:${createHash('sha256').update(eventKeys.join('|')).digest('hex')}`;
}

/**
 * 判断 operation 是否属于当前投影支持的关系变更枚举。
 */
export function isKnownSpiceDbOperation(operation: string): boolean {
    return ['OPERATION_CREATE', 'OPERATION_TOUCH', 'OPERATION_DELETE'].includes(operation);
}

/**
 * 从 Redpanda Connect 当前 Watch 输出形态中抽取全部关系变更。
 */
function extractRelationshipChangeEvents(payload: UnknownRecord): AdminSpiceDbRelationshipChangeEvent[] {
    const zedToken = readString(readRecord(payload.changesThrough)?.token);
    return readArrayRecords(payload.updates)
        .map((candidate) => extractRelationshipChangeEvent(candidate, payload, zedToken))
        .filter((event): event is AdminSpiceDbRelationshipChangeEvent => event !== null);
}

/**
 * 从候选节点中抽取单条关系变更。
 */
function extractRelationshipChangeEvent(
    candidate: UnknownRecord,
    payload: UnknownRecord,
    zedToken?: string
): AdminSpiceDbRelationshipChangeEvent | null {
    const relationship = readRecord(candidate.relationship);
    const operation = readString(candidate.operation);
    if (!relationship || !operation) {
        return null;
    }

    const resource = readRecord(relationship.resource);
    const subject = readRecord(relationship.subject);
    const subjectObject = subject ? readRecord(subject.object) : undefined;
    const relation = readString(relationship.relation);
    const resourceType = resource ? readString(resource.objectType) : undefined;
    const resourceId = resource ? readString(resource.objectId) : undefined;
    const subjectType = subjectObject ? readString(subjectObject.objectType) : undefined;
    const subjectId = subjectObject ? readString(subjectObject.objectId) : undefined;

    if (!resourceType || !resourceId || !relation || !subjectType || !subjectId) {
        return null;
    }

    return {
        zedToken,
        operation,
        resourceType,
        resourceId,
        relation,
        subjectType,
        subjectId,
        subjectRelation: subject ? readString(subject.optionalRelation) : undefined,
        raw: payload
    };
}

/**
 * 从未知数组中只保留普通对象元素。
 */
function readArrayRecords(value: unknown): UnknownRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const records: UnknownRecord[] = [];
    for (const item of value) {
        const record = readRecord(item);
        if (record) {
            records.push(record);
        }
    }

    return records;
}

/**
 * 判断未知值是否为普通对象。
 */
function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 安全读取未知值中的对象字段。
 */
function readRecord(value: unknown): UnknownRecord | undefined {
    return isRecord(value) ? value : undefined;
}

/**
 * 安全读取未知值中的非空字符串字段。
 */
function readString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value.trim().length > 0 ? value : undefined;
    }
    return undefined;
}
