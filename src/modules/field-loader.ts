import type { VectorDatum, FieldTransform, FieldBounds } from '../lib/types'
import { WORLD_EXTENT } from '../lib/constants'

export class FieldLoader {
    private onFieldLoaded: (data: VectorDatum[], transform: FieldTransform, label: string, bounds: FieldBounds) => void

    constructor(
        onFieldLoaded: (data: VectorDatum[], transform: FieldTransform, label: string, bounds: FieldBounds) => void,
    ) {
        this.onFieldLoaded = onFieldLoaded
    }

    async load() {
        try {
            const res = await fetch('/vector-field.json', { cache: 'no-store' })
            if (!res.ok) {
                return
            }
            const data = (await res.json()) as VectorDatum[]
            if (Array.isArray(data) && data.length > 0) {
                const { transform, bounds } = this.computeFieldTransform(data)
                const label = `default \u00B7 ${data.length} vectors (${bounds.width.toFixed(1)}\u00D7${bounds.height.toFixed(1)})`
                this.onFieldLoaded(data, transform, label, bounds)
                console.log('Field bounds:', bounds, 'scale:', transform.scale)
            }
        } catch (error) {
            console.error('Failed to load vector field', error)
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
}
