import type { ColormapName } from './types'

export interface ColormapDef {
    name: ColormapName
    label: string
    lut: Float32Array // 256 * 3 = 768 floats
}

type ColorStop = [number, number, number]

// Interpolate between control points to generate a 256-entry LUT
function buildLut(stops: ColorStop[]): Float32Array {
    const lut = new Float32Array(256 * 3)
    const n = stops.length - 1

    for (let i = 0; i < 256; i++) {
        const t = i / 255
        const scaledT = t * n
        const idx = Math.min(Math.floor(scaledT), n - 1)
        const frac = scaledT - idx

        const [r0, g0, b0] = stops[idx]
        const [r1, g1, b1] = stops[idx + 1]

        const i3 = i * 3
        lut[i3] = r0 + (r1 - r0) * frac
        lut[i3 + 1] = g0 + (g1 - g0) * frac
        lut[i3 + 2] = b0 + (b1 - b0) * frac
    }

    return lut
}

// Control points sampled from matplotlib colormaps (16 evenly-spaced stops each)

const viridisStops: ColorStop[] = [
    [0.267, 0.004, 0.329],
    [0.282, 0.100, 0.422],
    [0.278, 0.175, 0.483],
    [0.254, 0.265, 0.530],
    [0.207, 0.372, 0.553],
    [0.164, 0.471, 0.558],
    [0.128, 0.567, 0.551],
    [0.120, 0.625, 0.534],
    [0.135, 0.659, 0.518],
    [0.197, 0.718, 0.473],
    [0.267, 0.749, 0.441],
    [0.369, 0.789, 0.383],
    [0.478, 0.821, 0.318],
    [0.600, 0.848, 0.241],
    [0.741, 0.873, 0.150],
    [0.878, 0.891, 0.102],
    [0.993, 0.906, 0.144],
]

const cividisStops: ColorStop[] = [
    [0.000, 0.135, 0.305],
    [0.058, 0.169, 0.348],
    [0.109, 0.211, 0.394],
    [0.167, 0.252, 0.398],
    [0.220, 0.289, 0.402],
    [0.289, 0.333, 0.400],
    [0.361, 0.380, 0.397],
    [0.432, 0.428, 0.385],
    [0.510, 0.479, 0.370],
    [0.583, 0.529, 0.343],
    [0.664, 0.581, 0.311],
    [0.739, 0.633, 0.264],
    [0.826, 0.692, 0.200],
    [0.894, 0.742, 0.141],
    [0.957, 0.797, 0.067],
    [0.983, 0.815, 0.040],
    [0.995, 0.826, 0.032],
]

const infernoStops: ColorStop[] = [
    [0.001, 0.000, 0.014],
    [0.042, 0.024, 0.147],
    [0.106, 0.066, 0.306],
    [0.212, 0.052, 0.421],
    [0.322, 0.059, 0.464],
    [0.434, 0.069, 0.437],
    [0.553, 0.098, 0.404],
    [0.656, 0.154, 0.324],
    [0.758, 0.233, 0.239],
    [0.843, 0.325, 0.157],
    [0.922, 0.427, 0.071],
    [0.963, 0.534, 0.024],
    [0.988, 0.645, 0.040],
    [0.988, 0.765, 0.155],
    [0.976, 0.877, 0.350],
    [0.976, 0.942, 0.533],
    [0.988, 0.998, 0.645],
]

const magmaStops: ColorStop[] = [
    [0.001, 0.000, 0.014],
    [0.035, 0.028, 0.144],
    [0.112, 0.066, 0.306],
    [0.208, 0.059, 0.432],
    [0.316, 0.072, 0.485],
    [0.420, 0.100, 0.515],
    [0.533, 0.145, 0.533],
    [0.640, 0.202, 0.497],
    [0.730, 0.262, 0.455],
    [0.820, 0.342, 0.395],
    [0.913, 0.427, 0.341],
    [0.956, 0.522, 0.327],
    [0.980, 0.618, 0.353],
    [0.988, 0.723, 0.438],
    [0.988, 0.835, 0.576],
    [0.988, 0.917, 0.681],
    [0.987, 0.991, 0.750],
]

const plasmaStops: ColorStop[] = [
    [0.050, 0.030, 0.528],
    [0.134, 0.019, 0.576],
    [0.249, 0.014, 0.638],
    [0.339, 0.003, 0.659],
    [0.440, 0.002, 0.658],
    [0.529, 0.014, 0.624],
    [0.622, 0.032, 0.579],
    [0.700, 0.076, 0.510],
    [0.784, 0.149, 0.438],
    [0.843, 0.220, 0.358],
    [0.913, 0.310, 0.266],
    [0.950, 0.398, 0.188],
    [0.975, 0.495, 0.120],
    [0.988, 0.604, 0.072],
    [0.976, 0.728, 0.069],
    [0.940, 0.855, 0.100],
    [0.940, 0.975, 0.131],
]

const coolwarmStops: ColorStop[] = [
    [0.230, 0.299, 0.754],
    [0.310, 0.388, 0.820],
    [0.395, 0.490, 0.870],
    [0.488, 0.582, 0.914],
    [0.575, 0.664, 0.945],
    [0.664, 0.740, 0.962],
    [0.749, 0.811, 0.973],
    [0.845, 0.864, 0.953],
    [0.929, 0.815, 0.772],
    [0.945, 0.733, 0.645],
    [0.945, 0.627, 0.509],
    [0.930, 0.520, 0.394],
    [0.878, 0.397, 0.302],
    [0.816, 0.282, 0.229],
    [0.753, 0.162, 0.175],
    [0.720, 0.080, 0.152],
    [0.706, 0.016, 0.150],
]

export const COLORMAPS: ColormapDef[] = [
    { name: 'viridis', label: 'Viridis', lut: buildLut(viridisStops) },
    { name: 'cividis', label: 'Cividis', lut: buildLut(cividisStops) },
    { name: 'inferno', label: 'Inferno', lut: buildLut(infernoStops) },
    { name: 'magma', label: 'Magma', lut: buildLut(magmaStops) },
    { name: 'plasma', label: 'Plasma', lut: buildLut(plasmaStops) },
    { name: 'coolwarm', label: 'Coolwarm', lut: buildLut(coolwarmStops) },
]

export function getColormapLut(name: ColormapName): Float32Array {
    return (COLORMAPS.find((c) => c.name === name) ?? COLORMAPS[0]).lut
}
