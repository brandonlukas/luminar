import type { ParticleParams, SliderHandle, ColormapName, VelocityScaling } from '../lib/types'
import { defaultParams, defaultSlotParams, FIELD_BORDER_MIN, FIELD_BORDER_MAX } from '../lib/constants'
import { COLORMAPS } from '../lib/colormaps'
import { createSection, formatCount } from '../lib/dom-helpers'
import type { FieldSlot } from './field-slot'

export interface ControlCallbacks {
    // Global
    onParticleCountChange: (count: number) => void
    onLifetimeChange: () => void
    onTrailToggle: (enabled: boolean) => void
    onTrailDecayChange: (value: number) => void
    onBackgroundColorChange: (color: string) => void
    onSizeChange: (value: number) => void
    onOpacityChange: (value: number) => void
    onBloomStrengthChange: (value: number) => void
    onBloomRadiusChange: (value: number) => void
    onBloomThresholdChange: (value: number) => void
    // Per-slot
    onSlotColormapChange: (name: ColormapName) => void
    onSlotVelocityScalingChange: (scaling: VelocityScaling) => void
    onSlotRemove: () => void
}

export class ControlPanel {
    private controlHandles = new Map<string, SliderHandle>()
    private trailToggle?: HTMLInputElement
    private container: HTMLElement
    private params: ParticleParams
    private callbacks: ControlCallbacks

    // Per-slot section elements
    private slotSection?: HTMLElement
    private slotNameLabel?: HTMLElement
    private slotColormapSelect?: HTMLSelectElement
    private slotVelocitySelect?: HTMLSelectElement

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
        this.buildSlotSection()
        this.buildParticlesSection()
        this.buildBloomSection()
        this.buildColorSection()
        this.buildResetButton()
    }

    /** Update the per-slot section when selection changes */
    updateSlotSection(slot: FieldSlot | null) {
        if (!this.slotSection) return

        if (!slot) {
            this.slotSection.style.display = 'none'
            return
        }

        this.slotSection.style.display = ''
        if (this.slotNameLabel) {
            this.slotNameLabel.textContent = slot.fieldData?.fileName ?? 'No field'
        }
        if (this.slotColormapSelect) {
            this.slotColormapSelect.value = slot.slotParams.colormap
        }
        if (this.slotVelocitySelect) {
            this.slotVelocitySelect.value = slot.slotParams.velocityScaling
        }
    }

    private buildSlotSection() {
        const { section, body } = createSection('Selected Field')
        this.slotSection = section
        section.style.display = 'none' // hidden until a slot is selected

        // Field name label
        this.slotNameLabel = document.createElement('div')
        this.slotNameLabel.style.fontSize = '11px'
        this.slotNameLabel.style.color = '#9fb7ff'
        this.slotNameLabel.style.marginBottom = '8px'
        this.slotNameLabel.style.overflow = 'hidden'
        this.slotNameLabel.style.textOverflow = 'ellipsis'
        this.slotNameLabel.style.whiteSpace = 'nowrap'
        body.appendChild(this.slotNameLabel)

        // Colormap dropdown
        const cmRow = document.createElement('label')
        cmRow.className = 'controls__row'
        cmRow.style.gridTemplateColumns = '1fr 1fr'
        const cmLabel = document.createElement('span')
        cmLabel.textContent = 'Colormap'
        this.slotColormapSelect = document.createElement('select')
        this.slotColormapSelect.className = 'controls__select'
        for (const cm of COLORMAPS) {
            const opt = document.createElement('option')
            opt.value = cm.name
            opt.textContent = cm.label
            this.slotColormapSelect.appendChild(opt)
        }
        this.slotColormapSelect.addEventListener('change', () => {
            this.callbacks.onSlotColormapChange(this.slotColormapSelect!.value as ColormapName)
        })
        cmRow.appendChild(cmLabel)
        cmRow.appendChild(this.slotColormapSelect)
        body.appendChild(cmRow)

        // Velocity scaling dropdown
        const vsRow = document.createElement('label')
        vsRow.className = 'controls__row'
        vsRow.style.gridTemplateColumns = '1fr 1fr'
        const vsLabel = document.createElement('span')
        vsLabel.textContent = 'Vel. scaling'
        this.slotVelocitySelect = document.createElement('select')
        this.slotVelocitySelect.className = 'controls__select'
        for (const mode of [
            { value: 'raw', label: 'Raw' },
            { value: 'log', label: 'Logarithmic' },
            { value: 'normalized', label: 'Normalized' },
            { value: 'dot-product', label: 'Dot Product' },
        ]) {
            const opt = document.createElement('option')
            opt.value = mode.value
            opt.textContent = mode.label
            this.slotVelocitySelect.appendChild(opt)
        }
        this.slotVelocitySelect.addEventListener('change', () => {
            this.callbacks.onSlotVelocityScalingChange(this.slotVelocitySelect!.value as VelocityScaling)
        })
        vsRow.appendChild(vsLabel)
        vsRow.appendChild(this.slotVelocitySelect)
        body.appendChild(vsRow)

        // Remove field button
        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.className = 'controls__button'
        removeBtn.textContent = 'Remove field'
        removeBtn.addEventListener('click', () => this.callbacks.onSlotRemove())
        body.appendChild(removeBtn)

        this.container.appendChild(section)
    }

    private buildParticlesSection() {
        const { section, body } = createSection('Particles')

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
            countValue.textContent = formatCount(count)
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

        this.container.appendChild(section)
    }

    private buildBloomSection() {
        const { section, body } = createSection('Bloom')

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

        this.container.appendChild(section)
    }

    private buildColorSection() {
        const { section, body } = createSection('Color')

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

        this.container.appendChild(section)
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
        this.callbacks.onBackgroundColorChange(this.params.backgroundColor)
        this.callbacks.onBloomThresholdChange(this.params.bloomThreshold)

        // Reset per-slot to defaults
        this.callbacks.onSlotColormapChange(defaultSlotParams.colormap)
        this.callbacks.onSlotVelocityScalingChange(defaultSlotParams.velocityScaling)

        // Sync sliders
        for (const [key, handle] of this.controlHandles.entries()) {
            if (key === 'particleCount') {
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

        if (this.slotColormapSelect) {
            this.slotColormapSelect.value = defaultSlotParams.colormap
        }
        if (this.slotVelocitySelect) {
            this.slotVelocitySelect.value = defaultSlotParams.velocityScaling
        }

        if (this.trailToggle) {
            this.trailToggle.checked = this.params.trailsEnabled
        }
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
