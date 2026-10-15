import { html, css, LitElement, PropertyValueMap } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { customElement, property, state } from 'lit/decorators.js'
import { SwitchConfiguration } from './definition-schema.js'
import '@material/web/switch/switch.js'
import { MdSwitch } from '@material/web/switch/switch.js'

type Dataseries = Exclude<SwitchConfiguration['dataseries'], undefined>[number] & { needleValue?: number }
type Theme = {
    theme_name: string
    theme_object: any
}
@customElement('widget-switch-versionplaceholder')
export class WidgetSwitch extends LitElement {
    @property({ type: Object })
    inputData?: SwitchConfiguration

    @property({ type: Object })
    theme?: Theme

    @state()
    private dataSets: Map<string, Dataseries> = new Map()

    @state()
    private textActive: boolean = true

    @state() private themeTitleColor?: string
    @state() private themeSubtitleColor?: string
    @state() private themePrimaryColor?: string

    version: string = 'versionplaceholder'

    private resizeObserver: ResizeObserver

    valueContainer?: HTMLDivElement
    boxes?: HTMLDivElement[]
    origWidth: number = 0
    origHeight: number = 0
    constructor() {
        super()
        this.resizeObserver = new ResizeObserver(this.applyData.bind(this))
        this.resizeObserver.observe(this)
    }

    disconnectedCallback() {
        super.disconnectedCallback()
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
        this.valueContainer = this?.shadowRoot?.querySelector('.value-container') as HTMLDivElement

        this.registerTheme(this.theme)
        this.transformData()
        this.applyData()
    }

    update(changedProperties: Map<string, any>) {
        if (changedProperties.has('inputData')) {
            this.transformData()
            this.applyData()
        }

        if (changedProperties.has('theme')) {
            this.registerTheme(this.theme)
        }

        super.update(changedProperties)
    }

    registerTheme(theme?: Theme) {
        this.themeTitleColor = `var(--re-text-color, ${this.theme?.theme_object?.title?.textStyle?.color || 'inherit'})`
        this.themeSubtitleColor = `var(--re-text-color, ${this.theme?.theme_object?.title?.subtextStyle?.color || this.theme?.theme_object?.title?.textStyle?.color || 'inherit'})`
        this.themePrimaryColor = `var(--re-primary-color, ${this.theme?.theme_object?.color?.[0] || '#5470c6'})`
    }

    applyData() {}

    async transformData() {
        if (!this.inputData) return
        this.dataSets.forEach((d) => {
            d.label ??= ''
        })
        this.dataSets = new Map()
        this.inputData?.dataseries
            // ?.sort((a, b) => a.order - b.order)
            ?.forEach((ds, idx) => {
                // pivot data
                ds.selected = undefined
                let label = ds.label
                if (this.dataSets.has(label ?? '')) {
                    label += '-' + idx
                }
                const pds: Dataseries = {
                    label: label,
                    description: ds?.description,
                    actionApp: ds?.actionApp,
                    actionDevice: ds?.actionDevice,
                    actionTopic: ds?.actionTopic,
                    multiChart: ds.multiChart,
                    selected: this.isSelected(ds)
                }
                this.dataSets.set(pds.label ?? '', pds)
            })
        // console.log('Value Datasets', this.dataSets)
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

        const onValues = on?.split(',').map((v) => v.trim().replace('"', '').replace("'", '')) ?? []
        if (onValues.includes(String(value) ?? '')) return true

        const offValues = off?.split(',').map((v) => v.trim().replace('"', '').replace("'", '')) ?? []
        if (offValues.includes(String(value) ?? '')) return false

        return undefined
    }

    handleActionSubmit(e: any) {
        const switchEl = e.target
        const payload = {
            args: switchEl?.selected,
            actionApp: switchEl?.actionApp,
            actionDevice: switchEl?.actionDevice,
            actionTopic: switchEl?.actionTopic,
            label: switchEl?.label
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
            gap: 12px;
        }

        .switch {
            overflow: hidden;
            display: flex;
            align-items: center;
            gap: 12px;
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

        .switch-hint {
            font-size: 12px;
            line-height: 15px;
            opacity: 0.75;
            overflow-wrap: anywhere;
        }

        md-switch {
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

        .no-data {
            font-size: 20px;
            display: flex;
            height: 100%;
            width: 100%;
            text-align: center;
            align-items: center;
            justify-content: center;
        }
    `

    render() {
        return html`
            <div
                class="wrapper"
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
                        [...this.dataSets.entries()].sort(),
                        ([label]) => label,
                        ([label, ds]) => {
                            return html`
                                <div class="switch" label="${label}">
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
                                            ?selected="${!!ds.selected}"
                                            .actionApp="${ds?.actionApp}"
                                            .actionDevice="${ds?.actionDevice}"
                                            .actionTopic="${ds?.actionTopic}"
                                            .label="${label}"
                                            @change="${this.handleActionSubmit}"
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
