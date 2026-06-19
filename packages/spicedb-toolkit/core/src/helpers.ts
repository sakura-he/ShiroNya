import { readFileSync } from 'fs';
import { resolve } from 'path';
import { v1 } from '@authzed/authzed-node';

export function readSchemaFile(filePath: string): string {
  const resolved = resolve(process.cwd(), filePath);
  return readFileSync(resolved, 'utf-8');
}

export interface RelationshipParts {
  resource: { type: string; id: string };
  relation: string;
  subject: { type: string; id: string; relation?: string };
  caveat?: { name: string; context?: Record<string, unknown> };
}

export function createRelationshipProto(rel: RelationshipParts): v1.Relationship {
  return v1.Relationship.create({
    resource: v1.ObjectReference.create({
      objectType: rel.resource.type,
      objectId: rel.resource.id,
    }),
    relation: rel.relation,
    subject: v1.SubjectReference.create({
      object: v1.ObjectReference.create({
        objectType: rel.subject.type,
        objectId: rel.subject.id,
      }),
      optionalRelation: rel.subject.relation ?? '',
    }),
    optionalCaveat: rel.caveat
      ? v1.ContextualizedCaveat.create({
          caveatName: rel.caveat.name,
          context: rel.caveat.context ? v1.PbStruct.fromJson(rel.caveat.context as any) : undefined,
        })
      : undefined,
  });
}

export function formatRelationship(rel: RelationshipParts | v1.Relationship): string {
  const relationship = isRelationshipProto(rel) ? rel : createRelationshipProto(rel);
  const resource = relationship.resource;
  const subjectObject = relationship.subject?.object;
  const subjectRelation = relationship.subject?.optionalRelation;
  const subject = subjectRelation
    ? `${subjectObject?.objectType}:${subjectObject?.objectId}#${subjectRelation}`
    : `${subjectObject?.objectType}:${subjectObject?.objectId}`;

  return `${resource?.objectType}:${resource?.objectId}#${relationship.relation}@${subject}`;
}

function isRelationshipProto(rel: RelationshipParts | v1.Relationship): rel is v1.Relationship {
  return 'resource' in rel && Boolean((rel as v1.Relationship).resource?.objectType);
}
