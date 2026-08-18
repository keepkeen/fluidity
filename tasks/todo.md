# Fluidity Extension Review

## Mobile UX Repair Plan
- [ ] Replace mobile settings tabs with a responsive selector so every settings panel, especially Data and Changelog, is reachable at 390px width.
- [ ] Remove mobile startpage horizontal overflow and constrain search suggestions so they do not cover the primary link surface.
- [ ] Rework DataSettings spacing/grid so desktop avoids nested horizontal scrollbars and mobile uses a readable single-column flow.
- [ ] Add accessible names to popup and palette search inputs.
- [ ] Make the sync status indicator focusable/actionable and wire it to open the Data settings panel.
- [ ] Run typecheck/lint/build/MV3 E2E plus mobile layout verification and record results.

## MV3 E2E And Bundle Split Plan
- [x] Add a real MV3 extension E2E smoke test that builds the extension, launches Chromium/Chrome with the unpacked `build/` directory, verifies the new-tab page, popup, and background service worker, and checks for console/page errors.
- [x] Split heavy settings panels so SettingsWindow does not eagerly pull AI, data sync, design/color picker, wallpaper, search, and changelog code into the initial settings chunk.
- [x] Lazy-load AI/report/startpage-heavy surfaces that do not need to block first paint.
- [x] Enhance Gist sync status copy so the UI clearly distinguishes token missing, token connected, backup found, password required, unlocked/synced, and new encrypted backup creation.
- [x] Run typecheck, lint, production build, audit, and the MV3 E2E smoke test; record results.

## MV3 E2E And Bundle Split Review
- Added `scripts/mv3-e2e.mjs` and `npm run test:e2e:mv3`. The test builds the extension, launches Playwright Chromium with `build/` loaded as an unpacked MV3 extension, verifies the service worker/manifest, opens `index.html`, checks the settings Data and AI tabs, opens `popup.html` and `palette.html`, and fails on page errors, console errors, or failed requests.
- The MV3 E2E runner defaults to Playwright-managed Chromium because current system Chrome builds can reject command-line extension side-loading. `CHROME_PATH` remains available as an explicit override.
- Settings are now split at two levels: the settings modal is loaded only when opened, and each tab panel is lazy-loaded from `SettingsWindow`.
- Startpage-heavy surfaces are lazy-loaded: AI greeting, dashboard layout, report banner, weekly report, and monthly report no longer block the first startpage bundle.
- Gist sync copy now separates missing token, token entered but not connected, waiting for backup creation, existing encrypted Gist waiting for password, runtime errors, and connected/unlocked states. Token validation, existing backup discovery, new Gist creation, and force-push actions now show clearer success text.
- Extension pages now avoid direct third-party favicon probes that can be blocked by CORP or 404 responses; MV3 E2E caught this via console-error monitoring.
- Production build emitted separate chunks for `SettingsWindow`, `AISettings`, `DataSettings`, `WallpaperSettings`, `SearchSettings`, `LinkSettings`, `Changelog`, `AIGreeting`, `DashboardLayout`, `ReportBanner`, `WeeklyReport`, and `MonthlyReport`; the main chunk is now 118.81 kB gzip 38.73 kB in the latest build output.
- Verification completed: `npm run verify` passed; `npm run test:e2e:mv3` passed and includes `npm run build`; MV3 E2E checked `service_worker`, `startpage`, `settings_data`, `settings_ai`, `popup`, and `palette`; `npm audit --json` reported 0 vulnerabilities.

## Runtime Sync And AI Test Plan
- [x] Confirm the current sync/AI implementation details and avoid writing secrets into repository files.
- [x] Start the local app and verify the main UI renders without runtime errors.
- [x] Configure AI settings UI and test DeepSeek validation/error handling without writing real secrets into repo files.
- [x] Validate the provided DeepSeek API key with a minimal live request and configure AI in the local runtime.
- [x] Validate the GitHub sync UI/token error path without printing or storing real tokens in repo files.
- [x] Re-validate the initial GitHub token before sync; GitHub rejected it with HTTP 401.
- [x] Validate the replacement GitHub token and discover existing Fluidity Gist backup without printing or storing secrets in repo files.
- [ ] Unlock GitHub Gist sync after the correct sync password is available; the supplied password candidates and close variants could not decrypt the existing encrypted backup.
- [x] Manually exercise core extension UI flows: search, command palette, settings, links, todos, AI, and data sync controls.
- [x] Run verification commands after any code changes or configuration-driven findings.
- [x] Record further optimization opportunities and concrete recommendations.

## Runtime Sync And AI Test Review
- Local app rendered at `http://127.0.0.1:5173/` without error/warn console logs after onboarding/report overlays were dismissed.
- Main search works for normal shortcut suggestions, `@` engine suggestions, and `/` link-search mode without runtime errors.
- AI settings UI handles empty API key validation and invalid-key failure without crashing.
- The provided DeepSeek API key was validated with a minimal live request and AI was enabled/saved in the local runtime. The AI Settings test button returned a successful connection result, and the main page showed the AI badge plus refresh button with no error/warn console logs.
- Data settings UI renders storage stats, browser usage privacy controls, export/import controls, and Gist sync controls. Browser usage enablement on localhost correctly reports that extension website permissions are required.
- GitHub token failure handling works with an invalid token.
- The initial GitHub token was rechecked against GitHub and rejected with HTTP 401, so Gist discovery/creation could not proceed with that token.
- The replacement GitHub token validated successfully, and an existing encrypted Fluidity Gist backup was discovered. The supplied password candidates and close variants failed decryption, so syncing is currently blocked by the correct sync password rather than token access.
- Command palette entry `palette.html` renders, focuses search, and filters links.
- Popup entry `popup.html` renders and filters links/groups.
- Todo add/delete flow exposed a delete-button interaction issue during testing; fixed by using explicit button type plus pointer/key activation handling in `src/Startpage/Todo/TodoPanel.tsx`. Retest confirmed temporary todos can be added and deleted cleanly.
- Mobile viewport smoke test at 390x844 showed no runtime errors, but did show layout usability issues: horizontal clipping/overflow, search suggestions covering content on initial focus, and settings tabs cropped in the modal header.
- Latest verification after runtime/UI/tooling fixes: `npm run verify` passed, `npm run build` passed, `npm audit --json` reported 0 vulnerabilities, and browser smoke tests passed on desktop and 390x844 mobile viewports with no error-level console logs.

## Runtime Optimizations Applied
- Sanitized DeepSeek and GitHub/Gist error messages before rendering so raw provider JSON and backend details are not shown directly in the UI.
- Added positive cloud-sync feedback for successful token validation, Gist discovery, and force-push actions.
- Added explicit `type="button"` and accessible labels/pressed states to key icon-only and toggle controls in settings, AI settings, command palette, and todo interactions.
- Fixed the todo delete interaction so add/delete can be exercised reliably during runtime testing.
- Fixed Vite build/dev tooling hangs by making `vite-plugin-checker` explicit opt-in, keeping React/Babel plugins out of production builds, pinning TypeScript/Node types to stable versions, and disabling unnecessary `allowJs`.
- Reduced the `react-color` build graph by importing only the Chrome picker runtime entry instead of the package-wide picker barrel.

## Further Optimization Priorities
- After the correct sync password is available, complete a live encrypted Gist unlock/pull/push cycle and record the result.
- Move secret storage toward `chrome.storage.local` or a more explicit extension-only credential store. The startpage web fallback uses `localStorage`, which is convenient for dev but weaker for API keys.
- Extend the MV3 E2E suite to exercise optional host permissions, content-script injection, and real `chrome.storage.local` data migration paths.
- Fix mobile layout overflow: constrain accordion/link layout width, avoid initial search suggestions on small screens, and make settings tabs horizontally scrollable or a segmented dropdown.
- Continue the accessibility pass for remaining icon-only controls, especially sound and top-right status controls.
- Continue bundle work on the lazy design/color picker path; it is split from the main chunk now, but still contributes a large lazy `DesignSettings`/picker chunk.

## UX And Interaction Review Plan
- [x] Inspect current review notes and known unresolved issues.
- [x] Run local desktop/mobile smoke checks with Playwright screenshots and layout metrics.
- [x] Inspect settings, search, popup, palette, sync, and extension permission flows for remaining product and interaction risks.
- [x] Record prioritized repair and optimization recommendations.

## UX And Interaction Review
- P0: Mobile settings navigation is broken. At 390px viewport the seven settings tabs occupy 1050px total width while the header has no horizontal scroll or responsive mode. Tabs like `数据` and `更新日志` sit outside the viewport and cannot be clicked normally. Source: `src/Startpage/Settings/SettingsWindow.tsx` `Tabbar`/`TabOption`.
- P0: Mobile startpage still has horizontal visual overflow and search suggestions cover the primary link content. Screenshot showed a right-side overflow strip on a 390px viewport, and link-mode suggestions opened as a large overlay above the bottom search bar. Source: `src/Startpage/Startpage.tsx` main layout plus `src/Startpage/Searchbar/Searchbar.tsx` suggestions positioning.
- P1: Data settings layout is too wide/dense for both desktop and mobile. The three-column flex layout with `min-width: 280px`, fixed footer actions, and long Gist controls produces nested scrollbars and footer/content competition. Source: `src/Startpage/Settings/DataSettings/DataSettings.tsx`.
- P1: Popup and palette mobile smoke checks passed without horizontal overflow, but their search inputs lack accessible names. Source: `src/popup/Popup.tsx` and `src/Startpage/LinkContainer/CommandPalette/CommandPalette.tsx`.
- P1: Sync status dot is visually useful but not keyboard-focusable and exposes state only through `title`. It should be a button or status element with explicit text/ARIA and a direct route to Data settings. Source: `src/components/SyncStatusDot.tsx`.
- P1: Gist sync still needs live unlock/pull/push verification with the correct password. Current evidence proves token access and encrypted Gist discovery, but not a successful full sync cycle.
- P2: `清除全部设置` uses `localStorage.clear()`, which is broad and can remove unrelated app/dev keys; it should clear known Fluidity keys with confirmation and include/exclude extension storage intentionally. Source: `src/Startpage/Settings/SettingsWindow.tsx`.
- P2: Report/onboarding overlays can compete with first-run tasks and settings access. They should be sequenced or suppressed when another modal is opened, and E2E should cover Monday/month-start report behavior.
- P2: ErrorBoundary reveals raw `error.toString()` in UI. Useful in dev, but production extension users should see a sanitized message plus a copy-debug-details action. Source: `src/components/ErrorBoundary.tsx`.
- P2: Content-script permission and browser-usage flows need real MV3 E2E coverage: optional permission request, content script registration/unregistration, heartbeat storage, and disabled-by-default behavior. Source: `src/extension/background.ts` and browser usage settings.
- P3: Bundle size is improved, but `DesignSettings`/color picker remains a large lazy chunk. Split AI theme generation and color picker internals behind interaction-level imports if settings open latency becomes visible.

## Repair Plan
- [x] Restore a reproducible Node toolchain: regenerate `package-lock.json`, add explicit `dev`, `typecheck`, `verify`, and extension packaging scripts, and align package/manifest versions and README commands.
- [x] Add the missing `src/base/colorUtils.ts` shared theme helper without removing the existing `src/utils/colorUtils.ts` migration utilities.
- [x] Move extension runtime scripts from `public/*.js` into typed `src/extension/*.ts`, bundle them with Vite, and update manifest outputs.
- [x] Reduce default extension permissions by replacing always-on `<all_urls>` content script injection with optional host access plus on-demand injection for the command palette.
- [x] Add privacy controls for browser usage tracking so URL path/title collection is opt-in and domain-only tracking is the default.
- [x] Add a shared fetch timeout/retry helper and use it for DeepSeek and GitHub API calls.
- [x] Improve sensitive-data handling and warnings for AI Key, GitHub token, and remembered sync password.
- [x] Run lint, typecheck, build, and audit; document the result.

## Repair Review
- Added `src/base/colorUtils.ts` and kept `src/utils/colorUtils.ts` for conversion/migration utilities.
- Replaced the unavailable `@pretty-cozy/eslint-config` with installable ESLint/TypeScript/React/a11y/Sonar dependencies; regenerated `package-lock.json`.
- Added `dev`, `typecheck`, `verify`, `build:extension`, and non-overwriting `build:zip` scripts; generated versioned/timestamped zip files under `dist/`.
- Moved extension runtime code to `src/extension/background.ts` and `src/extension/contentScript.ts`; Vite now emits fixed `assets/background.js` and `assets/contentScript.js`.
- Updated manifest to remove default `<all_urls>` host permission and default content script injection. Browser usage tracking now uses optional `http/https` host permissions and explicit user settings.
- Browser usage tracking defaults to disabled and domain-only; path and title collection are separate opt-in settings.
- Added `fetchWithTimeout` and used it for DeepSeek calls, GitHub API calls, and Gist raw file retrieval.
- Added AI sharing control for browser usage data; default is not to send browser usage to AI.
- Added local settings schema validation with corrupted-key quarantine for core startpage settings.
- Upgraded `gh-pages` to remove the critical audit finding.
- Enabled the Emotion Babel transform and removed remaining unsupported component-selector usage from link UI hover styles.
- Fixed dev/runtime crashes by guarding optional `chrome.runtime.onMessage` access and preventing development service-worker caches from serving stale Vite modules.
- Restricted the production service worker to same-origin GET requests and bumped its cache version.
- Fixed React DOM prop leakage for styled `loading` props in AI greeting/link settings.
- Browser verification passed on `http://127.0.0.1:5173/`: page renders without ErrorBoundary and no error-level console logs after cleanup/reload.
- Earlier repair verification passed at that point: `npm run verify`, `npm run build:extension`, `npm run build:zip`, and `npm audit --json`. After the later runtime/UI/tooling fixes, current verification should be read from the runtime review above: `npm run verify`, `npm run build`, and browser smoke tests pass.
- Final zip generated: `dist/fluidity-0.6.1-20260608T045758.zip`.

## Plan
- [x] Read existing repository context and lessons.
- [x] Review browser extension manifest, permissions, public scripts, and entry points.
- [x] Review build configuration, dependencies, TypeScript settings, lint/test availability.
- [x] Inspect core app services and UI flows for reliability, privacy, performance, and maintainability risks.
- [x] Run available verification commands without altering application data.
- [x] Summarize findings, optimization priorities, and suggested next steps.

## Review
- Current working tree already contains many unrelated edits; they were not reverted.
- Critical build risk: `src/base/colorUtils` is imported by app, palette, and popup code, but no such file exists in the worktree.
- Dependency verification is broken: `package-lock.json` currently contains an empty `packages` object, `node_modules` is absent, `npm run lint` cannot find `eslint`, and `npx tsc --noEmit` resolves to the deprecated `tsc` package instead of the TypeScript compiler.
- Extension review/privacy risk: manifest grants `<all_urls>` host access and injects `contentScript.js` into all pages to send URL/path/title heartbeats every 5 seconds.
- Security risk: AI API key is stored in `localStorage`; Gist token and optional remembered sync password are stored in extension/local storage config.
- Reliability risk: DeepSeek/GitHub fetches have no AbortController timeout/retry wrapper; UI flows can hang on slow network.
- Engineering risk: public extension scripts are plain JS under `public/` and are excluded from TypeScript/lint coverage.
