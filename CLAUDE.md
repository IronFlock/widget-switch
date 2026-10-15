# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run start` — Vite dev server at http://localhost:8000/demo/ with `vite build --watch` running in parallel.
- `npm run build` — Production library build to `dist/` (ES module, sourcemaps).
- `npm run watch` — Library build in watch mode without dev server.
- `npm run types` — Regenerate `src/definition-schema.d.ts` from `src/definition-schema.json` via `json2ts` (requires `json-schema-to-typescript` installed globally or via `npx`; the script uses `cat | json2ts`).
- `npm run release` — `npm version patch`: preflight guards (on `main`, clean tree, not behind `origin/main`, generated files current, build passes), then the bump and a `dist/` rebuild (the `version` hook, so the local build registers the new tag), then commit, bare-semver tag, `git push --follow-tags`, then waits on the CI run and fails if the npm publish fails. `npm run release:minor` / `release:major` for other bumps.
- `npm run link` / `npm run unlink` — Local-link this package into the sibling `../RESWARM/frontend` project.
- No test runner is configured.
- Engines: Node `>=24.9.0`, npm `>=10.0.2`.

## Architecture

Single-component Lit 3 web component published as `@ironflock/widget-switch` for the IronFlock platform. Renders one or more Material Design 3 toggle switches (`md-switch`) and emits action events to control IoT devices.

**Versioned custom element tag.** The source defines `@customElement('widget-switch-versionplaceholder')`. At build time, `@rollup/plugin-replace` (in `vite.config.ts`) replaces every `versionplaceholder` occurrence with the `version` string from `package.json`, yielding e.g. `widget-switch-1.1.3`. Consumers must use the version-suffixed tag — this lets multiple widget versions coexist on one page. The `version` instance field on `WidgetSwitch` is replaced the same way. Bumping the version (via `npm version` / `npm run release`) is what regenerates the tag; do not hardcode versions elsewhere.

**Build pipeline (`vite.config.ts`).** Library mode, single entry `src/widget-switch.ts`, ES output only. `lit`, `@lit/*`, and `@material/web/*` are externalized — the consumer (or an import map) must provide them. `@material/web` is a peerDependency for this reason. `tslib` is aliased to its ES build; browser conditions are forced.

**Data flow.**
1. Host sets the `inputData` property (shape defined by `src/definition-schema.json` → generated `src/definition-schema.d.ts`). The schema is the source of truth and drives the platform's config UI; regenerate the `.d.ts` after schema edits via `npm run types`.
2. `update()` / `firstUpdated()` calls `transformData()`, which pivots `inputData.dataseries` into a `Map<label, Dataseries>` (deduplicating duplicate labels by appending `-<idx>`) and computes each switch's initial `selected` via `isSelected()`.
3. `isSelected()` interprets `stateMap.on` / `stateMap.off`:
   - Operator prefixes `<=`, `<`, `>=`, `>` on `on` (or fallback `off`) drive numeric comparison.
   - Otherwise comma-separated value lists are matched as strings (quotes stripped).
   - Returns `undefined` for unknown — switch shows neutral.
4. `render()` renders each switch with `repeat()` keyed by label, attaching `actionApp` / `actionDevice` / `actionTopic` / `label` as Lit properties on the `md-switch` element.
5. On `change`, `handleActionSubmit()` dispatches a non-bubbling `action-submit` `CustomEvent` with `{ args, actionApp, actionDevice, actionTopic, label }` — the IronFlock host listens for this to invoke device actions.

**Theming.** `registerTheme()` reads CSS custom properties (`--re-text-color`, `--re-primary-color`) from the host and falls back to a `theme` property of shape `{ theme_name, theme_object }` (ECharts-like: `title.textStyle.color`, `title.subtextStyle.color`, `color[0]`). Resolved values are pushed into `--switch-primary-color` / `--switch-text-color` which drive the `md-switch` Material tokens in the static styles. The default primary color is `#5470c6`. These are not snapshotted: `registerTheme()` stores a `var(--re-…, <theme value>)` chain, so a change to the host property repaints the tile live without the widget being told. The widget paints no background of its own: studio's `widget-item` already paints `--re-tile-background-color` on the tile, and painting it again here composited a translucent tile colour twice.

**Demo (`demo/index.html`).** Imports the source TS directly, builds the version-suffixed tag at runtime from `package.json`, applies `demo/themes/light.json`, and randomizes `dataseries.0.data.0.value` every second via the external `ObjectRandomizer.js` from `storage.googleapis.com/reswarm-images`. Use this to exercise reactive updates locally.

**`applyData()` is currently a no-op** — kept as a hook for the resize-observer-driven layout pattern shared with sibling widgets in this repo.

## `aiSelection` in `src/definition-schema.json`

The schema root carries an `aiSelection` block next to `title` and `description`. It is **not** JSON Schema and describes no config field — it exists so the IronFlock AI's Widget Builder can pick the right widget for a given shape of data, using knowledge only the widget author has:

```jsonc
"aiSelection": {
  "dataShape": "…what columns this widget consumes and what each one means…",
  "useWhen":   ["…a situation, naming the properties that express it…"],
  "notFor":    ["…a situation this widget is wrong for, naming the widget to use instead…"]
}
```

It is inert everywhere else, and must stay that way: `json2ts` ignores it (the generated `.d.ts` is byte-identical with and without it), the dashboard config editor renders only `schema.properties`, and the AI service's `validate_widget` validates *configs* against the schema, skipping unknown Draft-7 keywords.

When maintaining it:

- `notFor` is the high-value half and the part plain descriptions always omit. Every entry must name the widget that *should* be used, or it rejects without routing.
- Write for an LLM with no other documentation: describe the visible result and the user's intent, not the implementation.
- Prefer entries that discriminate against a *neighbouring* widget. Generic rejections are cheap; the ones that pay are those an author could plausibly get wrong.
- The `notFor` lists are a set across all `widget-*` repos and are meant to be reciprocal — if this widget routes to another for some case, that widget should usually route back for the converse. Changing one side is a cue to check the other.
- Update it whenever a property changes what this widget can *do*, not just how it looks.
