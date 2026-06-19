---
name: shiro-nya-api-contract
description: Use when designing, modifying, reviewing, or renaming Shiro Nya HTTP APIs, DTOs, Swagger response decorators, frontend request functions, table/list/search/filter endpoints, form submissions, response/error shapes, or GET-to-POST JSON migrations. Applies to endpoint naming, GET vs POST decisions, querystring type issues, Zod DTO validation, ApiOkResByZod/ApiOkResponse usage, ResponseFormatInterceptor/Zod error behavior, frontend API wrappers, and removal of old compatibility routes.
---

# Shiro Nya API Contract

## Source Documents

Use current code and these project docs as the stable reference points:

- `AGENTS.md`: successful HTTP API responses must return status `200`.
- `docs/evolver-prompts/active/00-项目级编码代理规则.md`: action-style paths, no REST resource paths, no shallow wrappers, current project-wide coding priorities.
- `docs/evolver-prompts/active/backend/后端接口与数据对象规则.md`: Controller, DTO, Swagger, Prisma DateTime, and app-specific API rules.
- `libs/common/docs/common.md`: shared decorators, response wrapper, filters, audit/logging boundaries.
- `libs/common/src/decorators/api-res.decorator.ts`: exact `ApiOkResByZod` behavior.
- `libs/common/src/filters/zod-exception.filter.ts`: exact DTO validation error response shape.

If a historical doc conflicts with current code or these active docs, trust current code and update the stale doc when the task touches it.

## Core Rules

- Keep Shiro Nya APIs action-style and snake_case. Do not introduce REST resource paths such as `/:id`, and do not add `PUT`, `PATCH`, or `DELETE`.
- Successful API responses must use HTTP `200`. If a Nest `POST` route could return framework default `201`, explicitly normalize it or use the existing project-level HTTP status handling.
- Non-success responses should keep their appropriate HTTP status and the existing structured error response format.
- Use `GET` only for simple read-only lookups where querystring string semantics are acceptable, such as `detail?id=...`, static options, or status reads already following local module style.
- Use `POST` with JSON body for form submissions, table lists, pagination, search, filters, relation queries, relation draft state, and any request carrying booleans, numbers, arrays, dates, or structured conditions.
- Do not encode JSON/Base64 into `GET` query params to preserve types. If type fidelity matters, use `POST` JSON body.
- Keep one controller focused on one subdomain. Do not put role, user-group, permission, menu, and unrelated modules into one large controller.
- Follow the module's existing auth pattern. If the module uses `@RbacPermission()`, Better Auth `@Session()`, `actorId`, or service-layer `assertPermission`, keep the same pattern.

## Naming

- List, search, filter, and paginated query endpoints must use `query_*`.
- Use names such as `query_user_list`, `query_role_list`, `query_user_group_list`, `query_permission_list`, `query_menu_tree`, `query_all_menus`, `query_task_list`.
- Do not use `POST get_*` for list/search/filter APIs. Rename misleading routes such as `POST /admin/user/get_user_list` to `POST /admin/user/query_user_list`.
- Write actions should keep action verbs: `create_*`, `update_*`, `delete_*`, `assign_*`, `revoke_*`, `ban_*`, `unban_*`, `reset_*`.
- Do not keep old and new route names at the same time unless the user explicitly asks for a compatibility window.

## DTO, Validation, And Swagger

- For `POST` query/list/filter endpoints, read request data from `@Body()` and validate with the module's Zod DTO pattern.
- For typed JSON body fields, do not add compatibility conversions such as `z.coerce.boolean()`, preprocessors, or string-to-boolean mappers just to support old querystring payloads.
- For `GET` endpoints, remember that querystring values are strings. Use pipes or Zod validation only for the simple scalar cases that intentionally remain `GET`.
- Keep DTO names aligned with intent: `QueryUserListDto`, `QueryRoleListDto`, `QueryDictOptionsDto`, etc.
- Do not add wrapper DTOs, adapter functions, `normalize*`, `convert*`, or legacy field aliases to bridge old API shapes. Change the controller/service/frontend callers to the current contract directly.
- Request DTOs should usually be Zod schemas plus `createZodDto(...)`; keep the schema export next to the DTO class when the controller needs `new ZodValidationPipe(Schema)`.
- Prefer reusing `prisma-zod-generator` model schemas when they match the business payload. Compose explicit Zod schemas for richer responses, permission matrices, and include-heavy results.
- Use `z.unknown()` / `z.any()` only as a temporary boundary for genuinely unstable complex payloads, and keep it close to the field that cannot be modeled yet.
- Response DTOs should describe the pure business `data` payload only. Do not manually wrap response DTOs with `{ code, message, data }`; the global response interceptor and `ApiOkResByZod` handle that.
- Controller methods should normally return business data directly, not `{ data: result }`.
- Add `@ApiOkResByZod({ summary, type })` to HTTP API controller methods when the module uses Swagger decorators. This project wrapper internally applies Nest Swagger `ApiOkResponse`, `ApiOperation`, and `ZodSerializerDto`.
- Prefer `ApiOkResByZod` over raw `@ApiOkResponse` for Zod DTO routes. Use raw `ApiOkResponse` only when a module has a specific non-Zod Swagger pattern already established.
- Use clear response DTO names by payload shape: `UserListDto`, `UserDetailDto`, `DictNullDto`, `TaskRuntimeDto`, etc. List DTOs should expose `{ records, pagination }` when the service returns paginated data.
- Use a null DTO such as `XxxNullDto` / `createZodDto(z.null())` for endpoints that intentionally return `null` after successful write/delete operations.
- Do not include passwords, salts, internal tokens, secret keys, or other sensitive fields in response DTOs.
- Prisma `DateTime` values are usually ISO strings after the project Prisma extension; confirm runtime shape before adding `.toISOString()` or date conversion logic.

## Response And Error Shape

- Successful controller return values are wrapped by `ResponseFormatInterceptor` as `{ data, code, message }`; `undefined` becomes `data: null`.
- `ApiOkResByZod` builds Swagger docs for the wrapped success shape, but controller code still returns the unwrapped business payload.
- Zod request validation failures return HTTP `400` with code `1202`, message `参数格式错误`, and `data` from `z.flattenError(...)`.
- The validation error data shape is `{ formErrors: string[], fieldErrors: Record<string, string[]> }`.
- Frontend forms should reuse this structure: show a global fallback from `formErrors` or first `fieldErrors` message, and write `fieldErrors[fieldName]` back under the matching form field when possible.
- Zod response serialization failures are server bugs. They should stay hidden behind the project serialization error response while logs retain field-level context.

## Frontend Calls

- Frontend API functions for list/search/filter endpoints should use `request.post(..., params ?? {})`.
- Name frontend functions by the endpoint intent: `queryUserList`, `queryRoleListApi`, `queryMenuTreeApi`, `queryDictList`, etc.
- Send booleans, numbers, arrays, and dates as JSON body values; do not convert them to strings for query params.
- Remove old exported function names instead of keeping aliases such as `getUserList -> queryUserList`.
- Update all view imports and callsites directly.
- When handling DTO validation errors in forms, use existing helpers in `apps/admin-web/src/utils/apiValidation.ts` before adding new parsing logic.

## Rename Workflow

When changing an existing list/filter/search endpoint:

1. Rename the controller route from `get_*` to `query_*`.
2. Change request binding from `@Query()` to `@Body()` when moving from GET/querystring to POST/JSON.
3. Ensure the controller method has the correct `@ApiOkResByZod({ summary, type })` response DTO if the module uses Swagger decorators.
4. Keep the module's existing RBAC/session/audit pattern intact.
5. Update the frontend API path, HTTP method, exported function name, imports, and view callsites.
6. Update docs and examples so future agents do not recreate the old route.
7. Delete unused old controller methods, service shallow-forwarders, tests, and frontend aliases.
8. Scan for old names with `rg` before finishing.

Suggested scans:

```powershell
rg -n "@Post\('get_|get_user_list|get_all_roles|get_user_group_list|get_permission_list|get_group_list|get_all_menus|get_menu_tree|get_menu_list|get_category_options|get_dict_list|get_item_list|get_options|get_task_list|get_task_log_list|get_user_sessions" apps/admin-api/src apps/app-api/src apps/admin-web/src docs -S
rg -n "getUserList|getUserGroupListApi|getRoleListApi|getMenuListApi|getMenuTreeApi|getDictList|getTaskList|getAppApiUserListApi" apps/admin-web/src -S
```

## Verification

Choose the smallest checks that cover the change:

```powershell
pnpm --filter ./apps/admin-web exec vue-tsc --noEmit
pnpm build:admin-api
pnpm build:app-api
```

For UI-visible list/filter changes, also verify the affected page in the in-app browser and confirm the network/UI no longer depends on the old route.

## Known Exceptions

- Existing upload chunk lookup routes such as `get_chunk_by_file_uid` are not table/list/filter APIs. Do not rename them as part of a list-query cleanup unless the user explicitly broadens the scope.
- Existing simple option/status `GET` endpoints can stay `GET` when they do not carry typed filter forms. Prefer local module consistency unless the task is specifically to normalize all option APIs.
