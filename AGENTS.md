# Shiro Nya Codex Rules

This repository contains the Shiro Nya monorepo. Keep existing authorization systems independent unless a task explicitly asks for integration.

## API Response HTTP Status

- Successful HTTP API responses must return HTTP status code `200`.
- Do not allow framework defaults such as NestJS `POST` returning `201 Created` to leak into ShiroAdmin APIs. Normalize or explicitly annotate successful routes so callers receive `200`.
- Non-success responses should keep the appropriate error HTTP status code and continue using the existing structured error response format.

## Admin Menu Sync

- When adding or fixing admin-web sidebar menu entries, use the live database menu and permission rows as the source of truth.
- Read the latest menu and permission rows from the current database first, especially `shiro_rbac_menu`, `shiro_rbac_permission`, role grants, and visible-menu read models.
- Add or update menu and permission rows against the live database shape, then rebuild or refresh the RBAC effective visible-menu read model for affected users.
- Static hidden routes are only for direct navigation. A page appears after login only when the database menu exists and the current user has the menu `required_permission_code`.

## Admin Web ABAC Page Layout

- ABAC admin pages should follow the same layout contract as RBAC pages: use `AbacShell`/`GiPageLayout` for the page frame, then wrap each primary table in `<a-card :bordered="true">`.
- Do not build a separate toolbar card above a `GiTable`. Put filters and form controls in the table `#form-search` slot, and put create/import/publish buttons in `#custom-extra` so the table keeps its built-in refresh, fullscreen, border, density, and column-setting controls.
- Use the shared ABAC `tableOptions` with `reload`, `density`, and `setting` enabled. Do not disable GiTable's toolbar capabilities just to simplify a page.
- Table operation columns should match RBAC pages: title `操作`, `valueType: "option"`, fixed right, and text `a-link` actions with `a-popconfirm` for destructive actions. Avoid icon-only action buttons unless the surrounding module already uses that pattern.
- For ABAC JSON editing or preview panels, use the project `CodeViewer`/VS Code editor wrapper instead of Arco textarea, and disable word wrapping when a policy preview must scroll horizontally.
- Tabs and breadcrumbs must use the database menu meta (`id`, `title`, `icon`, `requiredPermissionCode`) when dynamic menu metadata is available. If a route can be opened before dynamic menus load, refresh same-path tab cache entries when menus are applied.
