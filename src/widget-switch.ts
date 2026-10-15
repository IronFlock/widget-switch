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

        const label = ds.label ?? ''
        clearTimeout(this.requests.get(label)?.timer)
        const timer = this.isReported(ds)
            ? setTimeout(() => {
                  this.requests.delete(label)
                  this.transformData()
              }, CONFIRM_TIMEOUT_MS)
            : undefined
        this.requests.set(label, { selected, timer })

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
            --md-switch-unselected-handle-color: var(--switch-text-color, #464646);
            --md-switch-unselected-track-color: color-mix(
                in srgb,
                var(--switch-text-color, #464646) 20%,
                transparent
            );
            --md-switch-unselected-track-outline-color: var(--switch-text-color, #464646);
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
