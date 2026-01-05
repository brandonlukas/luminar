import type { ColorPreset, ParticleParams, SliderHandle } from '../lib/types'
import { COLOR_PRESETS, defaultParams, FIELD_BORDER_MIN, FIELD_BORDER_MAX } from '../lib/constants'
import { PointsMaterial } from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export class ControlPanel {
    private panel!: HTMLDivElement
    private content!: HTMLDivElement
    private controlHandles = new Map<string, SliderHandle>()
    private selectHandles = new Map<string, HTMLSelectElement>()
    private trailToggle?: HTMLInputElement
    private fieldButtons: Record<'left' | 'right', HTMLButtonElement | null> = { left: null, right: null }
    private fieldStatuses: Record<'left' | 'right', HTMLSpanElement | null> = { left: null, right: null }
    private advancedSection?: HTMLDivElement
    private advancedToggle?: HTMLButtonElement
    private container: HTMLElement
    private params: ParticleParams
    private material: PointsMaterial
    private bloomPass: UnrealBloomPass
    private callbacks: {
        onParticleCountChange: (count: number) => void
        onLifetimeChange: () => void
        onTrailToggle: (enabled: boolean) => void
        onTrailDecayChange: (value: number) => void
        onClearFieldA: () => void
        onClearFieldB: () => void
        onColorChange: () => void
    }

    constructor(
        container: HTMLElement,
        params: ParticleParams,
        material: PointsMaterial,
        bloomPass: UnrealBloomPass,
        callbacks: {
            onParticleCountChange: (count: number) => void
            onLifetimeChange: () => void
            onTrailToggle: (enabled: boolean) => void
            onTrailDecayChange: (value: number) => void
            onClearFieldA: () => void
            onClearFieldB: () => void
            onColorChange: () => void
        },
    ) {
        this.container = container
        this.params = params
        this.material = material
        this.bloomPass = bloomPass
        this.callbacks = callbacks
    }

    create() {
        this.panel = document.createElement('div')
        this.panel.className = 'controls'

        const header = document.createElement('div')
        header.className = 'controls__header'

        const title = document.createElement('div')
        title.className = 'controls__title'
        title.textContent = 'Controls'

        const toggleBtn = document.createElement('button')
        toggleBtn.className = 'controls__toggle'
        toggleBtn.textContent = '−'
        toggleBtn.type = 'button'
        toggleBtn.addEventListener('click', () => {
            this.panel.classList.toggle('controls--collapsed')
            toggleBtn.textContent = this.panel.classList.contains('controls--collapsed') ? '+' : '−'
            // Trigger resize to recalculate field offset
            window.dispatchEvent(new Event('resize'))
        })

        header.appendChild(title)
        header.appendChild(toggleBtn)
        this.panel.appendChild(header)

        // Scrollable content container (header stays sticky)
        this.content = document.createElement('div')
        this.content.className = 'controls__body'
        this.panel.appendChild(this.content)

        // Field colors
        const colorControlA = this.addSelect('Field A color', COLOR_PRESETS, this.params.colorPresetA, (key) => {
            this.params.colorPresetA = key
            this.callbacks.onColorChange()
        })
        const colorControlB = this.addSelect('Field B color', COLOR_PRESETS, this.params.colorPresetB, (key) => {
            this.params.colorPresetB = key
            this.callbacks.onColorChange()
        })
        this.selectHandles.set('colorA', colorControlA)
        this.selectHandles.set('colorB', colorControlB)

        // Speed
        const speedControl = this.addSlider(
            this.content,
            'Speed',
            0.1,
            8,
            0.1,
            this.params.speed,
            (value: number) => {
                this.params.speed = value
            },
        )
        this.controlHandles.set('speed', speedControl)

        // Advanced section
        const advancedToggle = document.createElement('button')
        advancedToggle.type = 'button'
        advancedToggle.className = 'controls__button'
        advancedToggle.textContent = 'Show advanced'
        this.advancedToggle = advancedToggle

        const advancedSection = document.createElement('div')
        advancedSection.className = 'controls__advanced'
        advancedSection.style.display = 'none'
        this.advancedSection = advancedSection

        // Noise strength
        const noiseControl = this.addSlider(advancedSection, 'Noise', 0, 1, 0.01, this.params.noiseStrength, (value) => {
            this.params.noiseStrength = value
        })
        this.controlHandles.set('noiseStrength', noiseControl)

        // Size
        const sizeControl = this.addSlider(advancedSection, 'Size', 0.5, 4, 0.1, this.params.size, (value) => {
            this.params.size = value
            this.material.size = value
        })
        this.controlHandles.set('size', sizeControl)

        // Particle count
        const particleCountControl = this.addSlider(
            advancedSection,
            'Particle count',
            100,
            8000,
            100,
            this.params.particleCount,
            (value) => {
                this.params.particleCount = Math.round(value)
                this.callbacks.onParticleCountChange(this.params.particleCount)
            },
        )
        this.controlHandles.set('particleCount', particleCountControl)

        // Bloom strength
        const bloomStrengthControl = this.addSlider(
            advancedSection,
            'Bloom strength',
            0.2,
            2.5,
            0.05,
            this.params.bloomStrength,
            (value) => {
                this.params.bloomStrength = value
                this.updateBloom()
            },
        )
        this.controlHandles.set('bloomStrength', bloomStrengthControl)

        // Bloom radius
        const bloomRadiusControl = this.addSlider(
            advancedSection,
            'Bloom radius',
            0.0,
            1.2,
            0.02,
            this.params.bloomRadius,
            (value) => {
                this.params.bloomRadius = value
                this.updateBloom()
            },
        )
        this.controlHandles.set('bloomRadius', bloomRadiusControl)

        // Life min
        const lifeMinControl = this.addSlider(advancedSection, 'Life min (s)', 0.1, 2.0, 0.05, this.params.lifeMin, (value) => {
            this.params.lifeMin = value
            if (this.params.lifeMin > this.params.lifeMax) {
                this.params.lifeMax = value
                const lifeMaxHandle = this.controlHandles.get('lifeMax')
                if (lifeMaxHandle) this.syncSlider(lifeMaxHandle, this.params.lifeMax)
            }
            this.callbacks.onLifetimeChange()
        })
        this.controlHandles.set('lifeMin', lifeMinControl)

        // Life max
        const lifeMaxControl = this.addSlider(advancedSection, 'Life max (s)', 0.2, 5.0, 0.05, this.params.lifeMax, (value) => {
            this.params.lifeMax = value
            if (this.params.lifeMax < this.params.lifeMin) {
                this.params.lifeMin = value
                const lifeMinHandle = this.controlHandles.get('lifeMin')
                if (lifeMinHandle) this.syncSlider(lifeMinHandle, this.params.lifeMin)
            }
            this.callbacks.onLifetimeChange()
        })
        this.controlHandles.set('lifeMax', lifeMaxControl)

        // Field border
        const fieldDistControl = this.addSlider(
            advancedSection,
            'Field border',
            FIELD_BORDER_MIN,
            FIELD_BORDER_MAX,
            0.01,
            this.params.fieldValidDistance,
            (value) => {
                this.params.fieldValidDistance = value
            },
        )
        this.controlHandles.set('fieldDist', fieldDistControl)

        // Trails toggle
        const trailsToggle = this.addToggle(advancedSection, 'Trails', this.params.trailsEnabled, (enabled) => {
            this.params.trailsEnabled = enabled
            this.callbacks.onTrailToggle(enabled)
        })
        this.trailToggle = trailsToggle

        // Trail decay
        const trailDecayControl = this.addSlider(
            advancedSection,
            'Trail decay',
            0.7,
            0.99,
            0.005,
            this.params.trailDecay,
            (value) => {
                this.params.trailDecay = value
                this.callbacks.onTrailDecayChange(value)
            },
        )
        this.controlHandles.set('trailDecay', trailDecayControl)

        advancedToggle.addEventListener('click', () => {
            const isHidden = advancedSection.style.display === 'none'
            advancedSection.style.display = isHidden ? 'block' : 'none'
            advancedToggle.textContent = isHidden ? 'Hide advanced' : 'Show advanced'
        })

        this.content.appendChild(advancedToggle)
        this.content.appendChild(advancedSection)

        // Reset button (right after advanced section)
        const resetBtn = document.createElement('button')
        resetBtn.type = 'button'
        resetBtn.className = 'controls__button'
        resetBtn.textContent = 'Reset to defaults'
        resetBtn.addEventListener('click', () => this.reset())
        this.content.appendChild(resetBtn)

        // Field management
        const fieldSection = document.createElement('div')
        fieldSection.className = 'controls__section'
        const fieldSubtitle = document.createElement('div')
        fieldSubtitle.className = 'controls__subtitle'
        fieldSubtitle.textContent = 'Fields'
        fieldSection.appendChild(fieldSubtitle)

        const clearARow = this.buildFieldRow('Field A', 'left', () => this.callbacks.onClearFieldA())
        fieldSection.appendChild(clearARow)

        const clearBRow = this.buildFieldRow('Field B', 'right', () => this.callbacks.onClearFieldB())
        fieldSection.appendChild(clearBRow)

        this.content.appendChild(fieldSection)

        this.container.appendChild(this.panel)
    }

    setFieldState(side: 'left' | 'right', state: { label: string; loaded: boolean }) {
        const button = this.fieldButtons[side]
        const status = this.fieldStatuses[side]
        if (!button || !status) return

        button.textContent = state.loaded ? 'Clear' : 'Empty'
        button.disabled = !state.loaded
        button.classList.toggle('controls__button--empty', !state.loaded)
        status.textContent = state.label
    }

    syncFieldValidDistance(value: number) {
        this.params.fieldValidDistance = value
        const handle = this.controlHandles.get('fieldDist')
        if (handle) {
            this.syncSlider(handle, value)
        }
    }

    private reset() {
        Object.assign(this.params, defaultParams)
        this.material.size = this.params.size
        this.updateBloom()
        this.callbacks.onParticleCountChange(this.params.particleCount)
        this.callbacks.onLifetimeChange()
        this.callbacks.onTrailToggle(this.params.trailsEnabled)
        this.callbacks.onTrailDecayChange(this.params.trailDecay)
        this.callbacks.onColorChange()

        // Sync all controls
        for (const [key, handle] of this.controlHandles.entries()) {
            const paramKey = key as keyof ParticleParams
            if (typeof this.params[paramKey] === 'number') {
                this.syncSlider(handle, this.params[paramKey] as number)
            }
        }

        for (const [key, select] of this.selectHandles.entries()) {
            if (key === 'colorA') {
                select.value = this.params.colorPresetA
            }
            if (key === 'colorB') {
                select.value = this.params.colorPresetB
            }
        }

        if (this.trailToggle) {
            this.trailToggle.checked = this.params.trailsEnabled
        }

    }

    private addToggle(parent: HTMLDivElement | HTMLElement, label: string, value: boolean, onChange: (value: boolean) => void) {
        const row = document.createElement('label')
        row.className = 'controls__row'

        const text = document.createElement('span')
        text.textContent = label

        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = value
        input.addEventListener('change', (event) => {
            const next = (event.target as HTMLInputElement).checked
            onChange(next)
        })

        row.appendChild(text)
        row.appendChild(input)
        parent.appendChild(row)

        return input
    }

    private addSlider(
        parent: HTMLDivElement | HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        value: number,
        onChange: (value: number) => void,
    ): SliderHandle {
        const row = document.createElement('label')
        row.className = 'controls__row'

        const text = document.createElement('span')
        text.textContent = label

        const input = document.createElement('input')
        input.type = 'range'
        input.min = String(min)
        input.max = String(max)
        input.step = String(step)
        input.value = String(value)

        const valueTag = document.createElement('span')
        valueTag.className = 'controls__value'
        valueTag.textContent = this.formatValue(value, step)

        input.addEventListener('input', (event) => {
            const next = parseFloat((event.target as HTMLInputElement).value)
            valueTag.textContent = this.formatValue(next, step)
            onChange(next)
        })

        row.appendChild(text)
        row.appendChild(input)
        row.appendChild(valueTag)
        parent.appendChild(row)

        return { input, valueTag }
    }

    private addSelect(label: string, options: ColorPreset[], value: string, onChange: (key: string) => void): HTMLSelectElement {
        const row = document.createElement('label')
        row.className = 'controls__row'

        const text = document.createElement('span')
        text.textContent = label

        const select = document.createElement('select')
        select.className = 'controls__select'
        for (const option of options) {
            const optEl = document.createElement('option')
            optEl.value = option.key
            optEl.textContent = option.label
            select.appendChild(optEl)
        }
        select.value = value
        select.addEventListener('change', (event) => {
            const next = (event.target as HTMLSelectElement).value
            onChange(next)
        })

        row.appendChild(text)
        row.appendChild(select)
        this.content.appendChild(row)

        return select
    }

    private buildFieldRow(label: string, side: 'left' | 'right', onClear: () => void) {
        const row = document.createElement('div')
        row.className = 'controls__row controls__row--field'

        const meta = document.createElement('div')
        meta.className = 'controls__field-meta'
        const title = document.createElement('div')
        title.className = 'controls__field-label'
        title.textContent = label
        const status = document.createElement('span')
        status.className = 'controls__field-status'
        status.textContent = 'Empty'
        meta.appendChild(title)
        meta.appendChild(status)

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'controls__button controls__button--empty'
        button.textContent = 'Empty'
        button.disabled = true
        button.addEventListener('click', () => onClear())

        this.fieldButtons[side] = button
        this.fieldStatuses[side] = status

        row.appendChild(meta)
        row.appendChild(button)
        return row
    }

    private updateBloom() {
        this.bloomPass.strength = this.params.bloomStrength
        this.bloomPass.radius = this.params.bloomRadius
    }

    private formatValue(value: number, step: number) {
        return step >= 1 ? value.toFixed(0) : value.toFixed(2)
    }

    private syncSlider(control: SliderHandle, value: number) {
        control.input.value = String(value)
        control.valueTag.textContent = this.formatValue(value, parseFloat(control.input.step))
    }
}
