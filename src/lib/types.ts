export type VectorSample = { x: number; y: number }
export type VectorDatum = { x: number; y: number; dx: number; dy: number }
export type SliderHandle = { input: HTMLInputElement; valueTag: HTMLSpanElement }
export type ColorPreset = { key: string; label: string; rgb: [number, number, number] }

export interface ParticleParams {
    size: number
    bloomStrength: number
    bloomRadius: number
    lifeMin: number
    lifeMax: number
    fieldValidDistance: number
    speed: number
    particleCount: number
    colorPresetA: string
    colorPresetB: string
    noiseStrength: number
    trailsEnabled: boolean
    trailDecay: number
}

export interface FieldTransform {
    scale: number
    offsetX: number
    offsetY: number
}
