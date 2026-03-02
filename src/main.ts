import './style.css'
import { AdditiveBlending, BufferGeometry, Color, OrthographicCamera, Points, PointsMaterial, Scene, Vector2, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { ParticleSystem } from './modules/particle-system'
import { FieldLoader } from './modules/field-loader'
import { ControlPanel } from './modules/controls'
import { RecordingManager } from './modules/recording'
import { defaultParams, VIEW_SIZE } from './lib/constants'
import { getColormapLut } from './lib/colormaps'
import { parseCsv } from './lib/csv-parser'
import type { ParticleParams } from './lib/types'

// DOM references
const canvasWrap = document.getElementById('canvas-wrap')!
const sidebar = document.getElementById('sidebar')!
const statusFps = document.getElementById('status-fps')!
const statusParticles = document.getElementById('status-particles')!
const statusField = document.getElementById('status-field')!
const btnPlayPause = document.getElementById('btn-playpause')!
const btnAspect = document.getElementById('btn-aspect')!
const filePickerBtn = document.getElementById('file-picker-btn')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const dropOverlay = document.getElementById('drop-overlay')!

// State
const params: ParticleParams = { ...defaultParams }
let currentLut = getColormapLut(params.colormap)

// Scene setup
const renderer = new WebGLRenderer({ antialias: false, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
canvasWrap.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(params.backgroundColor)

const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
camera.position.z = 2

const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
const bloomPass = new UnrealBloomPass(new Vector2(1, 1), params.bloomStrength, params.bloomThreshold, params.bloomRadius)
const afterimagePass = new AfterimagePass(params.trailDecay)
composer.addPass(renderPass)
composer.addPass(bloomPass)
composer.addPass(afterimagePass)
afterimagePass.enabled = params.trailsEnabled
afterimagePass.uniforms['damp'].value = params.trailDecay

// Particle geometry and material (single system)
const geometry = new BufferGeometry()
const material = new PointsMaterial({
    size: params.size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: params.opacity,
    blending: AdditiveBlending,
    depthWrite: false,
})

const points = new Points(geometry, material)
scene.add(points)

// Initialize particle system
const particleSystem = new ParticleSystem(geometry, params)
particleSystem.init()

const fieldLoader = new FieldLoader((data, transform, label, bounds) => {
    particleSystem.setFieldData(data, transform, bounds)
    setFieldStatus(label)
})

// Control panel
const controlPanel = new ControlPanel(sidebar, params, {
    onParticleCountChange: (count) => {
        particleSystem.resizeBuffers(count)
        statusParticles.textContent = `${count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count} particles`
    },
    onLifetimeChange: () => {
        particleSystem.reseedLifetimes()
    },
    onTrailToggle: (enabled) => updateTrails(enabled, params.trailDecay),
    onTrailDecayChange: (value) => updateTrails(params.trailsEnabled, value),
    onColormapChange: (name) => {
        currentLut = getColormapLut(name)
    },
    onBackgroundColorChange: (color) => {
        scene.background = new Color(color)
    },
    onSizeChange: (value) => {
        material.size = value
    },
    onOpacityChange: (value) => {
        material.opacity = value
    },
    onBloomStrengthChange: (value) => {
        bloomPass.strength = value
    },
    onBloomRadiusChange: (value) => {
        bloomPass.radius = value
    },
    onBloomThresholdChange: (value) => {
        bloomPass.threshold = value
    },
    onClearField: () => clearField(),
})

const recordingManager = new RecordingManager(
    scene,
    camera,
    particleSystem,
    params,
    bloomPass,
    afterimagePass,
    () => currentLut,
    () => params.aspectRatio,
    () => ({ width: renderer.domElement.width, height: renderer.domElement.height }),
)

// Build UI
controlPanel.create()
recordingManager.createControls(sidebar)

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
    canvasWrap.style.aspectRatio = params.aspectRatio === '16:9' ? '16 / 9' : '4 / 3'
    resize()
})

// Resize handling
const resizeObserver = new ResizeObserver(() => resize())
resizeObserver.observe(canvasWrap)
resize()

// Load default field
fieldLoader.load()

// Start animation
let lastTime = performance.now()
let fpsFrames = 0
let fpsLastUpdate = performance.now()
animate(0)

// ──────────────────────────────────────────────────

function resize() {
    const width = canvasWrap.clientWidth
    const height = canvasWrap.clientHeight
    if (width === 0 || height === 0) return

    const aspect = width / height

    camera.left = -VIEW_SIZE * aspect
    camera.right = VIEW_SIZE * aspect
    camera.top = VIEW_SIZE
    camera.bottom = -VIEW_SIZE
    camera.updateProjectionMatrix()

    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    bloomPass.setSize(width, height)
}

function updateTrails(enabled: boolean, decay: number) {
    params.trailsEnabled = enabled
    params.trailDecay = decay
    afterimagePass.enabled = enabled
    afterimagePass.uniforms['damp'].value = decay
}

function clearField() {
    particleSystem.setFieldData(null, { scale: 1, offsetX: 0, offsetY: 0 })
    particleSystem.reseedLifetimes()
    setFieldStatus('No field loaded')
}

function setFieldStatus(text: string) {
    statusField.textContent = text
}

async function loadCsvFile(file: File) {
    try {
        const text = await file.text()
        const rows = parseCsv(text)
        if (!rows.length) {
            setFieldStatus('CSV empty or invalid')
            return
        }
        const { transform, bounds } = fieldLoader.computeFieldTransform(rows)
        const label = `${file.name} \u00B7 ${rows.length} vectors (${bounds.width.toFixed(1)}\u00D7${bounds.height.toFixed(1)})`
        particleSystem.setFieldData(rows, transform, bounds)
        setFieldStatus(label)
    } catch (error) {
        console.error('Failed to load CSV', error)
        setFieldStatus('CSV load error')
    }
}

function setupDragAndDrop() {
    let dragCounter = 0

    window.addEventListener('dragover', (e) => {
        e.preventDefault()
    })

    window.addEventListener('dragenter', (e) => {
        e.preventDefault()
        dragCounter++
        dropOverlay.style.display = 'flex'
    })

    window.addEventListener('dragleave', (e) => {
        e.preventDefault()
        dragCounter--
        if (dragCounter <= 0) {
            dragCounter = 0
            dropOverlay.style.display = 'none'
        }
    })

    window.addEventListener('drop', (e) => {
        e.preventDefault()
        dragCounter = 0
        dropOverlay.style.display = 'none'
        const dt = e.dataTransfer
        if (dt && dt.files && dt.files[0]) {
            loadCsvFile(dt.files[0])
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
        particleSystem.update(dt, currentLut)
    }

    composer.render()

    requestAnimationFrame(animate)
}

// Initial status
statusParticles.textContent = `${params.particleCount} particles`
