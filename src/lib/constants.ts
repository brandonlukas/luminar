import type { ColorPreset, ParticleParams } from './types'

export const WORLD_EXTENT = 1.25
export const FLOW_SCALE = 0.85
export const SPEED_TO_GLOW = 2.6
export const JITTER = 0.015
export const FIELD_BORDER_MIN = 0.01
export const FIELD_BORDER_MAX = 0.1

export const COLOR_PRESETS: ColorPreset[] = [
    { key: 'luminous-violet', label: 'Luminous violet', rgb: [0.6, 0.25, 0.9] },
    { key: 'pure-white', label: 'Pure white', rgb: [1, 1, 1] },
    { key: 'neon-cyan', label: 'Neon cyan', rgb: [0.25, 0.95, 1] },
    { key: 'electric-lime', label: 'Electric lime', rgb: [0.75, 1, 0.25] },
    { key: 'solar-flare', label: 'Solar flare', rgb: [1, 0.55, 0.15] },
    { key: 'aurora-mint', label: 'Aurora mint', rgb: [0.4, 1, 0.85] },
    { key: 'sunrise-coral', label: 'Sunrise coral', rgb: [1, 0.6, 0.5] },
    { key: 'ember-gold', label: 'Ember gold', rgb: [1, 0.8, 0.2] },
]

export const DEFAULT_COLOR_PRESET = 'luminous-violet'

export const defaultParams: ParticleParams = {
    size: 2,
    bloomStrength: 1.2,
    bloomRadius: 0.35,
    lifeMin: 0.5,
    lifeMax: 1.4,
    fieldValidDistance: 0.05,
    speed: 6.0,
    particleCount: 5000,
    colorPresetA: DEFAULT_COLOR_PRESET,
    colorPresetB: DEFAULT_COLOR_PRESET,
    noiseStrength: 0.0,
    trailsEnabled: false,
    trailDecay: 0.9,
}
