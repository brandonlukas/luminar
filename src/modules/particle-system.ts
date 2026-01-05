import { BufferAttribute, BufferGeometry } from 'three'
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import type { VectorSample, VectorDatum, ColorPreset, ParticleParams, FieldTransform } from '../lib/types'
import { WORLD_EXTENT, FLOW_SCALE, SPEED_TO_GLOW, JITTER, DEFAULT_COLOR_PRESET, COLOR_PRESETS } from '../lib/constants'

export class ParticleSystem {
    // Particle data buffers
    private positions: Float32Array
    private colors: Float32Array
    private lifetimes: Float32Array

    // Field data and transformation
    private fieldData: VectorDatum[] | null = null
    private fieldTransform: FieldTransform = { scale: 1, offsetX: 0, offsetY: 0 }

    // Spatial grid for O(1) field lookups
    private grid: Map<string, VectorDatum[]> = new Map()
    private gridCellSize = 0.1

    // Three.js resources
    public geometry: BufferGeometry
    private params: ParticleParams
    private readonly paletteKey: () => string

    // View and rendering state
    private viewOffsetX: number
    private activePalette: ColorPreset | null = null

    // Noise generation
    private noise: SimplexNoise
    private readonly noiseScale = 0.9
    private readonly noiseTimeScale = 0.15

    constructor(
        geometry: BufferGeometry,
        params: ParticleParams,
        paletteKey: () => string,
    ) {
        this.geometry = geometry
        this.params = params
        this.paletteKey = paletteKey
        this.viewOffsetX = 0
        this.positions = new Float32Array(params.particleCount * 3)
        this.colors = new Float32Array(params.particleCount * 3)
        this.lifetimes = new Float32Array(params.particleCount)
        this.noise = new SimplexNoise()

        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3))
    }

    init() {
        for (let i = 0; i < this.params.particleCount; i += 1) {
            this.resetParticle(i)
        }
        this.updateBuffers()
    }

    setFieldData(data: VectorDatum[] | null, transform: FieldTransform) {
        this.fieldData = data
        this.fieldTransform = transform
        this.buildSpatialGrid()
    }

    hasFieldData(): boolean {
        return this.fieldData !== null && this.fieldData.length > 0
    }

    setViewOffset(offsetX: number) {
        if (this.viewOffsetX !== offsetX) {
            this.viewOffsetX = offsetX
            // Reseed particles when offset changes to prevent gaps
            for (let i = 0; i < this.params.particleCount; i += 1) {
                this.resetParticle(i)
            }
            this.updateBuffers()
        }
    }

    update(dt: number, palette: ColorPreset) {
        const time = performance.now() * 0.001
        this.activePalette = palette
        const noiseEnabled = this.params.noiseStrength > 0
        const speedMultiplier = FLOW_SCALE * this.params.speed * dt
        const jitterRange = JITTER * dt

        for (let i = 0; i < this.params.particleCount; i += 1) {
            const i3 = i * 3
            let x = this.positions[i3]
            let y = this.positions[i3 + 1]

            const v = this.sampleField(x, y, time)
            if (!v) {
                this.resetParticle(i)
                continue
            }

            if (noiseEnabled) {
                this.applyNoise(v, x, y, time)
            }

            x += v.x * speedMultiplier + this.randomRange(-jitterRange, jitterRange)
            y += v.y * speedMultiplier + this.randomRange(-jitterRange, jitterRange)

            const speed = Math.hypot(v.x, v.y)
            const glow = Math.min(1, speed * SPEED_TO_GLOW)

            this.applyColor(i3, glow, palette, false)

            this.lifetimes[i] -= dt

            if (this.shouldResetParticle(i, x, y)) {
                this.resetParticle(i)
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
        this.init()
    }

    reseedLifetimes() {
        for (let i = 0; i < this.params.particleCount; i += 1) {
            this.lifetimes[i] = this.randomRange(this.params.lifeMin, this.params.lifeMax)
        }
    }

    private shouldResetParticle(i: number, x: number, y: number): boolean {
        return (
            this.lifetimes[i] <= 0 ||
            Math.abs(x - this.viewOffsetX) > WORLD_EXTENT ||
            Math.abs(y) > WORLD_EXTENT
        )
    }

    private applyNoise(velocity: VectorSample, x: number, y: number, time: number) {
        const nX = this.noise.noise3d(x * this.noiseScale, y * this.noiseScale, time * this.noiseTimeScale)
        const nY = this.noise.noise3d((x + 10) * this.noiseScale, (y + 10) * this.noiseScale, time * this.noiseTimeScale)
        velocity.x += nX * this.params.noiseStrength
        velocity.y += nY * this.params.noiseStrength
    }

    private resetParticle(i: number) {
        const i3 = i * 3
        const palette = this.activePalette ?? this.getActiveColorPreset()

        if (this.hasFieldData()) {
            this.resetParticleWithinField(i3)
        } else {
            this.resetParticleRandomly(i3)
        }

        this.lifetimes[i] = this.randomRange(this.params.lifeMin, this.params.lifeMax)
        const glow = 0.4 + Math.random() * 0.2
        this.applyColor(i3, glow, palette, true)
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
        this.positions[i3] = this.randomRange(-WORLD_EXTENT, WORLD_EXTENT) + this.viewOffsetX
        this.positions[i3 + 1] = this.randomRange(-WORLD_EXTENT, WORLD_EXTENT)
        this.positions[i3 + 2] = 0
    }

    private dataToWorldX(dataX: number): number {
        return dataX * this.fieldTransform.scale + this.fieldTransform.offsetX + this.viewOffsetX
    }

    private dataToWorldY(dataY: number): number {
        return dataY * this.fieldTransform.scale + this.fieldTransform.offsetY
    }

    private worldToDataX(worldX: number): number {
        return (worldX - this.viewOffsetX - this.fieldTransform.offsetX) / this.fieldTransform.scale
    }

    private worldToDataY(worldY: number): number {
        return (worldY - this.fieldTransform.offsetY) / this.fieldTransform.scale
    }

    private buildSpatialGrid() {
        this.grid.clear()

        if (!this.fieldData || this.fieldData.length === 0) {
            return
        }

        // Find bounds
        let minX = this.fieldData[0].x
        let maxX = this.fieldData[0].x
        let minY = this.fieldData[0].y
        let maxY = this.fieldData[0].y

        for (const d of this.fieldData) {
            if (d.x < minX) minX = d.x
            if (d.x > maxX) maxX = d.x
            if (d.y < minY) minY = d.y
            if (d.y > maxY) maxY = d.y
        }

        // Auto-adjust cell size based on data density
        const width = maxX - minX
        const height = maxY - minY
        const avgDim = (width + height) / 2
        const targetCellsPerDim = Math.ceil(Math.sqrt(this.fieldData.length))
        this.gridCellSize = Math.max(0.01, avgDim / targetCellsPerDim)

        // Populate grid
        for (const datum of this.fieldData) {
            const key = this.getGridKey(datum.x, datum.y)
            const cell = this.grid.get(key)
            if (cell) {
                cell.push(datum)
            } else {
                this.grid.set(key, [datum])
            }
        }
    }

    private getGridKey(x: number, y: number): string {
        const cellX = Math.floor(x / this.gridCellSize)
        const cellY = Math.floor(y / this.gridCellSize)
        return `${cellX},${cellY}`
    }

    private sampleField(x: number, y: number, _time: number): VectorSample | null {
        if (!this.hasFieldData()) {
            return { x: 1, y: 0 }
        }

        const dataX = this.worldToDataX(x)
        const dataY = this.worldToDataY(y)
        const nearest = this.findNearestFieldPoint(dataX, dataY)

        if (!nearest) {
            return null
        }

        return {
            x: nearest.dx * this.fieldTransform.scale,
            y: nearest.dy * this.fieldTransform.scale,
        }
    }

    private findNearestFieldPoint(dataX: number, dataY: number): VectorDatum | null {
        let nearest: VectorDatum | null = null
        let bestDistSq = Number.MAX_VALUE
        const thresholdSq = Math.pow(this.params.fieldValidDistance / this.fieldTransform.scale, 2)

        // Search 3x3 grid of cells (current + 8 neighbors)
        const cellX = Math.floor(dataX / this.gridCellSize)
        const cellY = Math.floor(dataY / this.gridCellSize)

        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const cell = this.grid.get(`${cellX + dx},${cellY + dy}`)
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

    private applyColor(i3: number, glow: number, palette: ColorPreset, isSpawn: boolean) {
        const clampedGlow = Math.min(1, Math.max(0, glow))

        // Preserve legacy look for the default palette
        if (palette.key === DEFAULT_COLOR_PRESET) {
            if (isSpawn) {
                this.colors[i3] = 0.6 * clampedGlow
                this.colors[i3 + 1] = 0.25 * clampedGlow
                this.colors[i3 + 2] = 0.9 * clampedGlow
            } else {
                this.colors[i3] = 0.35 + clampedGlow * 0.9
                this.colors[i3 + 1] = 0.18 + clampedGlow * 0.45
                this.colors[i3 + 2] = 0.6 + clampedGlow * 0.35
            }
            return
        }

        const brightness = isSpawn ? clampedGlow : 0.35 + clampedGlow * 0.65
        const [r, g, b] = palette.rgb
        this.colors[i3] = r * brightness
        this.colors[i3 + 1] = g * brightness
        this.colors[i3 + 2] = b * brightness
    }

    private getActiveColorPreset(): ColorPreset {
        const key = this.paletteKey()
        return COLOR_PRESETS.find((preset) => preset.key === key) ?? COLOR_PRESETS[0]
    }

    private randomRange(min: number, max: number) {
        return min + Math.random() * (max - min)
    }

    private updateBuffers() {
        this.geometry.attributes.position.needsUpdate = true
        this.geometry.attributes.color.needsUpdate = true
        this.geometry.computeBoundingSphere()
    }
}
