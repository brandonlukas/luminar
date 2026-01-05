import type { VectorDatum, FieldTransform } from '../lib/types'
import { WORLD_EXTENT } from '../lib/constants'

export class FieldLoader {
    private fieldStatusEl: HTMLElement | null = null
    private onFieldLoaded: (data: VectorDatum[], transform: FieldTransform, label: string) => void

    constructor(
        onFieldLoaded: (data: VectorDatum[], transform: FieldTransform, label: string) => void,
    ) {
        this.onFieldLoaded = onFieldLoaded
    }

    setStatusElement(el: HTMLElement | null) {
        this.fieldStatusEl = el
    }

    async load() {
        try {
            const res = await fetch('/vector-field.json', { cache: 'no-store' })
            if (!res.ok) {
                this.updateStatus('default (built-in)')
                return
            }
            const data = (await res.json()) as VectorDatum[]
            if (Array.isArray(data) && data.length > 0) {
                const { transform, bounds } = this.computeFieldTransform(data)
                const label = `loaded ${data.length} vectors (${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)})`
                this.onFieldLoaded(data, transform, label)
                this.updateStatus(label)
                console.log('Field bounds:', bounds, 'scale:', transform.scale)
            } else {
                this.updateStatus('default (empty file)')
            }
        } catch (error) {
            console.error('Failed to load vector field', error)
            this.updateStatus('default (load error)')
        }
    }

    computeFieldTransform(data: VectorDatum[]) {
        let minX = data[0].x
        let maxX = data[0].x
        let minY = data[0].y
        let maxY = data[0].y

        for (const d of data) {
            if (d.x < minX) minX = d.x
            if (d.x > maxX) maxX = d.x
            if (d.y < minY) minY = d.y
            if (d.y > maxY) maxY = d.y
        }

        const dataWidth = maxX - minX
        const dataHeight = maxY - minY
        const dataSize = Math.max(dataWidth, dataHeight)

        const targetSize = WORLD_EXTENT * 1.8
        const scale = dataSize > 0 ? targetSize / dataSize : 1
        const offsetX = -(minX + maxX) * 0.5 * scale
        const offsetY = -(minY + maxY) * 0.5 * scale

        return {
            transform: { scale, offsetX, offsetY },
            bounds: { minX, maxX, minY, maxY, width: dataWidth, height: dataHeight },
        }
    }

    updateStatus(label: string) {
        if (this.fieldStatusEl) this.fieldStatusEl.textContent = label
    }
}
