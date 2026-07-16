# Environment-Aware Application Menu Design

## Goal

Keep Electron's application menu visible during development and remove it from packaged production builds.

## Environment Detection

Use Electron's `app.isPackaged` as the single source of truth. This reflects whether the running application is packaged and avoids coupling menu behavior to renderer URLs or `NODE_ENV` conventions.

## Behavior

- Development (`app.isPackaged === false`): keep the default Electron application menu and show the menu bar at all times.
- Production (`app.isPackaged === true`): remove the application menu with `Menu.setApplicationMenu(null)` and configure the browser window to hide its menu bar.

The window's `autoHideMenuBar` option will use the same packaged-state value so newly created windows behave consistently.

## Implementation Boundary

Extract the environment-to-menu decision into a small pure helper that can be tested without starting Electron. The main process will use this decision when creating a window and after the app becomes ready.

No custom development menu, keyboard shortcut changes, or renderer changes are included.

## Verification

- Unit tests cover development and packaged production decisions.
- Existing tests, lint, type checking, and the production build must pass.
- Development startup should retain the visible native menu; packaged builds should have no application menu.
