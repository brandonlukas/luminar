import { OrthographicCamera, Scene, Vector2, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { FFmpegEncoder } from './ffmpeg-encoder'
import { VIEW_SIZE } from '../lib/constants'
import type { ParticleSystem } from './particle-system'
import type { ParticleParams } from '../lib/types'

export class RecordingManager {
    private isExporting = false
    private exportCrf = 8
    private recordingDuration = 15
    private recordingResolution: 'current' | '1080p' | '4k' = 'current'
    private recordingFps = 30

    private recordButton: HTMLButtonElement | null = null
    private recordStatus: HTMLDivElement | null = null
    private progressBar: HTMLProgressElement | null = null

    private scene: Scene
    private camera: OrthographicCamera
    private particleSystem: ParticleSystem
    private params: ParticleParams
    private bloomPass: UnrealBloomPass
    private afterimagePass: AfterimagePass
    private getLut: () => Float32Array
    private aspectRatio: () => '16:9' | '4:3'
    private getCanvasSize: () => { width: number; height: number }

    constructor(
        scene: Scene,
        camera: OrthographicCamera,
        particleSystem: ParticleSystem,
        params: ParticleParams,
        bloomPass: UnrealBloomPass,
        afterimagePass: AfterimagePass,
        getLut: () => Float32Array,
        aspectRatio: () => '16:9' | '4:3',
        getCanvasSize: () => { width: number; height: number },
    ) {
        this.scene = scene
        this.camera = camera
        this.particleSystem = particleSystem
        this.params = params
        this.bloomPass = bloomPass
        this.afterimagePass = afterimagePass
        this.getLut = getLut
        this.aspectRatio = aspectRatio
        this.getCanvasSize = getCanvasSize
    }

    createControls(container: HTMLElement) {
        const section = document.createElement('div')
        section.className = 'controls__section'

        const header = document.createElement('div')
        header.className = 'controls__section-header'
        const title = document.createElement('span')
        title.className = 'controls__section-title'
        title.textContent = 'Export'
        const arrow = document.createElement('span')
        arrow.className = 'controls__section-arrow'
        arrow.textContent = '\u25BC'
        header.appendChild(title)
        header.appendChild(arrow)

        const body = document.createElement('div')
        body.className = 'controls__section-body'

        header.addEventListener('click', () => {
            section.classList.toggle('controls__section--collapsed')
        })

        // Resolution
        const resRow = document.createElement('label')
        resRow.className = 'controls__row'
        resRow.style.gridTemplateColumns = '1fr 1fr'
        const resLabel = document.createElement('span')
        resLabel.textContent = 'Resolution'
        const resSelect = document.createElement('select')
        resSelect.className = 'controls__select'
        resSelect.innerHTML = '<option value="current">Current</option><option value="1080p">1080p</option><option value="4k">4K</option>'
        resSelect.value = this.recordingResolution
        resSelect.addEventListener('change', () => {
            this.recordingResolution = resSelect.value as typeof this.recordingResolution
        })
        resRow.appendChild(resLabel)
        resRow.appendChild(resSelect)
        body.appendChild(resRow)

        // Frame rate
        const fpsRow = document.createElement('label')
        fpsRow.className = 'controls__row'
        fpsRow.style.gridTemplateColumns = '1fr 1fr'
        const fpsLabel = document.createElement('span')
        fpsLabel.textContent = 'Frame rate'
        const fpsSelect = document.createElement('select')
        fpsSelect.className = 'controls__select'
        fpsSelect.innerHTML = '<option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option>'
        fpsSelect.value = String(this.recordingFps)
        fpsSelect.addEventListener('change', () => {
            this.recordingFps = parseInt(fpsSelect.value)
        })
        fpsRow.appendChild(fpsLabel)
        fpsRow.appendChild(fpsSelect)
        body.appendChild(fpsRow)

        // Duration
        const durRow = document.createElement('label')
        durRow.className = 'controls__row'
        durRow.style.gridTemplateColumns = '1fr 1fr auto'
        const durLabel = document.createElement('span')
        durLabel.textContent = 'Duration'
        const durInput = document.createElement('input')
        durInput.type = 'range'
        durInput.min = '5'
        durInput.max = '120'
        durInput.step = '5'
        durInput.value = String(this.recordingDuration)
        const durValue = document.createElement('span')
        durValue.className = 'controls__value'
        durValue.textContent = `${this.recordingDuration}s`
        durInput.addEventListener('input', () => {
            this.recordingDuration = parseInt(durInput.value)
            durValue.textContent = `${this.recordingDuration}s`
        })
        durRow.appendChild(durLabel)
        durRow.appendChild(durInput)
        durRow.appendChild(durValue)
        body.appendChild(durRow)

        // CRF (quality)
        const crfRow = document.createElement('label')
        crfRow.className = 'controls__row'
        crfRow.style.gridTemplateColumns = '1fr 1fr auto'
        const crfLabel = document.createElement('span')
        crfLabel.textContent = 'Quality (CRF)'
        const crfInput = document.createElement('input')
        crfInput.type = 'range'
        crfInput.min = '0'
        crfInput.max = '18'
        crfInput.step = '1'
        crfInput.value = String(this.exportCrf)
        const crfValue = document.createElement('span')
        crfValue.className = 'controls__value'
        crfValue.textContent = String(this.exportCrf)
        crfInput.addEventListener('input', () => {
            this.exportCrf = parseInt(crfInput.value)
            crfValue.textContent = String(this.exportCrf)
        })
        crfRow.appendChild(crfLabel)
        crfRow.appendChild(crfInput)
        crfRow.appendChild(crfValue)
        body.appendChild(crfRow)

        // Export button
        this.recordButton = document.createElement('button')
        this.recordButton.type = 'button'
        this.recordButton.className = 'controls__button controls__button--record'
        this.recordButton.textContent = 'Export MP4'
        this.recordButton.addEventListener('click', () => {
            if (this.isExporting) {
                this.isExporting = false
            } else {
                this.startExport()
            }
        })
        body.appendChild(this.recordButton)

        // Progress bar
        this.progressBar = document.createElement('progress')
        this.progressBar.className = 'controls__progress'
        this.progressBar.max = 100
        this.progressBar.value = 0
        this.progressBar.style.display = 'none'
        body.appendChild(this.progressBar)

        // Status
        this.recordStatus = document.createElement('div')
        this.recordStatus.className = 'controls__status'
        this.recordStatus.style.display = 'none'
        body.appendChild(this.recordStatus)

        section.appendChild(header)
        section.appendChild(body)
        container.appendChild(section)
    }

    private getExportDimensions(): { width: number; height: number } {
        const ratio = this.aspectRatio()
        const ar = ratio === '4:3' ? 4 / 3 : 16 / 9

        let w: number, h: number
        switch (this.recordingResolution) {
            case '1080p':
                w = Math.round(1080 * ar); h = 1080; break
            case '4k':
                w = Math.round(2160 * ar); h = 2160; break
            case 'current':
            default: {
                const size = this.getCanvasSize()
                w = size.width; h = size.height
            }
        }
        // Ensure even dimensions (required for yuv420p)
        return { width: w - (w % 2), height: h - (h % 2) }
    }

    private updateUI(status: string, pct?: number) {
        if (this.recordStatus) {
            this.recordStatus.style.display = 'block'
            this.recordStatus.textContent = status
        }
        if (this.progressBar) {
            this.progressBar.style.display = 'block'
            this.progressBar.value = pct ?? 0
        }
    }

    private resetUI() {
        if (this.recordButton) {
            this.recordButton.textContent = 'Export MP4'
        }
        if (this.progressBar) {
            this.progressBar.style.display = 'none'
            this.progressBar.value = 0
        }
    }

    private async startExport(): Promise<void> {
        if (this.isExporting) return
        this.isExporting = true

        const wasPaused = this.params.paused
        this.params.paused = true

        if (this.recordButton) {
            this.recordButton.textContent = 'Cancel export'
        }

        try {
            const { width, height } = this.getExportDimensions()

            // Create offscreen renderer
            const offscreenCanvas = document.createElement('canvas')
            offscreenCanvas.width = width
            offscreenCanvas.height = height

            const offscreenRenderer = new WebGLRenderer({
                canvas: offscreenCanvas,
                preserveDrawingBuffer: true,
                antialias: false,
                alpha: false,
            })
            offscreenRenderer.setSize(width, height, false)

            // Set up camera for export resolution
            const aspect = width / height
            const exportCamera = this.camera.clone()
            exportCamera.left = -VIEW_SIZE * aspect
            exportCamera.right = VIEW_SIZE * aspect
            exportCamera.top = VIEW_SIZE
            exportCamera.bottom = -VIEW_SIZE
            exportCamera.updateProjectionMatrix()

            // Create offscreen composer with matching passes
            const offscreenComposer = new EffectComposer(offscreenRenderer)
            offscreenComposer.addPass(new RenderPass(this.scene, exportCamera))
            offscreenComposer.addPass(new UnrealBloomPass(
                new Vector2(width, height),
                this.bloomPass.strength,
                this.bloomPass.radius,
                this.bloomPass.threshold,
            ))
            const exportAfterimage = new AfterimagePass(
                this.afterimagePass.uniforms['damp'].value,
            )
            exportAfterimage.enabled = this.afterimagePass.enabled
            offscreenComposer.addPass(exportAfterimage)

            // Init FFmpeg encoder
            this.updateUI('Loading encoder...')
            const encoder = new FFmpegEncoder()
            await encoder.init()

            if (!this.isExporting) {
                encoder.dispose()
                offscreenRenderer.dispose()
                return
            }

            const fps = this.recordingFps
            const fixedDt = 1 / fps
            const totalFrames = fps * this.recordingDuration
            const gl = offscreenRenderer.getContext()
            const pixelBuffer = new Uint8Array(width * height * 4)
            const lut = this.getLut()

            // Warm-up frames for trail accumulation (not captured)
            if (exportAfterimage.enabled) {
                const warmupFrames = fps
                this.updateUI('Warming up trails...', 0)
                for (let i = 0; i < warmupFrames; i++) {
                    this.particleSystem.update(fixedDt, lut)
                    offscreenComposer.render()
                    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
                }
            }

            // Frame capture loop
            for (let i = 0; i < totalFrames; i++) {
                if (!this.isExporting) break

                this.particleSystem.update(fixedDt, lut)
                offscreenComposer.render()

                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer)
                encoder.addFrame(new Uint8Array(pixelBuffer))

                const pct = ((i + 1) / totalFrames) * 100
                this.updateUI(
                    `Rendering frame ${i + 1} / ${totalFrames}...`, pct,
                )

                if (i % 5 === 0) {
                    await new Promise(r => setTimeout(r, 0))
                }
            }

            if (!this.isExporting) {
                encoder.dispose()
                offscreenRenderer.dispose()
                this.updateUI('Export cancelled.')
                setTimeout(() => {
                    if (this.recordStatus) this.recordStatus.style.display = 'none'
                }, 3000)
                return
            }

            // Encode
            this.updateUI('Encoding MP4...', 100)
            const blob = await encoder.finalize(width, height, fps, this.exportCrf)

            // Download
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `luminar-${width}x${height}-${Date.now()}.mp4`
            a.click()
            URL.revokeObjectURL(url)

            this.updateUI('Export complete! Download started.')
            setTimeout(() => {
                if (this.recordStatus) this.recordStatus.style.display = 'none'
            }, 3000)

            // Cleanup
            offscreenRenderer.dispose()
            encoder.dispose()

        } catch (error) {
            console.error('Export failed:', error)
            this.updateUI(
                `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            )
        } finally {
            this.isExporting = false
            this.params.paused = wasPaused
            this.resetUI()
        }
    }
}
