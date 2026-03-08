import {
    AdditiveBlending,
    BufferGeometry,
    Color,
    OrthographicCamera,
    Points,
    PointsMaterial,
    Scene,
    Vector2,
    WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { ParticleSystem } from './particle-system'
import { getColormapLut } from '../lib/colormaps'
import { VIEW_SIZE } from '../lib/constants'
import type { ParticleParams, SlotParams, SlotFieldData, ColormapName, VelocityScaling, ReferenceFieldProvider } from '../lib/types'

export class FieldSlot {
    index: number
    readonly container: HTMLDivElement
    private labelEl: HTMLDivElement

    // Three.js pipeline
    private renderer: WebGLRenderer
    readonly scene: Scene
    readonly camera: OrthographicCamera
    private composer: EffectComposer
    readonly bloomPass: UnrealBloomPass
    readonly afterimagePass: AfterimagePass
    private geometry: BufferGeometry
    private material: PointsMaterial
    private points: Points
    readonly particleSystem: ParticleSystem

    // Per-slot state
    readonly slotParams: SlotParams
    private currentLut: Float32Array
    fieldData: SlotFieldData | null = null

    private _selected = false

    constructor(index: number, globalParams: ParticleParams, slotParams: SlotParams) {
        this.index = index
        this.slotParams = { ...slotParams }
        this.currentLut = getColormapLut(this.slotParams.colormap)

        // DOM
        this.container = document.createElement('div')
        this.container.className = 'slot'
        this.container.dataset.slotIndex = String(index)
        this.container.draggable = true

        const canvas = document.createElement('canvas')
        this.container.appendChild(canvas)

        this.labelEl = document.createElement('div')
        this.labelEl.className = 'slot__label'
        this.container.appendChild(this.labelEl)

        // Renderer
        this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

        // Scene
        this.scene = new Scene()
        this.scene.background = new Color(globalParams.backgroundColor)

        // Camera
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
        this.camera.position.z = 2

        // Post-processing
        this.composer = new EffectComposer(this.renderer)
        this.bloomPass = new UnrealBloomPass(
            new Vector2(1, 1),
            globalParams.bloomStrength,
            globalParams.bloomThreshold,
            globalParams.bloomRadius,
        )
        this.afterimagePass = new AfterimagePass(globalParams.trailDecay)
        this.afterimagePass.enabled = globalParams.trailsEnabled
        this.afterimagePass.uniforms['damp'].value = globalParams.trailDecay

        this.composer.addPass(new RenderPass(this.scene, this.camera))
        this.composer.addPass(this.bloomPass)
        this.composer.addPass(this.afterimagePass)

        // Geometry + Material
        this.geometry = new BufferGeometry()
        this.material = new PointsMaterial({
            size: globalParams.size,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: globalParams.opacity,
            blending: AdditiveBlending,
            depthWrite: false,
        })
        this.points = new Points(this.geometry, this.material)
        this.scene.add(this.points)
        this.points.visible = false

        // Particle system
        this.particleSystem = new ParticleSystem(this.geometry, globalParams, this.slotParams)
        this.particleSystem.init()
    }

    // ── Field management ──────────────────────────

    loadField(fieldData: SlotFieldData): void {
        this.fieldData = fieldData
        this.particleSystem.setFieldData(fieldData.data, fieldData.transform, fieldData.bounds)
        this.points.visible = true
        this.labelEl.textContent = fieldData.fileName
    }

    clearField(): void {
        this.fieldData = null
        this.particleSystem.setFieldData(null, { scale: 1, offsetX: 0, offsetY: 0 })
        this.particleSystem.reseedLifetimes()
        this.points.visible = false
        this.labelEl.textContent = ''
    }

    hasField(): boolean {
        return this.fieldData !== null
    }

    // ── Per-slot settings ─────────────────────────

    setColormap(name: ColormapName): void {
        this.slotParams.colormap = name
        this.currentLut = getColormapLut(name)
    }

    setVelocityScaling(scaling: VelocityScaling): void {
        this.slotParams.velocityScaling = scaling
    }

    setReferenceField(ref: ReferenceFieldProvider | null): void {
        this.particleSystem.setReferenceField(ref)
    }

    // ── Global settings propagation ───────────────

    syncGlobalParams(params: ParticleParams): void {
        (this.scene.background as Color).set(params.backgroundColor)
        this.material.size = params.size
        this.material.opacity = params.opacity
        this.bloomPass.strength = params.bloomStrength
        this.bloomPass.radius = params.bloomRadius
        this.bloomPass.threshold = params.bloomThreshold
        this.afterimagePass.enabled = params.trailsEnabled
        this.afterimagePass.uniforms['damp'].value = params.trailDecay
    }

    resizeBuffers(count: number): void {
        this.particleSystem.resizeBuffers(count)
    }

    reseedLifetimes(): void {
        this.particleSystem.reseedLifetimes()
    }

    // ── Selection ─────────────────────────────────

    get selected(): boolean {
        return this._selected
    }

    set selected(value: boolean) {
        this._selected = value
        this.container.classList.toggle('slot--selected', value)
    }

    // ── Render loop ───────────────────────────────

    update(dt: number): void {
        this.particleSystem.update(dt, this.currentLut)
    }

    render(): void {
        this.composer.render()
    }

    // ── Resize ────────────────────────────────────

    resize(): void {
        const width = this.container.clientWidth
        const height = this.container.clientHeight
        if (width === 0 || height === 0) return

        const aspect = width / height
        this.camera.left = -VIEW_SIZE * aspect
        this.camera.right = VIEW_SIZE * aspect
        this.camera.top = VIEW_SIZE
        this.camera.bottom = -VIEW_SIZE
        this.camera.updateProjectionMatrix()

        this.renderer.setSize(width, height, false)
        this.composer.setSize(width, height)
        this.bloomPass.setSize(width, height)
    }

    // ── Accessors for RecordingManager ────────────

    getLut(): Float32Array {
        return this.currentLut
    }

    getRendererSize(): { width: number; height: number } {
        return {
            width: this.renderer.domElement.width,
            height: this.renderer.domElement.height,
        }
    }

    // ── Cleanup ───────────────────────────────────

    dispose(): void {
        this.composer.renderTarget1.dispose()
        this.composer.renderTarget2.dispose()
        this.bloomPass.dispose()
        this.afterimagePass.dispose()
        this.renderer.dispose()
        this.geometry.dispose()
        this.material.dispose()
        this.container.remove()
    }
}
