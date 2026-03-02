export type VectorSample = { x: number; y: number }
export type VectorDatum = { x: number; y: number; dx: number; dy: number }
export type SliderHandle = { input: HTMLInputElement; valueTag: HTMLSpanElement }
export type ColormapName = 'viridis' | 'cividis' | 'inferno' | 'magma' | 'plasma' | 'coolwarm'
export type VelocityScaling = 'raw' | 'log' | 'normalized'

export interface ParticleParams {
    size: number
    bloomStrength: number
    bloomRadius: number
    bloomThreshold: number
    lifeMin: number
    lifeMax: number
    fieldValidDistance: number
    speed: number
    particleCount: number
    colormap: ColormapName
    velocityScaling: VelocityScaling
    backgroundColor: string
    opacity: number
    trailsEnabled: boolean
    trailDecay: number
    paused: boolean
    aspectRatio: '16:9' | '4:3'
}

export interface FieldTransform {
    scale: number
    offsetX: number
    offsetY: number
}

export interface FieldBounds {
    minX: number
    maxX: number
    minY: number
    maxY: number
}
