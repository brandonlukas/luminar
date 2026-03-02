import type { ParticleParams, SliderHandle, ColormapName, VelocityScaling } from '../lib/types'
import { defaultParams, FIELD_BORDER_MIN, FIELD_BORDER_MAX } from '../lib/constants'
import { COLORMAPS } from '../lib/colormaps'

export interface ControlCallbacks {
    onParticleCountChange: (count: number) => void
    onLifetimeChange: () => void
    onTrailToggle: (enabled: boolean) => void
    onTrailDecayChange: (value: number) => void
    onColormapChange: (name: ColormapName) => void
    onBackgroundColorChange: (color: string) => void
    onSizeChange: (value: number) => void
    onOpacityChange: (value: number) => void
    onBloomStrengthChange: (value: number) => void
    onBloomRadiusChange: (value: number) => void
    onBloomThresholdChange: (value: number) => void
    onClearField: () => void
}

export class ControlPanel {
    private controlHandles = new Map<string, SliderHandle>()
    private selectHandles = new Map<string, HTMLSelectElement>()
    private trailToggle?: HTMLInputElement
    private container: HTMLElement
    private params: ParticleParams
    private callbacks: ControlCallbacks

    constructor(
        container: HTMLElement,
        params: ParticleParams,
        callbacks: ControlCallbacks,
    ) {
        this.container = container
        this.params = params
        this.callbacks = callbacks
    }

    create() {
        this.buildParticlesSection()
        this.buildBloomSection()
        this.buildColorSection()
        this.buildResetButton()
    }

    private buildParticlesSection() {
        const { header, body } = this.createSection('Particles')

        // Particle count (logarithmic)
        const logMin = Math.log(100)
        const logMax = Math.log(200000)
        const initialSliderVal = (Math.log(this.params.particleCount) - logMin) / (logMax - logMin)

        const countRow = document.createElement('label')
        countRow.className = 'controls__row'
        const countLabel = document.createElement('span')
        countLabel.textContent = 'Count'
        const countInput = document.createElement('input')
        countInput.type = 'range'
        countInput.min = '0'
        countInput.max = '1'
        countInput.step = '0.001'
        countInput.value = String(initialSliderVal)
        const countValue = document.createElement('span')
        countValue.className = 'controls__value'
        countValue.textContent = String(this.params.particleCount)
        countInput.addEventListener('input', () => {
            const t = parseFloat(countInput.value)
            const count = Math.round(Math.exp(logMin + t * (logMax - logMin)))
            countValue.textContent = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
            this.params.particleCount = count
            this.callbacks.onParticleCountChange(count)
        })
        countRow.appendChild(countLabel)
        countRow.appendChild(countInput)
        countRow.appendChild(countValue)
        body.appendChild(countRow)
        this.controlHandles.set('particleCount', { input: countInput, valueTag: countValue })

        // Speed
        this.addSlider(body, 'Speed', 0.1, 12, 0.1, this.params.speed, (v) => {
            this.params.speed = v
        }, 'speed')

        // Particle size
        this.addSlider(body, 'Size', 0.5, 4, 0.1, this.params.size, (v) => {
            this.params.size = v
            this.callbacks.onSizeChange(v)
        }, 'size')

        // Opacity
        this.addSlider(body, 'Opacity', 0, 1, 0.01, this.params.opacity, (v) => {
            this.params.opacity = v
            this.callbacks.onOpacityChange(v)
        }, 'opacity')

        // Lifetime min
        this.addSlider(body, 'Life min (s)', 0.1, 2.0, 0.05, this.params.lifeMin, (v) => {
            this.params.lifeMin = v
            if (this.params.lifeMin > this.params.lifeMax) {
                this.params.lifeMax = v
                const h = this.controlHandles.get('lifeMax')
                if (h) this.syncSlider(h, v)
            }
            this.callbacks.onLifetimeChange()
        }, 'lifeMin')

        // Lifetime max
        this.addSlider(body, 'Life max (s)', 0.2, 5.0, 0.05, this.params.lifeMax, (v) => {
            this.params.lifeMax = v
            if (this.params.lifeMax < this.params.lifeMin) {
                this.params.lifeMin = v
                const h = this.controlHandles.get('lifeMin')
                if (h) this.syncSlider(h, v)
            }
            this.callbacks.onLifetimeChange()
        }, 'lifeMax')

        // Field border
        this.addSlider(body, 'Field border', FIELD_BORDER_MIN, FIELD_BORDER_MAX, 0.01, this.params.fieldValidDistance, (v) => {
            this.params.fieldValidDistance = v
        }, 'fieldDist')

        // Trails toggle
        const trailsToggle = this.addToggle(body, 'Trails', this.params.trailsEnabled, (enabled) => {
            this.params.trailsEnabled = enabled
            this.callbacks.onTrailToggle(enabled)
        })
        this.trailToggle = trailsToggle

        // Trail length (decay)
        this.addSlider(body, 'Trail length', 0.7, 0.99, 0.005, this.params.trailDecay, (v) => {
            this.params.trailDecay = v
            this.callbacks.onTrailDecayChange(v)
        }, 'trailDecay')

        this.container.appendChild(header)
        this.container.appendChild(body)
    }

    private buildBloomSection() {
        const { header, body } = this.createSection('Bloom')

        this.addSlider(body, 'Strength', 0.2, 2.5, 0.05, this.params.bloomStrength, (v) => {
            this.params.bloomStrength = v
            this.callbacks.onBloomStrengthChange(v)
        }, 'bloomStrength')

        this.addSlider(body, 'Radius', 0.0, 1.2, 0.02, this.params.bloomRadius, (v) => {
            this.params.bloomRadius = v
            this.callbacks.onBloomRadiusChange(v)
        }, 'bloomRadius')

        this.addSlider(body, 'Threshold', 0.0, 1.0, 0.01, this.params.bloomThreshold, (v) => {
            this.params.bloomThreshold = v
            this.callbacks.onBloomThresholdChange(v)
        }, 'bloomThreshold')

        this.container.appendChild(header)
        this.container.appendChild(body)
    }

    private buildColorSection() {
        const { header, body } = this.createSection('Color')

        // Colormap dropdown
        const cmRow = document.createElement('label')
        cmRow.className = 'controls__row'
        cmRow.style.gridTemplateColumns = '1fr 1fr'
        const cmLabel = document.createElement('span')
        cmLabel.textContent = 'Colormap'
        const cmSelect = document.createElement('select')
        cmSelect.className = 'controls__select'
        for (const cm of COLORMAPS) {
            const opt = document.createElement('option')
            opt.value = cm.name
            opt.textContent = cm.label
            cmSelect.appendChild(opt)
        }
        cmSelect.value = this.params.colormap
        cmSelect.addEventListener('change', () => {
            this.params.colormap = cmSelect.value as ColormapName
            this.callbacks.onColormapChange(this.params.colormap)
        })
        cmRow.appendChild(cmLabel)
        cmRow.appendChild(cmSelect)
        body.appendChild(cmRow)
        this.selectHandles.set('colormap', cmSelect)

        // Velocity scaling dropdown
        const vsRow = document.createElement('label')
        vsRow.className = 'controls__row'
        vsRow.style.gridTemplateColumns = '1fr 1fr'
        const vsLabel = document.createElement('span')
        vsLabel.textContent = 'Vel. scaling'
        const vsSelect = document.createElement('select')
        vsSelect.className = 'controls__select'
        for (const mode of [
            { value: 'raw', label: 'Raw' },
            { value: 'log', label: 'Logarithmic' },
            { value: 'normalized', label: 'Normalized' },
        ]) {
            const opt = document.createElement('option')
            opt.value = mode.value
            opt.textContent = mode.label
            vsSelect.appendChild(opt)
        }
        vsSelect.value = this.params.velocityScaling
        vsSelect.addEventListener('change', () => {
            this.params.velocityScaling = vsSelect.value as VelocityScaling
        })
        vsRow.appendChild(vsLabel)
        vsRow.appendChild(vsSelect)
        body.appendChild(vsRow)
        this.selectHandles.set('velocityScaling', vsSelect)

        // Background color
        const bgRow = document.createElement('label')
        bgRow.className = 'controls__row'
        bgRow.style.gridTemplateColumns = '1fr 1fr'
        const bgLabel = document.createElement('span')
        bgLabel.textContent = 'Background'
        const bgInput = document.createElement('input')
        bgInput.type = 'color'
        bgInput.className = 'controls__color-input'
        bgInput.value = this.params.backgroundColor
        bgInput.addEventListener('input', () => {
            this.params.backgroundColor = bgInput.value
            this.callbacks.onBackgroundColorChange(bgInput.value)
        })
        bgRow.appendChild(bgLabel)
        bgRow.appendChild(bgInput)
        body.appendChild(bgRow)

        this.container.appendChild(header)
        this.container.appendChild(body)
    }

    private buildResetButton() {
        const resetBtn = document.createElement('button')
        resetBtn.type = 'button'
        resetBtn.className = 'controls__button'
        resetBtn.textContent = 'Reset to defaults'
        resetBtn.style.marginTop = '12px'
        resetBtn.addEventListener('click', () => this.reset())
        this.container.appendChild(resetBtn)
    }

    private reset() {
        Object.assign(this.params, defaultParams)
        this.callbacks.onSizeChange(this.params.size)
        this.callbacks.onOpacityChange(this.params.opacity)
        this.callbacks.onBloomStrengthChange(this.params.bloomStrength)
        this.callbacks.onBloomRadiusChange(this.params.bloomRadius)
        this.callbacks.onParticleCountChange(this.params.particleCount)
        this.callbacks.onLifetimeChange()
        this.callbacks.onTrailToggle(this.params.trailsEnabled)
        this.callbacks.onTrailDecayChange(this.params.trailDecay)
        this.callbacks.onColormapChange(this.params.colormap)
        this.callbacks.onBackgroundColorChange(this.params.backgroundColor)
        this.callbacks.onOpacityChange(this.params.opacity)
        this.callbacks.onBloomThresholdChange(this.params.bloomThreshold)

        // Sync sliders
        for (const [key, handle] of this.controlHandles.entries()) {
            if (key === 'particleCount') {
                // Log-scale slider
                const logMin = Math.log(100)
                const logMax = Math.log(200000)
                const t = (Math.log(this.params.particleCount) - logMin) / (logMax - logMin)
                handle.input.value = String(t)
                handle.valueTag.textContent = String(this.params.particleCount)
                continue
            }
            const paramKey = key as keyof ParticleParams
            if (typeof this.params[paramKey] === 'number') {
                this.syncSlider(handle, this.params[paramKey] as number)
            }
        }

        // Sync selects
        const cmSelect = this.selectHandles.get('colormap')
        if (cmSelect) cmSelect.value = this.params.colormap
        const vsSelect = this.selectHandles.get('velocityScaling')
        if (vsSelect) vsSelect.value = this.params.velocityScaling

        if (this.trailToggle) {
            this.trailToggle.checked = this.params.trailsEnabled
        }
    }

    private createSection(title: string) {
        const section = document.createElement('div')
        section.className = 'controls__section'

        const header = document.createElement('div')
        header.className = 'controls__section-header'

        const titleEl = document.createElement('span')
        titleEl.className = 'controls__section-title'
        titleEl.textContent = title

        const arrow = document.createElement('span')
        arrow.className = 'controls__section-arrow'
        arrow.textContent = '\u25BC'

        header.appendChild(titleEl)
        header.appendChild(arrow)

        const body = document.createElement('div')
        body.className = 'controls__section-body'

        header.addEventListener('click', () => {
            section.classList.toggle('controls__section--collapsed')
        })

        section.appendChild(header)
        section.appendChild(body)

        return { section, header: section, body }
    }

    private addSlider(
        parent: HTMLElement,
        label: string,
        min: number,
        max: number,
        step: number,
        value: number,
        onChange: (value: number) => void,
        key?: string,
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

        input.addEventListener('input', () => {
            const next = parseFloat(input.value)
            valueTag.textContent = this.formatValue(next, step)
            onChange(next)
        })

        row.appendChild(text)
        row.appendChild(input)
        row.appendChild(valueTag)
        parent.appendChild(row)

        const handle = { input, valueTag }
        if (key) this.controlHandles.set(key, handle)
        return handle
    }

    private addToggle(parent: HTMLElement, label: string, value: boolean, onChange: (value: boolean) => void) {
        const row = document.createElement('label')
        row.className = 'controls__row'
        row.style.gridTemplateColumns = '1fr auto'

        const text = document.createElement('span')
        text.textContent = label

        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = value
        input.addEventListener('change', () => {
            onChange(input.checked)
        })

        row.appendChild(text)
        row.appendChild(input)
        parent.appendChild(row)

        return input
    }

    private formatValue(value: number, step: number) {
        return step >= 1 ? value.toFixed(0) : value.toFixed(2)
    }

    private syncSlider(control: SliderHandle, value: number) {
        control.input.value = String(value)
        control.valueTag.textContent = this.formatValue(value, parseFloat(control.input.step))
    }
}
