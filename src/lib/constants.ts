import type { ParticleParams } from './types'

export const VIEW_SIZE = 1.8
export const WORLD_EXTENT = 1.25
export const FLOW_SCALE = 0.85
export const SPEED_TO_GLOW = 2.6
export const JITTER = 0.015
export const FIELD_BORDER_MIN = 0.01
export const FIELD_BORDER_MAX = 0.1

export const defaultParams: ParticleParams = {
    size: 2,
    bloomStrength: 1.2,
    bloomRadius: 0.35,
    bloomThreshold: 0.82,
    lifeMin: 0.5,
    lifeMax: 1.4,
    fieldValidDistance: 0.05,
    speed: 6.0,
    particleCount: 5000,
    colormap: 'viridis',
    velocityScaling: 'raw',
    backgroundColor: '#02040a',
    opacity: 0.9,
    trailsEnabled: false,
    trailDecay: 0.9,
    paused: false,
    aspectRatio: '16:9',
}
