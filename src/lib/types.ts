export type VectorSample = { x: number; y: number }
export type VectorDatum = { x: number; y: number; dx: number; dy: number }
export type SliderHandle = { input: HTMLInputElement; valueTag: HTMLSpanElement }
export type ColormapName = 'viridis' | 'cividis' | 'inferno' | 'magma' | 'plasma' | 'coolwarm'
export type VelocityScaling = 'raw' | 'log' | 'normalized'

/** Per-slot settings that differ between vector fields */
export interface SlotParams {
    colormap: ColormapName
    velocityScaling: VelocityScaling
}

/** Global settings shared across all slots */
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
    backgroundColor: string
    opacity: number
    trailsEnabled: boolean
    trailDecay: number
    paused: boolean
    aspectRatio: '16:9' | '4:3'
}

/** Data associated with a loaded field in a slot */
export interface SlotFieldData {
    fileName: string
    label: string
    data: VectorDatum[]
    transform: FieldTransform
    bounds: FieldBounds
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
    width: number
    height: number
}
