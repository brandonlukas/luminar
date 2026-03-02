import type { VectorDatum, FieldTransform, FieldBounds } from '../lib/types'
import { WORLD_EXTENT } from '../lib/constants'

export function computeFieldTransform(data: VectorDatum[]): {
    transform: FieldTransform
    bounds: FieldBounds
} {
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
