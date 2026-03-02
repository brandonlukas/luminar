import { OrthographicCamera, Vector2, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'
import { FFmpegEncoder } from './ffmpeg-encoder'
import { VIEW_SIZE } from '../lib/constants'
import type { ViewportGrid } from './viewport-grid'
import type { FieldSlot } from './field-slot'
import type { ParticleParams } from '../lib/types'

interface SlotExportPipeline {
    slot: FieldSlot
    renderer: WebGLRenderer
    composer: EffectComposer
    afterimagePass: AfterimagePass
    region: { x: number; y: number; w: number; h: number }
}

export class RecordingManager {
    private isExporting = false
    private exportCrf = 8
    private recordingDuration = 15
    private recordingResolution: 'current' | '1080p' | '4k' = 'current'
    private recordingFps = 30

    private recordButton: HTMLButtonElement | null = null
    private recordStatus: HTMLDivElement | null = null
    private progressBar: HTMLProgressElement | null = null

    private grid: ViewportGrid
    private params: ParticleParams
    private getAspectRatio: () => '16:9' | '4:3'

    constructor(
        grid: ViewportGrid,
        params: ParticleParams,
        getAspectRatio: () => '16:9' | '4:3',
    ) {
        this.grid = grid
        this.params = params
        this.getAspectRatio = getAspectRatio
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
        const ratio = this.getAspectRatio()
        const ar = ratio === '4:3' ? 4 / 3 : 16 / 9

        let w: number, h: number
        switch (this.recordingResolution) {
            case '1080p':
                w = Math.round(1080 * ar); h = 1080; break
            case '4k':
                w = Math.round(2160 * ar); h = 2160; break
            case 'current':
            default: {
                // Use first active slot's canvas size, or a fallback
                const slots = this.grid.getActiveSlots()
                if (slots.length > 0) {
                    const size = slots[0].getRendererSize()
                    // Scale up for multi-slot (side-by-side)
                    w = size.width * slots.length
                    h = size.height
                } else {
                    w = 1920; h = 1080
                }
            }
        }
        // Ensure even dimensions (required for yuv420p)
        return { width: w - (w % 2), height: h - (h % 2) }
    }

    private computeSlotRegions(
        count: number,
        totalW: number,
        totalH: number,
    ): Array<{ x: number; y: number; w: number; h: number }> {
        const gap = 2
        if (count <= 1) {
            return [{ x: 0, y: 0, w: totalW, h: totalH }]
        }
        // Side by side
        const halfW = Math.floor((totalW - gap) / 2)
        return [
            { x: 0, y: 0, w: halfW, h: totalH },
            { x: halfW + gap, y: 0, w: totalW - halfW - gap, h: totalH },
        ]
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
        const slots = this.grid.getActiveSlots()
        if (slots.length === 0) return

        this.isExporting = true
        const wasPaused = this.params.paused
        this.params.paused = true

        if (this.recordButton) {
            this.recordButton.textContent = 'Cancel export'
        }

        const pipelines: SlotExportPipeline[] = []

        try {
            const { width, height } = this.getExportDimensions()
            const regions = this.computeSlotRegions(slots.length, width, height)

            // Create per-slot offscreen renderers
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i]
                const region = regions[i]

                const offCanvas = document.createElement('canvas')
                offCanvas.width = region.w
                offCanvas.height = region.h

                const offRenderer = new WebGLRenderer({
                    canvas: offCanvas,
                    preserveDrawingBuffer: true,
                    antialias: false,
                    alpha: false,
                })
                offRenderer.setSize(region.w, region.h, false)

                const aspect = region.w / region.h
                const exportCamera = new OrthographicCamera(
                    -VIEW_SIZE * aspect, VIEW_SIZE * aspect,
                    VIEW_SIZE, -VIEW_SIZE,
                    0.1, 10,
                )
                exportCamera.position.z = 2

                const offComposer = new EffectComposer(offRenderer)
                offComposer.addPass(new RenderPass(slot.scene, exportCamera))
                offComposer.addPass(new UnrealBloomPass(
                    new Vector2(region.w, region.h),
                    slot.bloomPass.strength,
                    slot.bloomPass.radius,
                    slot.bloomPass.threshold,
                ))
                const exportAfterimage = new AfterimagePass(
                    slot.afterimagePass.uniforms['damp'].value,
                )
                exportAfterimage.enabled = slot.afterimagePass.enabled
                offComposer.addPass(exportAfterimage)

                pipelines.push({ slot, renderer: offRenderer, composer: offComposer, afterimagePass: exportAfterimage, region })
            }

            // Composite canvas (2D)
            const compositeCanvas = document.createElement('canvas')
            compositeCanvas.width = width
            compositeCanvas.height = height
            const ctx = compositeCanvas.getContext('2d')!

            // Init FFmpeg encoder
            this.updateUI('Loading encoder...')
            const encoder = new FFmpegEncoder()
            await encoder.init()

            if (!this.isExporting) {
                encoder.dispose()
                for (const p of pipelines) p.renderer.dispose()
                return
            }

            const fps = this.recordingFps
            const fixedDt = 1 / fps
            const totalFrames = fps * this.recordingDuration

            // Warm-up frames for trail accumulation
            const hasTrails = pipelines.some(p => p.afterimagePass.enabled)
            if (hasTrails) {
                const warmupFrames = fps
                this.updateUI('Warming up trails...', 0)
                for (let i = 0; i < warmupFrames; i++) {
                    for (const p of pipelines) {
                        p.slot.update(fixedDt)
                        p.composer.render()
                    }
                    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
                }
            }

            // Frame capture loop
            for (let i = 0; i < totalFrames; i++) {
                if (!this.isExporting) break

                // Update all particle systems
                for (const p of pipelines) {
                    p.slot.update(fixedDt)
                }

                // Render + composite
                ctx.fillStyle = this.params.backgroundColor
                ctx.fillRect(0, 0, width, height)

                for (const p of pipelines) {
                    p.composer.render()
                    ctx.drawImage(p.renderer.domElement, p.region.x, p.region.y, p.region.w, p.region.h)
                }

                // Read pixels from composite
                const imageData = ctx.getImageData(0, 0, width, height)
                encoder.addFrame(new Uint8Array(imageData.data.buffer))

                const pct = ((i + 1) / totalFrames) * 100
                this.updateUI(`Rendering frame ${i + 1} / ${totalFrames}...`, pct)

                if (i % 5 === 0) {
                    await new Promise(r => setTimeout(r, 0))
                }
            }

            if (!this.isExporting) {
                encoder.dispose()
                for (const p of pipelines) p.renderer.dispose()
                this.updateUI('Export cancelled.')
                setTimeout(() => {
                    if (this.recordStatus) this.recordStatus.style.display = 'none'
                }, 3000)
                return
            }

            // Encode
            this.updateUI('Encoding MP4...', 100)
            // vflip=false: pixels come from 2D canvas (already top-to-bottom)
            const blob = await encoder.finalize(width, height, fps, this.exportCrf, false)

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
            for (const p of pipelines) p.renderer.dispose()
            encoder.dispose()

        } catch (error) {
            console.error('Export failed:', error)
            this.updateUI(
                `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            )
            for (const p of pipelines) p.renderer.dispose()
        } finally {
            this.isExporting = false
            this.params.paused = wasPaused
            this.resetUI()
        }
    }
}
