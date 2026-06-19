import { parseSpiceDbKafkaEvent } from './admin-spicedb-kafka-event.parser';

describe('parseSpiceDbKafkaEvent', () => {
    it('应解析 Redpanda Connect SpiceDB Watch payload 中的多条 relationship update', () => {
        const payload = {
            updates: [
                {
                    operation: 'OPERATION_CREATE',
                    relationship: {
                        resource: {
                            objectType: 'role',
                            objectId: '1'
                        },
                        relation: 'assignee',
                        subject: {
                            object: {
                                objectType: 'user',
                                objectId: 'user_1'
                            }
                        }
                    }
                },
                {
                    operation: 'OPERATION_DELETE',
                    relationship: {
                        resource: {
                            objectType: 'menu',
                            objectId: '9'
                        },
                        relation: 'viewer',
                        subject: {
                            object: {
                                objectType: 'role',
                                objectId: '1'
                            },
                            optionalRelation: 'assigned'
                        }
                    }
                }
            ],
            changesThrough: {
                token: 'zed-token-1'
            }
        };

        const result = parseSpiceDbKafkaEvent(Buffer.from(JSON.stringify(payload)));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error(result.reason);
        }
        expect(result.events).toHaveLength(2);
        expect(result.events[0]).toMatchObject({
            zedToken: 'zed-token-1',
            operation: 'OPERATION_CREATE',
            resourceType: 'role',
            resourceId: '1',
            relation: 'assignee',
            subjectType: 'user',
            subjectId: 'user_1'
        });
        expect(result.events[1]).toMatchObject({
            zedToken: 'zed-token-1',
            operation: 'OPERATION_DELETE',
            resourceType: 'menu',
            resourceId: '9',
            relation: 'viewer',
            subjectType: 'role',
            subjectId: '1',
            subjectRelation: 'assigned'
        });
        expect(result.eventKey).toMatch(/^batch:2:[a-f0-9]{64}$/);
    });

    it('遇到非字符串 operation 时应拒绝解析', () => {
        const payload = {
            updates: [
                {
                    operation: 1,
                    relationship: {
                        resource: {
                            objectType: 'user_group',
                            objectId: '8'
                        },
                        relation: 'member',
                        subject: {
                            object: {
                                objectType: 'user',
                                objectId: 'user_2'
                            }
                        }
                    }
                }
            ],
            changesThrough: {
                token: 'zed-token-2'
            }
        };

        const result = parseSpiceDbKafkaEvent(Buffer.from(JSON.stringify(payload)));

        expect(result).toEqual({
            ok: false,
            reason: 'updates_missing',
            payload
        });
    });

    it('无法解析 relationship update 时，应返回明确失败原因', () => {
        const result = parseSpiceDbKafkaEvent(Buffer.from(JSON.stringify({ hello: 'world' })));

        expect(result).toEqual({
            ok: false,
            reason: 'updates_missing',
            payload: {
                hello: 'world'
            }
        });
    });
});
