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
import { defaultParams, COLOR_PRESETS } from './lib/constants'
import { parseCsv } from './lib/csv-parser'
import type { ParticleParams } from './lib/types'

const container = document.querySelector<HTMLDivElement>('#app')
if (!container) throw new Error('Missing #app container')

const params: ParticleParams = { ...defaultParams }

// Camera framing constant
const VIEW_SIZE = 1.8

// Scene setup
const renderer = new WebGLRenderer({ antialias: false, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
container.appendChild(renderer.domElement)

const scene = new Scene()
scene.background = new Color(0x02040a)

const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
camera.position.z = 2

const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(scene, camera)
const bloomPass = new UnrealBloomPass(new Vector2(1, 1), params.bloomStrength, 0.82, params.bloomRadius)
const afterimagePass = new AfterimagePass(params.trailDecay)
composer.addPass(renderPass)
composer.addPass(bloomPass)
composer.addPass(afterimagePass)
afterimagePass.enabled = params.trailsEnabled
afterimagePass.uniforms['damp'].value = params.trailDecay

// Particle geometry and material
const geometryA = new BufferGeometry()
const geometryB = new BufferGeometry()
const material = new PointsMaterial({
  size: params.size,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  blending: AdditiveBlending,
  depthWrite: false,
})

const particlesA = new Points(geometryA, material)
const particlesB = new Points(geometryB, material)
scene.add(particlesA)
scene.add(particlesB)

// Initialize modules
const particleSystemA = new ParticleSystem(geometryA, params, () => params.colorPresetA)
const particleSystemB = new ParticleSystem(geometryB, params, () => params.colorPresetB)
particleSystemA.init()
particleSystemB.init()

let hasFieldA = false
let hasFieldB = false

const fieldLoaderA = new FieldLoader((data, transform, label) => setFieldData('left', data, transform, label))
const fieldLoaderB = new FieldLoader((data, transform, label) => setFieldData('right', data, transform, label))

const controlPanel = new ControlPanel(container, params, material, bloomPass, {
  onParticleCountChange: (count) => {
    particleSystemA.resizeBuffers(count)
    particleSystemB.resizeBuffers(count)
  },
  onLifetimeChange: () => {
    particleSystemA.reseedLifetimes()
    particleSystemB.reseedLifetimes()
  },
  onTrailToggle: (enabled) => updateTrails(enabled, params.trailDecay),
  onTrailDecayChange: (value) => updateTrails(params.trailsEnabled, value),
  onClearFieldA: () => clearField('left'),
  onClearFieldB: () => clearField('right'),
  onColorChange: () => updateColorPresetCache(),
})

function updateColorPresetCache() {
  cachedPresetA = COLOR_PRESETS.find((p) => p.key === params.colorPresetA) ?? COLOR_PRESETS[0]
  cachedPresetB = COLOR_PRESETS.find((p) => p.key === params.colorPresetB) ?? COLOR_PRESETS[0]
}

function getFieldContext(side: 'left' | 'right') {
  return side === 'left'
    ? { system: particleSystemA, loader: fieldLoaderA }
    : { system: particleSystemB, loader: fieldLoaderB }
}

function setFieldData(side: 'left' | 'right', data: Parameters<FieldLoader['computeFieldTransform']>[0] | null, transform: { scale: number; offsetX: number; offsetY: number }, label: string) {
  const { system, loader } = getFieldContext(side)
  system.setFieldData(data, transform)

  const loaded = system.hasFieldData()
  if (side === 'left') {
    hasFieldA = loaded
  } else {
    hasFieldB = loaded
  }

  controlPanel.setFieldState(side, { loaded, label })
  loader.updateStatus(label)
  updateLayout()
}

const recordingManager = new RecordingManager(renderer, composer, bloomPass, resize)

// HUD overlay
function createOverlay() {
  if (!container) return
  const hud = document.createElement('div')
  hud.className = 'hud'
  hud.innerHTML = `<div class="title">luminar</div><div class="subtitle">2D vector field bloom study</div><div class="status">Field A: <span id="field-status-a">default (built-in)</span> · Field B: <span id="field-status-b">default (built-in)</span></div>`
  container.appendChild(hud)
  fieldLoaderA.setStatusElement(document.getElementById('field-status-a'))
  fieldLoaderB.setStatusElement(document.getElementById('field-status-b'))
}

function setupDragAndDrop() {
  if (!container) return

  // Create side-specific overlays
  const dropOverlayLeft = document.createElement('div')
  dropOverlayLeft.className = 'drop-overlay drop-overlay--left'
  dropOverlayLeft.textContent = 'Drop to load Field A (left)'
  dropOverlayLeft.style.display = 'none'
  container.appendChild(dropOverlayLeft)

  const dropOverlayRight = document.createElement('div')
  dropOverlayRight.className = 'drop-overlay drop-overlay--right'
  dropOverlayRight.textContent = 'Drop to load Field B (right)'
  dropOverlayRight.style.display = 'none'
  container.appendChild(dropOverlayRight)

  const showOverlay = (side: 'left' | 'right') => {
    if (side === 'left') {
      dropOverlayLeft.style.display = 'flex'
      dropOverlayRight.style.display = 'none'
    } else {
      dropOverlayLeft.style.display = 'none'
      dropOverlayRight.style.display = 'flex'
    }
  }
  const hideOverlay = () => {
    dropOverlayLeft.style.display = 'none'
    dropOverlayRight.style.display = 'none'
  }

  const handleFiles = async (file: File, target: 'left' | 'right') => {
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) {
        const loader = target === 'left' ? fieldLoaderA : fieldLoaderB
        loader.updateStatus('CSV empty or invalid')
        controlPanel.setFieldState(target, { loaded: false, label: 'CSV empty or invalid' })
        hideOverlay()
        return
      }
      const loader = target === 'left' ? fieldLoaderA : fieldLoaderB
      const { transform, bounds } = loader.computeFieldTransform(rows)
      const label = `${file.name} · ${rows.length} vectors (${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)})`
      setFieldData(target, rows, transform, label)
    } catch (error) {
      console.error('Failed to load dropped CSV', error)
      const loader = target === 'left' ? fieldLoaderA : fieldLoaderB
      loader.updateStatus('CSV load error')
      controlPanel.setFieldState(target, { loaded: false, label: 'CSV load error' })
    } finally {
      hideOverlay()
    }
  }

  window.addEventListener('dragover', (e) => {
    e.preventDefault()
    const target = e.clientX < window.innerWidth * 0.5 ? 'left' : 'right'
    showOverlay(target)
  })

  window.addEventListener('dragleave', (e) => {
    e.preventDefault()
    hideOverlay()
  })

  window.addEventListener('drop', (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (dt && dt.files && dt.files[0]) {
      const target = e.clientX < window.innerWidth * 0.5 ? 'left' : 'right'
      handleFiles(dt.files[0], target)
    }
  })
}

function computeViewOffset(): number {
  const aspect = window.innerWidth / window.innerHeight
  const cameraWidth = VIEW_SIZE * aspect * 2

  // Visual sweet spot: fields shouldn't spread beyond this on wide windows
  const maxVisualOffset = 1.4

  // Minimum separation
  const minOffset = 1.0

  // Calculate desired offset based on window width
  // Each field should take ~45% of camera width, leaving ~10% gap
  const desiredOffset = (cameraWidth * 0.45) / 2

  // Account for controls panel (240px + 18px margin = 258px on right side)
  // Only apply panel constraint if window is narrow
  const panelPixels = 258
  const panelCameraUnits = (panelPixels / window.innerWidth) * cameraWidth
  const availableWidth = cameraWidth - panelCameraUnits - 0.5
  const offsetWithPanelConstraint = availableWidth / 2

  // Final offset: respect visual maximum, but reduce if panel constrains space
  const maxOffset = Math.min(maxVisualOffset, offsetWithPanelConstraint)

  return Math.max(minOffset, Math.min(desiredOffset, maxOffset))
}

function clearField(target: 'left' | 'right') {
  const transform = { scale: 1, offsetX: 0, offsetY: 0 }
  const { system, loader } = getFieldContext(target)
  system.reseedLifetimes()
  setFieldData(target, null, transform, 'Empty')
  loader.updateStatus('default (cleared)')
}

// Resize handler
function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  const aspect = width / height

  camera.left = -VIEW_SIZE * aspect
  camera.right = VIEW_SIZE * aspect
  camera.top = VIEW_SIZE
  camera.bottom = -VIEW_SIZE
  camera.updateProjectionMatrix()

  renderer.setSize(width, height, false)
  composer.setSize(width, height)
  bloomPass.setSize(width, height)
  updateLayout()
}

function updateLayout() {
  const count = (hasFieldA ? 1 : 0) + (hasFieldB ? 1 : 0)
  const offset = computeViewOffset()

  if (count === 2) {
    particlesA.visible = true
    particlesB.visible = true
    particleSystemA.setViewOffset(-offset)
    particleSystemB.setViewOffset(offset)
  } else if (count === 1) {
    if (hasFieldA) {
      particlesA.visible = true
      particlesB.visible = false
      particleSystemA.setViewOffset(0)
    } else {
      particlesA.visible = false
      particlesB.visible = true
      particleSystemB.setViewOffset(0)
    }
  } else {
    particlesA.visible = true
    particlesB.visible = false
    particleSystemA.setViewOffset(0)
    particleSystemB.setViewOffset(0)
  }
}

function updateTrails(enabled: boolean, decay: number) {
  params.trailsEnabled = enabled
  params.trailDecay = decay
  afterimagePass.enabled = enabled
  afterimagePass.uniforms['damp'].value = decay
}

// Animation loop
let lastTime = performance.now()
let cachedPresetA = COLOR_PRESETS.find((p) => p.key === params.colorPresetA) ?? COLOR_PRESETS[0]
let cachedPresetB = COLOR_PRESETS.find((p) => p.key === params.colorPresetB) ?? COLOR_PRESETS[0]

function animate(timestamp: number) {
  const now = timestamp || performance.now()
  const dt = Math.min(0.033, (now - lastTime) / 1000)
  lastTime = now

  particleSystemA.update(dt, cachedPresetA)
  particleSystemB.update(dt, cachedPresetB)

  composer.render()
  recordingManager.update()

  requestAnimationFrame(animate)
}

// Initialize
createOverlay()
controlPanel.create()
recordingManager.createControls(container.querySelector('.controls__body')!)
resize()
window.addEventListener('resize', resize)
fieldLoaderA.load()
fieldLoaderB.load()
setupDragAndDrop()
animate(0)
