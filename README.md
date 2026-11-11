# widget-switch

IronFlock widget: A Lit 3.x web component that renders toggle switches using Material Design 3 components. Supports multiple switches with configurable state mapping and IoT device action triggers, or URL parameters that other widgets filter on, in three sizes.

![screenshot](thumbnail.png)

## Installation

```bash
npm i @ironflock/widget-switch
```

**Peer Dependencies:** This widget requires `@material/web` to be available at runtime via import map or bundled separately.

## Usage

```html
<script type="module">
    import '@ironflock/widget-switch'
</script>

<widget-switch-1.1.1></widget-switch-1.1.1>
```

> **Note:** The element tag includes the version number (e.g., `widget-switch-1.1.1`). This is replaced at build time via `@rollup/plugin-replace`.

## Configuration

The widget accepts an `inputData` property with the following structure:

```typescript
interface SwitchConfiguration {
    title?: string
    subTitle?: string
    size?: 'small' | 'normal' | 'big' // default 'normal'
    dataseries?: Array<{
        label?: string
        description?: string // hint text below the label
        value?: string
        stateMap?: {
            on: string // Value(s) representing ON state
            off: string // Value(s) representing OFF state
        }
        actionDevice?: string
        actionApp?: string
        actionTopic?: string
        parameterKey?: string // makes this a view switch, see below
        parameterValue?: string // written while ON, default 'true'
        targetColumn?: ColumnRef // stores the position in a table, see below
        extraColumns?: Array<{ targetColumn?: ColumnRef; value?: string }>
    }>
}
```

## State Mapping

The `stateMap` configuration determines how values are interpreted as ON/OFF states:

**Exact values:**

```json
{ "on": "true, 1, active", "off": "false, 0, inactive" }
```

**Numeric comparisons:**

```json
{ "on": ">50", "off": "<=50" }
{ "on": ">=100", "off": "<100" }
```

Supported operators: `<`, `<=`, `>`, `>=`

## Action Events

When a switch is toggled, the widget dispatches an `action-submit` custom event:

```javascript
element.addEventListener('action-submit', (e) => {
    console.log(e.detail)
    // {
    //   args: true/false,      // New switch state
    //   actionApp: "...",      // Target app
    //   actionDevice: "...",   // Target device ID
    //   actionTopic: "...",    // Action topic to call
    //   label: "..."           // Switch label
    // }
})
```

## URL Parameters

A switch with a `parameterKey` sets a URL parameter instead of firing a device action, the same way `widget-filter-dropdown` does. Its position is read from the `route` property the host passes in:

```javascript
element.route = '/machines?onlyAlarms=ALARM'
element.addEventListener('param-submit', (e) => {
    console.log(e.detail)
    // ON:  { params: { onlyAlarms: 'ALARM' } }   (parameterValue, default 'true')
    // OFF: { params: { onlyAlarms: undefined } } (remove the parameter)
})
```

## Table Writes

A switch with a `targetColumn` stores its position in a table, as a form does: every click dispatches a `data-submit` with one row, the `extraColumns` (such as the id of the record the switch belongs to) and then the switch's own column, `true` for ON and `false` for OFF (`1`/`0` in a numeric column). Bind `value` to the latest value of the same column for that record, with `stateMap` `{ "on": "true", "off": "false" }`, and the switch shows what is stored. While an extra column has no value yet, the switch is disabled. It fires `action-submit` only when it also has an `actionTopic`.

```javascript
element.addEventListener('data-submit', (e) => {
    console.log(e.detail)
    // [
    //   { swarm_app_databackend_key: 1, table_name: 'model_settings', column_name: 'model_id', value: 'model-a' },
    //   { swarm_app_databackend_key: 1, table_name: 'model_settings', column_name: 'tensorrt', value: true }
    // ]
})
```

## Theming

The widget supports theming via CSS custom properties or the `theme` property:

**CSS Custom Properties:**

```css
widget-switch-1.1.1 {
    --re-text-color: #333;
    --re-tile-background-color: #fff;
}
```

**Theme Object:**

```javascript
element.theme = {
    theme_name: 'dark',
    theme_object: {
        backgroundColor: '#1a1a1a',
        title: {
            textStyle: { color: '#fff' },
            subtextStyle: { color: '#aaa' }
        }
    }
}
```

## Development

```bash
npm run start    # Dev server at localhost:8000/demo/
npm run build    # Production build to dist/
npm run types    # Regenerate TypeScript types from schema
just release-patch  # release pull request; its merge publishes to npm
```

## License

MIT
