# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run start` — Vite dev server at http://localhost:8000/demo/ with `vite build --watch` running in parallel.
- `npm run build` — Production library build to `dist/` (ES module, sourcemaps).
- `npm run watch` — Library build in watch mode without dev server.
- `npm run types` — Regenerate `src/definition-schema.d.ts` from `src/definition-schema.json` via `json2ts` (requires `json-schema-to-typescript` installed globally or via `npx`; the script uses `cat | json2ts`).
- `just lint` — what the CI gate checks besides the build: regenerating the committed generated files (`npm run types`) changes nothing. `just build` = `npm run build`.
- `just merge` / `just release-patch` (`release-minor`, `release-major`) — pull requests into `main` from a feature branch with everything committed: a no-release one, or a release one whose merge publishes to npm in CI (`.github/workflows/build-publish.yml`), then the release GitHub App tags the bare version and creates the GitHub release. Never `npm publish`, tag or edit the version by hand.
- `npm run link` / `npm run unlink` — Local-link this package into the sibling `../RESWARM/frontend` project.
- No test runner is configured.
- Engines: Node `>=24.9.0`, npm `>=10.0.2`.

## Architecture

Single-component Lit 3 web component published as `@ironflock/widget-switch` for the IronFlock platform. Renders one or more Material Design 3 toggle switches (`md-switch`) and emits action events to control IoT devices, or sets URL parameters that other widgets filter on.

**Versioned custom element tag.** The source defines `@customElement('widget-switch-versionplaceholder')`. At build time, `@rollup/plugin-replace` (in `vite.config.ts`) replaces every `versionplaceholder` occurrence with the `version` string from `package.json`, yielding e.g. `widget-switch-1.1.3`. Consumers must use the version-suffixed tag — this lets multiple widget versions coexist on one page. The `version` instance field on `WidgetSwitch` is replaced the same way. Bumping the version (`just release-patch`) is what regenerates the tag; do not hardcode versions elsewhere.

**Build pipeline (`vite.config.ts`).** Library mode, single entry `src/widget-switch.ts`, ES output only. `lit`, `@lit/*`, and `@material/web/*` are externalized — the consumer (or an import map) must provide them. `@material/web` is a peerDependency for this reason. `tslib` is aliased to its ES build; browser conditions are forced.

**Data flow.**
1. Host sets the `inputData` property (shape defined by `src/definition-schema.json` → generated `src/definition-schema.d.ts`). The schema is the source of truth and drives the platform's config UI; regenerate the `.d.ts` after schema edits via `npm run types`.
2. `update()` calls `transformData()` whenever `inputData` or `route` changes. It copies `inputData.dataseries` into a `Map<label, Dataseries>` in configured order (deduplicating duplicate labels by appending `-<idx>`) and computes each switch's `selected` in `switchState()`: from the URL for a view switch (one with a `parameterKey`, see below), otherwise from the reported `value` via `isSelected()`, subject to pending requests (see below).
3. `isSelected()` interprets `stateMap.on` / `stateMap.off`:
   - Operator prefixes `<=`, `<`, `>=`, `>` on `on` (or fallback `off`) drive numeric comparison.
   - Otherwise comma-separated value lists are matched as strings (surrounding quotes stripped).
   - Returns `undefined` for unknown. `md-switch` has no neutral state, so an unknown value draws the switch OFF.
4. `render()` renders each switch with `repeat()` keyed by label, binding `.selected` through `live()` so every render puts the switch back in its computed position even when that position has not changed since the last render (a plain binding skips the DOM when the value is unchanged, which left a flipped switch flipped). `updated()` then copies each `md-switch`'s `selected` onto its inner checkbox: @material/web 2.4.1 binds that checkbox's `checked` *attribute*, which a browser ignores once the user has clicked it, so without the copy a switch moved by anything but a click kept its checkbox on the old position and the next click toggled from there. The `size` attribute on `.wrapper` (`small` | `normal` | `big`) sets `--switch-scale` plus the label and hint font sizes; the scale multiplies the `md-switch` track, handle and state-layer tokens and the gaps. `normal` is the Material default size.
5. On `change`, `handleChange()` dispatches a non-bubbling `action-submit` `CustomEvent` with `{ args, actionApp, actionDevice, actionTopic, label }` — the IronFlock host listens for this to invoke device actions. The event is fire-and-forget: the widget never learns whether the action succeeded.

**Pending requests.** Because of that, `handleChange()` records the flipped position in `requests` (keyed by label). On a switch with a reported `value`, the request carries a `CONFIRM_TIMEOUT_MS` (10 s) timer: until the report agrees or the timer fires, the switch holds the operator's position across data refreshes; afterwards the report wins, so a failed action returns the switch to the device's real state. On a switch with no `value` there is nothing to confirm, and the request is simply the switch's state.

**View switches (URL parameters).** A switch with `parameterKey` set dispatches a bubbling, composed `param-submit` with `detail: { params: { [parameterKey]: parameterValue || 'true' } }` when turned ON and `{ [parameterKey]: undefined }` when turned OFF — the convention widget-filter-dropdown uses. It fires no `action-submit`. Studio's `dashboard-navigator` merges the params into the URL (undefined removes one) and hands the new URL back as the `route` property; the switch reads its position from there, so it survives a reload and a shared link. Other widgets follow it through a `filterAnd` condition with `useFilter: true`; studio drops that condition while the parameter is absent. Two switches on the same key with different values behave like radio buttons.

**Theming.** `registerTheme()` reads CSS custom properties (`--re-text-color`, `--re-primary-color`) from the host and falls back to a `theme` property of shape `{ theme_name, theme_object }` (ECharts-like: `title.textStyle.color`, `title.subtextStyle.color`, `color[0]`). Resolved values are pushed into `--switch-primary-color` / `--switch-text-color` which drive the `md-switch` Material tokens in the static styles. The default primary color is `#5470c6`. These are not snapshotted: `registerTheme()` stores a `var(--re-…, <theme value>)` chain, so a change to the host property repaints the tile live without the widget being told. The widget paints no background of its own: studio's `widget-item` already paints `--re-tile-background-color` on the tile, and painting it again here composited a translucent tile colour twice.

**Demo (`demo/index.html`).** Imports the source TS directly, builds the version-suffixed tag at runtime from `package.json`, applies `demo/themes/light.json`, stands in for studio's `param-submit` handling (it rewrites `location.search` and passes `'/' + location.search` back as `route`), and re-delivers an unchanged copy of the data every second, as a dashboard refresh does. No device answers in the demo, so a flipped device switch shows the fallback after the confirm timeout.

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
