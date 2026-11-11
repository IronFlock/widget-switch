import { html, css, LitElement } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { live } from 'lit/directives/live.js'
import { customElement, property, state } from 'lit/decorators.js'
import { SwitchConfiguration } from './definition-schema.js'
import '@material/web/switch/switch.js'
import { MdSwitch } from '@material/web/switch/switch.js'

type Dataseries = Exclude<SwitchConfiguration['dataseries'], undefined>[number] & { selected?: boolean }
// The position an operator flipped a switch to. On a switch whose state the
// device reports, it carries a timer and only holds until the report agrees.
type Request = { selected: boolean; timer?: ReturnType<typeof setTimeout> }
type Theme = {
    theme_name: string
    theme_object: any
}

// Written into the URL parameter while a switch with a parameterKey is ON.
const DEFAULT_PARAMETER_VALUE = 'true'

// How long a flipped switch waits for the device to report its new state
// before it falls back to the state the device reports.
const CONFIRM_TIMEOUT_MS = 10000

// A table column a write switch fills, as the targetColumn picker stored it.
// The host resolves the app's key and checks the rest.
type ColumnRef = {
    swarm_app_databackend_key?: unknown
    tablename?: unknown
    column?: unknown
    dataType?: unknown
}

// One column value, as data-submit carries it. The host groups the items into
// one row per table and adds tsp.
type ValueItem = {
    swarm_app_databackend_key?: unknown
    table_name?: unknown
    column_name?: unknown
    value: unknown
}

// A picked column, or undefined when the config names no table and column.
function columnRef(target: unknown): ColumnRef | undefined {
    if (!target || typeof target !== 'object') return undefined
    const ref = target as ColumnRef
    const named = (part: unknown) => typeof part === 'string' && part.trim() !== ''
    return named(ref.tablename) && named(ref.column) ? ref : undefined
}

// The extra columns that name a column, with what each writes. A malformed
// list counts as empty.
function extraColumns(ds: Dataseries): { ref: ColumnRef; value: unknown }[] {
    if (!Array.isArray(ds.extraColumns)) return []
    return ds.extraColumns.flatMap((extra) => {
        const ref = columnRef(extra?.targetColumn)
        return ref ? [{ ref, value: extra?.value }] : []
    })
}

function hasNoValue(value: unknown): boolean {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

// A value as its column's type wants it. The editor stores a constant as text,
// so '12' or 'true' becomes a number or a boolean for those columns. What does
// not convert is written as it is, and the host reports the failed row.
function columnValue(value: unknown, dataType: unknown): unknown {
    if (dataType === 'boolean') {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        const text = String(value).trim().toLowerCase()
        if (text === 'true' || text === '1') return true
        if (text === 'false' || text === '0') return false
        return value
    }
    if (dataType === 'numeric' || dataType === 'bigint') {
        if (typeof value === 'boolean') return value ? 1 : 0
        if (typeof value === 'number') return value
        const text = String(value).trim()
        const n = Number(text)
        if (text === '' || !Number.isFinite(n)) return value
        // A bigint id beyond 2^53 would lose digits as a number.
        return dataType === 'bigint' && !Number.isSafeInteger(n) ? text : n
    }
    if (dataType === 'string' && (typeof value === 'boolean' || typeof value === 'number'))
        return String(value)
    return value
}

function valueItem(ref: ColumnRef, value: unknown): ValueItem {
    return {
        swarm_app_databackend_key: ref.swarm_app_databackend_key,
        table_name: ref.tablename,
        column_name: ref.column,
        value: columnValue(value, ref.dataType)
    }
}

// A switch that stores its position in a table. A view switch never does.
function isWriteSwitch(ds: Dataseries): boolean {
    return !ds.parameterKey && columnRef(ds.targetColumn) !== undefined
}

// The row a write switch stores for a position, or undefined while an extra
// column has no value: a row without its record's key would land nowhere.
// The switch's own column comes last, so it wins over an extra column that
// names the same column (the host keeps the later item).
function rowItems(ds: Dataseries, selected: boolean): ValueItem[] | undefined {
    const target = isWriteSwitch(ds) ? columnRef(ds.targetColumn) : undefined
    if (!target) return undefined
    const extras = extraColumns(ds)
    if (extras.some((extra) => hasNoValue(extra.value))) return undefined
    return [...extras.map((extra) => valueItem(extra.ref, extra.value)), valueItem(target, selected)]
}

@customElement('widget-switch-versionplaceholder')
export class WidgetSwitch extends LitElement {
    @property({ type: Object })
    inputData?: SwitchConfiguration

    @property({ type: Object })
    theme?: Theme

    @property({ type: String })
    route?: string

    @state()
    private dataSets: Map<string, Dataseries> = new Map()

    @state() private themeTitleColor?: string
    @state() private themeSubtitleColor?: string
    @state() private themePrimaryColor?: string

    version: string = 'versionplaceholder'

    // Keyed by switch label.
    private requests: Map<string, Request> = new Map()

    disconnectedCallback() {
        super.disconnectedCallback()
        this.requests.forEach((request, label) => {
            if (request.timer === undefined) return
            clearTimeout(request.timer)
            this.requests.delete(label)
        })
    }

    update(changedProperties: Map<string, any>) {
        if (changedProperties.has('inputData') || changedProperties.has('route')) {
            this.transformData()
        }

        if (changedProperties.has('theme') || !this.hasUpdated) {
            this.registerTheme()
        }

        super.update(changedProperties)
    }

    protected updated() {
        // md-switch binds its checkbox's checked *attribute*, which a browser
        // stops honouring once the user has clicked it. Without this, a switch
        // moved by a report, a timeout or the URL keeps its checkbox on the old
        // position, and the next click toggles from there.
        this.shadowRoot?.querySelectorAll('md-switch').forEach((sw) => {
            const input = sw.shadowRoot?.querySelector('input')
            if (input && input.checked !== sw.selected) input.checked = sw.selected
        })
    }

    registerTheme() {
        this.themeTitleColor = `var(--re-text-color, ${this.theme?.theme_object?.title?.textStyle?.color || 'inherit'})`
        this.themeSubtitleColor = `var(--re-text-color, ${this.theme?.theme_object?.title?.subtextStyle?.color || this.theme?.theme_object?.title?.textStyle?.color || 'inherit'})`
        this.themePrimaryColor = `var(--re-primary-color, ${this.theme?.theme_object?.color?.[0] || '#5470c6'})`
    }

    transformData() {
        if (!this.inputData) return
        const params = new URLSearchParams(this.route?.split('?')[1] ?? '')
        this.dataSets = new Map()
        this.inputData?.dataseries?.forEach((ds, idx) => {
            let label = ds.label
            if (this.dataSets.has(label ?? '')) {
                label += '-' + idx
            }
            const pds: Dataseries = {
                label: label,
                description: ds?.description,
                value: ds?.value,
                actionApp: ds?.actionApp,
                actionDevice: ds?.actionDevice,
                actionTopic: ds?.actionTopic,
                parameterKey: ds?.parameterKey,
                parameterValue: ds?.parameterValue,
                targetColumn: ds?.targetColumn,
                extraColumns: ds?.extraColumns,
                selected: this.switchState(ds, label ?? '', params)
            }
            this.dataSets.set(pds.label ?? '', pds)
        })
        this.requests.forEach((request, label) => {
            if (this.dataSets.has(label)) return
            clearTimeout(request.timer)
            this.requests.delete(label)
        })
    }

    switchState(ds: Dataseries, label: string, params: URLSearchParams): boolean {
        // A view switch is as ON as the URL says, not the data.
        if (ds.parameterKey) {
            return params.get(ds.parameterKey) === (ds.parameterValue || DEFAULT_PARAMETER_VALUE)
        }

        // With nothing reported, the switch is only what the operator set.
        const request = this.requests.get(label)
        if (!this.isReported(ds)) return request?.selected ?? false

        // Otherwise the device's report wins, except while a flip is still
        // waiting for it to agree.
        const reported = this.isSelected(ds) ?? false
        if (request?.timer !== undefined && request.selected !== reported) return request.selected
        clearTimeout(request?.timer)
        this.requests.delete(label)
        return reported
    }

    isReported(ds: Dataseries): boolean {
        return ds.value !== undefined && ds.value !== null
    }

    isSelected(ds: Dataseries): boolean | undefined {
        const value = ds.value
        if (value === undefined) return undefined
        const on = ds?.stateMap?.on
        if (on?.startsWith('<=')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(on.substring(2))
            return isNaN(val) || isNaN(comp) ? undefined : val <= comp
        }
        if (on?.startsWith('<')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(on.substring(1))
            return isNaN(val) || isNaN(comp) ? undefined : val < comp
        }
        if (on?.startsWith('>=')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(on.substring(2))
            return isNaN(val) || isNaN(comp) ? undefined : val >= comp
        }
        if (on?.startsWith('>')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(on.substring(1))
            return isNaN(val) || isNaN(comp) ? undefined : val > comp
        }

        const off = ds?.stateMap?.off
        if (off?.startsWith('<=')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(off.substring(2))
            return isNaN(val) || isNaN(comp) ? undefined : val > comp
        }
        if (off?.startsWith('<')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(off.substring(1))
            return isNaN(val) || isNaN(comp) ? undefined : val <= comp
        }
        if (off?.startsWith('>=')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(off.substring(2))
            return isNaN(val) || isNaN(comp) ? undefined : val < comp
        }
        if (off?.startsWith('>')) {
            const val = parseFloat(value ?? '')
            const comp = parseFloat(off.substring(1))
            return isNaN(val) || isNaN(comp) ? undefined : val <= comp
        }

        const onValues = on?.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')) ?? []
        if (onValues.includes(String(value))) return true

        const offValues = off?.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')) ?? []
        if (offValues.includes(String(value))) return false

        return undefined
    }

    handleChange(e: Event, ds: Dataseries) {
        const selected = (e.target as MdSwitch).selected

        // A view switch sets its URL parameter and nothing else. The host
        // merges it into the URL (undefined removes it) and hands the new
        // route back, which is where the switch reads its position from.
        if (ds.parameterKey) {
            const value = selected ? ds.parameterValue || DEFAULT_PARAMETER_VALUE : undefined
            this.dispatchEvent(
                new CustomEvent('param-submit', {
                    detail: { params: { [ds.parameterKey]: value } },
                    bubbles: true,
                    composed: true
                })
            )
            return
        }

        // A write switch is disabled while its row is incomplete; if an extra
        // column lost its value after the switch was drawn, nothing is written
        // and the next render puts the switch back.
        const write = isWriteSwitch(ds)
        const row = write ? rowItems(ds, selected) : undefined
        if (write && !row) {
            this.requestUpdate()
            return
        }

        const label = ds.label ?? ''
        clearTimeout(this.requests.get(label)?.timer)
        const timer = this.isReported(ds)
            ? setTimeout(() => {
                  this.requests.delete(label)
                  this.transformData()
              }, CONFIRM_TIMEOUT_MS)
            : undefined
        this.requests.set(label, { selected, timer })

        // The row goes to the host, which writes it into the app's table; the
        // stored value comes back through the switch's value binding.
        if (row) {
            this.dispatchEvent(
                new CustomEvent('data-submit', { detail: row, bubbles: false, composed: false })
            )
        }

        // A write switch calls a device only when it names a topic; any other
        // switch fires its action as before.
        if (write && !ds.actionTopic) return

        const payload = {
            args: selected,
            actionApp: ds.actionApp,
            actionDevice: ds.actionDevice,
            actionTopic: ds.actionTopic,
            label: ds.label
        }
        this.dispatchEvent(
            new CustomEvent('action-submit', {
                detail: payload,
                bubbles: false,
                composed: false
            })
        )
    }

    static styles = css`
        :host {
            display: block;
            font-family: sans-serif;
            box-sizing: border-box;
            position: relative;
            margin: auto;
            /* The tile is the container that .wrapper's cqh/cqw padding
               measures; without one they resolve against the viewport. */
            container-type: size;
        }

        .paging:not([active]) {
            display: none !important;
        }

        .wrapper {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding: 2cqh 2cqw;
            box-sizing: border-box;
            --switch-scale: 1;
            --switch-label-size: 1em;
            --switch-hint-size: 12px;
        }

        .wrapper[size='small'] {
            --switch-scale: 0.75;
            --switch-label-size: 0.875em;
            --switch-hint-size: 11px;
        }

        .wrapper[size='big'] {
            --switch-scale: 1.5;
            --switch-label-size: 1.375em;
            --switch-hint-size: 15px;
        }

        h3 {
            margin: 0;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        p {
            margin: 10px 0 0 0;
            max-width: 300px;
            font-size: 14px;
            line-height: 17px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .value-container {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            line-height: 0.9;
            flex: 1;
            overflow: hidden;
            position: relative;
            gap: calc(12px * var(--switch-scale));
        }

        .switch {
            overflow: hidden;
            display: flex;
            align-items: center;
            gap: calc(12px * var(--switch-scale));
            box-sizing: border-box;
        }

        .switch-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
            max-width: 300px;
            line-height: 1.2;
        }

        .switch-label {
            font-size: var(--switch-label-size);
        }

        .switch-hint {
            font-size: var(--switch-hint-size);
            line-height: 1.25;
            opacity: 0.75;
            overflow-wrap: anywhere;
        }

        md-switch {
            --md-switch-track-width: calc(52px * var(--switch-scale));
            --md-switch-track-height: calc(32px * var(--switch-scale));
            --md-switch-handle-width: calc(16px * var(--switch-scale));
            --md-switch-handle-height: calc(16px * var(--switch-scale));
            --md-switch-selected-handle-width: calc(24px * var(--switch-scale));
            --md-switch-selected-handle-height: calc(24px * var(--switch-scale));
            --md-switch-pressed-handle-width: calc(28px * var(--switch-scale));
            --md-switch-pressed-handle-height: calc(28px * var(--switch-scale));
            --md-switch-state-layer-size: calc(40px * var(--switch-scale));
            --md-switch-selected-handle-color: var(--switch-primary-color, #5470c6);
            --md-switch-selected-hover-handle-color: var(--switch-primary-color, #5470c6);
            --md-switch-selected-focus-handle-color: var(--switch-primary-color, #5470c6);
            --md-switch-selected-pressed-handle-color: var(--switch-primary-color, #5470c6);
            --md-switch-selected-track-color: color-mix(
                in srgb,
                var(--switch-primary-color, #5470c6) 40%,
                transparent
            );
            --md-switch-selected-hover-track-color: color-mix(
                in srgb,
                var(--switch-primary-color, #5470c6) 50%,
                transparent
            );
            --md-switch-selected-focus-track-color: color-mix(
                in srgb,
                var(--switch-primary-color, #5470c6) 50%,
                transparent
            );
            --md-switch-selected-pressed-track-color: color-mix(
                in srgb,
                var(--switch-primary-color, #5470c6) 50%,
                transparent
            );
            /* OFF. Material 2.4.1 names these without "unselected" (up to
               1.2.2 the widget set --md-switch-unselected-*, which nothing
               reads, so an OFF switch kept Material's light lavender track,
               also on dark tiles), and each state has a token of its own. */
            --switch-off-track: color-mix(in srgb, var(--switch-text-color, #464646) 20%, transparent);
            --md-switch-handle-color: var(--switch-text-color, #464646);
            --md-switch-hover-handle-color: var(--switch-text-color, #464646);
            --md-switch-focus-handle-color: var(--switch-text-color, #464646);
            --md-switch-pressed-handle-color: var(--switch-text-color, #464646);
            --md-switch-track-color: var(--switch-off-track);
            --md-switch-hover-track-color: var(--switch-off-track);
            --md-switch-focus-track-color: var(--switch-off-track);
            --md-switch-pressed-track-color: var(--switch-off-track);
            --md-switch-track-outline-color: var(--switch-text-color, #464646);
            --md-switch-hover-track-outline-color: var(--switch-text-color, #464646);
            --md-switch-focus-track-outline-color: var(--switch-text-color, #464646);
            --md-switch-pressed-track-outline-color: var(--switch-text-color, #464646);
            /* A write switch waiting for its record is disabled. Material
               draws that in its light scheme's near-black, which vanishes on
               a dark tile; the text colour reads on any. */
            --md-switch-disabled-handle-color: var(--switch-text-color, #464646);
            --md-switch-disabled-track-outline-color: var(--switch-text-color, #464646);
            --md-switch-disabled-selected-track-color: var(--switch-text-color, #464646);
        }
    `

    render() {
        return html`
            <div
                class="wrapper"
                size=${this.inputData?.size ?? 'normal'}
                style="color: ${this.themeTitleColor}; --switch-primary-color: ${this
                    .themePrimaryColor}; --switch-text-color: ${this.themeTitleColor}"
            >
                <header>
                    <h3 class="paging" ?active=${this.inputData?.title}>${this.inputData?.title}</h3>
                    <p
                        class="paging"
                        ?active=${this.inputData?.subTitle}
                        style="color: ${this.themeSubtitleColor}"
                    >
                        ${this.inputData?.subTitle}
                    </p>
                </header>

                <div class="value-container">
                    ${repeat(
                        [...this.dataSets.entries()],
                        ([label]) => label,
                        ([label, ds]) => {
                            return html`
                                <div class="switch">
                                    <div class="switch-text">
                                        <span class="switch-label">${label}</span>
                                        <span
                                            class="switch-hint paging"
                                            ?active=${!!ds.description}
                                            style="color: ${this.themeSubtitleColor}"
                                            >${ds.description}</span
                                        >
                                    </div>
                                    <label
                                        ><md-switch
                                            aria-label="${label}"
                                            .selected="${live(!!ds.selected)}"
                                            ?disabled=${isWriteSwitch(ds) && !rowItems(ds, !!ds.selected)}
                                            @change="${(e: Event) => this.handleChange(e, ds)}"
                                        ></md-switch
                                    ></label>
                                </div>
                            `
                        }
                    )}
                </div>
            </div>
        `
    }
}
