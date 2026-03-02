import './style.css'
import { ControlPanel } from './modules/controls'
import { RecordingManager } from './modules/recording'
import { ViewportGrid } from './modules/viewport-grid'
import { computeFieldTransform } from './modules/field-loader'
import { defaultParams, MAX_SLOTS } from './lib/constants'
import { formatCount } from './lib/dom-helpers'
import { parseCsv } from './lib/csv-parser'
import type { ParticleParams } from './lib/types'

// DOM references
const viewport = document.getElementById('viewport')!
const sidebar = document.getElementById('sidebar')!
const exportPanel = document.getElementById('export-panel')!
const statusFps = document.getElementById('status-fps')!
const statusParticles = document.getElementById('status-particles')!
const statusField = document.getElementById('status-field')!
const btnPlayPause = document.getElementById('btn-playpause')!
const btnAspect = document.getElementById('btn-aspect')!
const filePickerBtn = document.getElementById('file-picker-btn')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const dropOverlay = document.getElementById('drop-overlay')!
const emptyState = document.getElementById('empty-state')!

// Global state
const params: ParticleParams = { ...defaultParams }

// Viewport grid (manages up to 2 field slots)
const grid = new ViewportGrid(viewport, emptyState, params, {
    onSlotSelected: (slot) => {
        controlPanel.updateSlotSection(slot)
        if (slot?.fieldData) {
            statusField.textContent = slot.fieldData.label
        } else if (grid.getActiveCount() > 0) {
            statusField.textContent = `${grid.getActiveCount()} field${grid.getActiveCount() > 1 ? 's' : ''} loaded`
        } else {
            statusField.textContent = 'No field loaded'
        }
    },
    onSlotCountChanged: (count) => {
        if (count === 0) {
            statusField.textContent = 'No field loaded'
        }
    },
})

// Control panel
const controlPanel = new ControlPanel(sidebar, params, {
    onParticleCountChange: (count) => {
        for (const slot of grid.getActiveSlots()) {
            slot.resizeBuffers(count)
        }
        statusParticles.textContent = `${formatCount(count)} particles`
    },
    onLifetimeChange: () => {
        for (const slot of grid.getActiveSlots()) {
            slot.reseedLifetimes()
        }
    },
    onTrailToggle: (enabled) => {
        params.trailsEnabled = enabled
        grid.syncGlobalParams()
    },
    onTrailDecayChange: (value) => {
        params.trailDecay = value
        grid.syncGlobalParams()
    },
    onBackgroundColorChange: (color) => {
        params.backgroundColor = color
        grid.syncGlobalParams()
    },
    onSizeChange: (value) => {
        params.size = value
        grid.syncGlobalParams()
    },
    onOpacityChange: (value) => {
        params.opacity = value
        grid.syncGlobalParams()
    },
    onBloomStrengthChange: (value) => {
        params.bloomStrength = value
        grid.syncGlobalParams()
    },
    onBloomRadiusChange: (value) => {
        params.bloomRadius = value
        grid.syncGlobalParams()
    },
    onBloomThresholdChange: (value) => {
        params.bloomThreshold = value
        grid.syncGlobalParams()
    },
    onSlotColormapChange: (name) => {
        grid.getSelectedSlot()?.setColormap(name)
    },
    onSlotVelocityScalingChange: (scaling) => {
        grid.getSelectedSlot()?.setVelocityScaling(scaling)
    },
    onSlotRemove: () => {
        const slot = grid.getSelectedSlot()
        if (slot) grid.removeSlot(slot.index)
    },
})

const recordingManager = new RecordingManager(grid, params, () => params.aspectRatio)

// Build UI
controlPanel.create()
recordingManager.createControls(exportPanel)

// File picker
filePickerBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
        loadCsvFile(fileInput.files[0])
        fileInput.value = ''
    }
})

// Drag and drop
setupDragAndDrop()

// Play/Pause
btnPlayPause.addEventListener('click', () => {
    params.paused = !params.paused
    btnPlayPause.textContent = params.paused ? 'Play' : 'Pause'
})

// Aspect ratio toggle
btnAspect.addEventListener('click', () => {
    params.aspectRatio = params.aspectRatio === '16:9' ? '4:3' : '16:9'
    btnAspect.textContent = params.aspectRatio
    grid.resizeAll()
})

// Resize handling
const resizeObserver = new ResizeObserver(() => grid.resizeAll())
resizeObserver.observe(viewport)

// Start animation
let lastTime = performance.now()
let fpsFrames = 0
let fpsLastUpdate = performance.now()
animate(0)

// ──────────────────────────────────────────────────

async function loadCsvFile(file: File) {
    if (grid.isFull()) {
        statusField.textContent = `All ${MAX_SLOTS} slots full`
        return
    }
    try {
        const text = await file.text()
        const rows = parseCsv(text)
        if (!rows.length) {
            statusField.textContent = 'CSV empty or invalid'
            return
        }
        const { transform, bounds } = computeFieldTransform(rows)
        const label = `${file.name} \u00B7 ${rows.length} vectors (${bounds.width.toFixed(1)}\u00D7${bounds.height.toFixed(1)})`

        grid.addField({ fileName: file.name, label, data: rows, transform, bounds })
        statusField.textContent = label
    } catch (error) {
        console.error('Failed to load CSV', error)
        statusField.textContent = 'CSV load error'
    }
}

function setupDragAndDrop() {
    let dragCounter = 0

    const isFileDrag = (e: DragEvent) =>
        e.dataTransfer?.types.includes('Files') ?? false

    window.addEventListener('dragover', (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
    })

    window.addEventListener('dragenter', (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragCounter++
        dropOverlay.style.display = 'flex'
    })

    window.addEventListener('dragleave', (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragCounter--
        if (dragCounter <= 0) {
            dragCounter = 0
            dropOverlay.style.display = 'none'
        }
    })

    window.addEventListener('drop', (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragCounter = 0
        dropOverlay.style.display = 'none'
        const dt = e.dataTransfer
        if (dt && dt.files) {
            const available = MAX_SLOTS - grid.getActiveCount()
            const count = Math.min(dt.files.length, available)
            for (let i = 0; i < count; i++) {
                loadCsvFile(dt.files[i])
            }
        }
    })
}

function animate(timestamp: number) {
    const now = timestamp || performance.now()
    const dt = Math.min(0.033, (now - lastTime) / 1000)
    lastTime = now

    // FPS counter
    fpsFrames++
    if (now - fpsLastUpdate >= 500) {
        const fps = Math.round((fpsFrames * 1000) / (now - fpsLastUpdate))
        statusFps.textContent = `${fps} fps`
        fpsFrames = 0
        fpsLastUpdate = now
    }

    if (!params.paused) {
        grid.updateAll(dt)
    }
    grid.renderAll()

    requestAnimationFrame(animate)
}

// Initial status
statusParticles.textContent = `${params.particleCount} particles`
