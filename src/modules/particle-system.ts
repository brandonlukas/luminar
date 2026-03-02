import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'
import type { VectorSample, VectorDatum, ParticleParams, FieldTransform, FieldBounds } from '../lib/types'
import { WORLD_EXTENT, FLOW_SCALE, SPEED_TO_GLOW, JITTER } from '../lib/constants'

export class ParticleSystem {
    // Particle data buffers
    private positions: Float32Array
    private colors: Float32Array
    private lifetimes: Float32Array

    // Field data and transformation
    private fieldData: VectorDatum[] | null = null
    private fieldTransform: FieldTransform = { scale: 1, offsetX: 0, offsetY: 0 }

    // Spatial grid for O(1) field lookups
    private grid: Map<number, VectorDatum[]> = new Map()
    private gridCellSize = 0.1
    private static readonly GRID_PRIME = 73856093

    // Three.js resources
    public geometry: BufferGeometry
    private params: ParticleParams

    // Velocity range for colormap mapping
    velocityMin = 0
    velocityMax = 1
    private velocityLogMin = 0
    private velocityLogMax = 0

    constructor(geometry: BufferGeometry, params: ParticleParams) {
        this.geometry = geometry
        this.params = params
        this.positions = new Float32Array(params.particleCount * 3)
        this.colors = new Float32Array(params.particleCount * 3)
        this.lifetimes = new Float32Array(params.particleCount)

        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3))
        // Fixed bounding sphere — particles are always within WORLD_EXTENT, no need to recompute per frame
        this.geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), WORLD_EXTENT * 2)
    }

    init() {
        const hasField = this.fieldData !== null && this.fieldData.length > 0
        for (let i = 0; i < this.params.particleCount; i += 1) {
            this.resetParticle(i, null, hasField)
        }
        this.updateBuffers()
    }

    setFieldData(data: VectorDatum[] | null, transform: FieldTransform, bounds?: FieldBounds) {
        this.fieldData = data
        this.fieldTransform = transform
        this.buildSpatialGrid(bounds)
        this.computeVelocityRange()
    }

    update(dt: number, lut: Float32Array) {
        const speedMultiplier = FLOW_SCALE * this.params.speed * dt
        const jitterRange = JITTER * dt
        const hasField = this.fieldData !== null && this.fieldData.length > 0
        // Pre-compute threshold for field lookups (invariant within a frame)
        const thresholdSq = hasField
            ? Math.pow(this.params.fieldValidDistance / this.fieldTransform.scale, 2)
            : 0

        for (let i = 0; i < this.params.particleCount; i += 1) {
            const i3 = i * 3
            let x = this.positions[i3]
            let y = this.positions[i3 + 1]

            const v = this.sampleFieldFast(x, y, hasField, thresholdSq)
            if (!v) {
                this.resetParticle(i, lut, hasField)
                continue
            }

            x += v.x * speedMultiplier + this.randomRange(-jitterRange, jitterRange)
            y += v.y * speedMultiplier + this.randomRange(-jitterRange, jitterRange)

            const speed = Math.sqrt(v.x * v.x + v.y * v.y)
            this.applyColor(i3, speed, lut)

            this.lifetimes[i] -= dt

            if (this.shouldResetParticle(i, x, y)) {
                this.resetParticle(i, lut, hasField)
            } else {
                this.positions[i3] = x
                this.positions[i3 + 1] = y
            }
        }

        this.updateBuffers()
    }

    resizeBuffers(newCount: number) {
        this.params.particleCount = newCount
        this.positions = new Float32Array(newCount * 3)
        this.colors = new Float32Array(newCount * 3)
        this.lifetimes = new Float32Array(newCount)
        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3))
        this.geometry.boundingSphere = new Sphere(new Vector3(0, 0, 0), WORLD_EXTENT * 2)
        this.init()
    }

    reseedLifetimes() {
        for (let i = 0; i < this.params.particleCount; i += 1) {
            this.lifetimes[i] = this.randomRange(this.params.lifeMin, this.params.lifeMax)
        }
    }

    private computeVelocityRange() {
        if (!this.fieldData || this.fieldData.length === 0) return

        let min = Infinity
        let max = -Infinity
        for (const d of this.fieldData) {
            const mag = Math.hypot(d.dx, d.dy) * this.fieldTransform.scale
            if (mag < min) min = mag
            if (mag > max) max = mag
        }
        this.velocityMin = min
        this.velocityMax = max
        this.velocityLogMin = Math.log1p(min)
        this.velocityLogMax = Math.log1p(max)
    }

    private shouldResetParticle(i: number, x: number, y: number): boolean {
        return (
            this.lifetimes[i] <= 0 ||
            Math.abs(x) > WORLD_EXTENT ||
            Math.abs(y) > WORLD_EXTENT
        )
    }

    private resetParticle(i: number, lut: Float32Array | null, hasField: boolean) {
        const i3 = i * 3

        if (hasField) {
            this.resetParticleWithinField(i3)
        } else {
            this.resetParticleRandomly(i3)
        }

        this.lifetimes[i] = this.randomRange(this.params.lifeMin, this.params.lifeMax)

        if (lut) {
            // Spawn with a dim initial color (low velocity appearance)
            const t = 0.2 + Math.random() * 0.3
            const idx = Math.floor(t * 255) * 3
            this.colors[i3] = lut[idx] * 0.5
            this.colors[i3 + 1] = lut[idx + 1] * 0.5
            this.colors[i3 + 2] = lut[idx + 2] * 0.5
        }
    }

    private resetParticleWithinField(i3: number) {
        const randomPoint = this.fieldData![Math.floor(Math.random() * this.fieldData!.length)]
        const jitterRange = this.params.fieldValidDistance * 0.3
        const dataX = randomPoint.x + this.randomRange(-jitterRange, jitterRange) / this.fieldTransform.scale
        const dataY = randomPoint.y + this.randomRange(-jitterRange, jitterRange) / this.fieldTransform.scale

        this.positions[i3] = this.dataToWorldX(dataX)
        this.positions[i3 + 1] = this.dataToWorldY(dataY)
        this.positions[i3 + 2] = 0
    }

    private resetParticleRandomly(i3: number) {
        this.positions[i3] = this.randomRange(-WORLD_EXTENT, WORLD_EXTENT)
        this.positions[i3 + 1] = this.randomRange(-WORLD_EXTENT, WORLD_EXTENT)
        this.positions[i3 + 2] = 0
    }

    private dataToWorldX(dataX: number): number {
        return dataX * this.fieldTransform.scale + this.fieldTransform.offsetX
    }

    private dataToWorldY(dataY: number): number {
        return dataY * this.fieldTransform.scale + this.fieldTransform.offsetY
    }

    private worldToDataX(worldX: number): number {
        return (worldX - this.fieldTransform.offsetX) / this.fieldTransform.scale
    }

    private worldToDataY(worldY: number): number {
        return (worldY - this.fieldTransform.offsetY) / this.fieldTransform.scale
    }

    private buildSpatialGrid(bounds?: FieldBounds) {
        this.grid.clear()

        if (!this.fieldData || this.fieldData.length === 0) {
            return
        }

        let minX: number, maxX: number, minY: number, maxY: number
        if (bounds) {
            ({ minX, maxX, minY, maxY } = bounds)
        } else {
            minX = this.fieldData[0].x
            maxX = this.fieldData[0].x
            minY = this.fieldData[0].y
            maxY = this.fieldData[0].y
            for (const d of this.fieldData) {
                if (d.x < minX) minX = d.x
                if (d.x > maxX) maxX = d.x
                if (d.y < minY) minY = d.y
                if (d.y > maxY) maxY = d.y
            }
        }

        const width = maxX - minX
        const height = maxY - minY
        const avgDim = (width + height) / 2
        const targetCellsPerDim = Math.ceil(Math.sqrt(this.fieldData.length))
        this.gridCellSize = Math.max(0.01, avgDim / targetCellsPerDim)

        for (const datum of this.fieldData) {
            const cellX = Math.floor(datum.x / this.gridCellSize)
            const cellY = Math.floor(datum.y / this.gridCellSize)
            const key = this.getGridKey(cellX, cellY)
            const cell = this.grid.get(key)
            if (cell) {
                cell.push(datum)
            } else {
                this.grid.set(key, [datum])
            }
        }
    }

    private getGridKey(cellX: number, cellY: number): number {
        return (cellX * ParticleSystem.GRID_PRIME) ^ cellY
    }

    private sampleFieldFast(x: number, y: number, hasField: boolean, thresholdSq: number): VectorSample | null {
        if (!hasField) {
            return { x: 1, y: 0 }
        }

        const dataX = this.worldToDataX(x)
        const dataY = this.worldToDataY(y)
        const nearest = this.findNearestFieldPoint(dataX, dataY, thresholdSq)

        if (!nearest) {
            return null
        }

        return {
            x: nearest.dx * this.fieldTransform.scale,
            y: nearest.dy * this.fieldTransform.scale,
        }
    }

    private findNearestFieldPoint(dataX: number, dataY: number, thresholdSq: number): VectorDatum | null {
        let nearest: VectorDatum | null = null
        let bestDistSq = Number.MAX_VALUE

        const cellX = Math.floor(dataX / this.gridCellSize)
        const cellY = Math.floor(dataY / this.gridCellSize)

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const cell = this.grid.get(this.getGridKey(cellX + dx, cellY + dy))
                if (!cell) continue

                for (const d of cell) {
                    const diffX = d.x - dataX
                    const diffY = d.y - dataY
                    const distSq = diffX * diffX + diffY * diffY
                    if (distSq < bestDistSq) {
                        bestDistSq = distSq
                        nearest = d
                    }
                }
            }
        }

        return bestDistSq <= thresholdSq ? nearest : null
    }

    private applyColor(i3: number, velocityMagnitude: number, lut: Float32Array) {
        let t: number

        switch (this.params.velocityScaling) {
            case 'log':
                t = (Math.log1p(velocityMagnitude) - this.velocityLogMin) /
                    (this.velocityLogMax - this.velocityLogMin || 1)
                break
            case 'normalized':
                t = (velocityMagnitude - this.velocityMin) /
                    (this.velocityMax - this.velocityMin || 1)
                break
            case 'raw':
            default:
                t = Math.min(1, velocityMagnitude * SPEED_TO_GLOW)
                break
        }

        t = Math.max(0, Math.min(1, t))
        const idx = Math.floor(t * 255) * 3
        this.colors[i3] = lut[idx]
        this.colors[i3 + 1] = lut[idx + 1]
        this.colors[i3 + 2] = lut[idx + 2]
    }

    private randomRange(min: number, max: number) {
        return min + Math.random() * (max - min)
    }

    private updateBuffers() {
        this.geometry.attributes.position.needsUpdate = true
        this.geometry.attributes.color.needsUpdate = true
    }
}
