import { WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export class RecordingManager {
    private mediaRecorder: MediaRecorder | null = null
    private recordedChunks: Blob[] = []
    private isRecording = false
    private recordingStartTime = 0
    private recordingDuration = 5
    private recordingResolution: 'current' | '1080p' | '1440p' | '4k' = 'current'
    private originalCanvasSize: { width: number; height: number } | null = null
    private recordButton: HTMLButtonElement | null = null
    private recordStatus: HTMLDivElement | null = null
    private renderer: WebGLRenderer
    private composer: EffectComposer
    private bloomPass: UnrealBloomPass
    private onResize: () => void

    private setRenderSize(width: number, height: number) {
        this.renderer.setSize(width, height, false)
        this.composer.setSize(width, height)
        this.bloomPass.setSize(width, height)
    }

    private restoreRenderSize() {
        if (!this.originalCanvasSize) return
        const { width, height } = this.originalCanvasSize
        this.setRenderSize(width, height)
        this.originalCanvasSize = null
        this.onResize()
    }

    constructor(
        renderer: WebGLRenderer,
        composer: EffectComposer,
        bloomPass: UnrealBloomPass,
        onResize: () => void,
    ) {
        this.renderer = renderer
        this.composer = composer
        this.bloomPass = bloomPass
        this.onResize = onResize
    }

    createControls(container: HTMLElement) {
        const recordingSection = document.createElement('div')
        recordingSection.className = 'controls__section'
        recordingSection.innerHTML = '<div class="controls__subtitle">Export (WebM)</div>'

        // Resolution selector
        const resolutionRow = document.createElement('label')
        resolutionRow.className = 'controls__row'
        const resolutionLabel = document.createElement('span')
        resolutionLabel.textContent = 'Resolution'
        const resolutionSelect = document.createElement('select')
        resolutionSelect.className = 'controls__select'
        resolutionSelect.innerHTML = '<option value="current">Current window</option><option value="1080p">1080p (Full HD)</option><option value="1440p">1440p (2K)</option><option value="4k">4K (Ultra HD)</option>'
        resolutionSelect.value = this.recordingResolution
        resolutionSelect.addEventListener('change', (e) => {
            this.recordingResolution = (e.target as HTMLSelectElement).value as typeof this.recordingResolution
        })
        resolutionRow.appendChild(resolutionLabel)
        resolutionRow.appendChild(resolutionSelect)
        recordingSection.appendChild(resolutionRow)

        // Duration selector
        const durationRow = document.createElement('label')
        durationRow.className = 'controls__row'
        const durationLabel = document.createElement('span')
        durationLabel.textContent = 'Duration'
        const durationSelect = document.createElement('select')
        durationSelect.className = 'controls__select'
        durationSelect.innerHTML = '<option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option>'
        durationSelect.value = String(this.recordingDuration)
        durationSelect.addEventListener('change', (e) => {
            this.recordingDuration = parseInt((e.target as HTMLSelectElement).value)
        })
        durationRow.appendChild(durationLabel)
        durationRow.appendChild(durationSelect)
        recordingSection.appendChild(durationRow)

        // Record button
        this.recordButton = document.createElement('button')
        this.recordButton.type = 'button'
        this.recordButton.className = 'controls__button controls__button--record'
        this.recordButton.textContent = '⏺ Start recording'
        this.recordButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stop()
            } else {
                this.start()
            }
        })
        recordingSection.appendChild(this.recordButton)

        // Status
        this.recordStatus = document.createElement('div')
        this.recordStatus.className = 'controls__status'
        this.recordStatus.style.display = 'none'
        recordingSection.appendChild(this.recordStatus)

        container.appendChild(recordingSection)
    }

    update() {
        if (this.isRecording) {
            const elapsed = (performance.now() - this.recordingStartTime) / 1000
            this.updateStatus(elapsed)
            if (elapsed >= this.recordingDuration) {
                this.stop()
            }
        }
    }

    private start() {
        if (this.isRecording) return

        try {
            const canvas = this.renderer.domElement

            let recordWidth: number, recordHeight: number
            const currentAspect = canvas.width / canvas.height

            if (this.recordingResolution === 'current') {
                recordWidth = canvas.width
                recordHeight = canvas.height
            } else {
                this.originalCanvasSize = { width: canvas.width, height: canvas.height }

                switch (this.recordingResolution) {
                    case '1080p':
                        recordHeight = 1080
                        recordWidth = Math.round(recordHeight * currentAspect)
                        break
                    case '1440p':
                        recordHeight = 1440
                        recordWidth = Math.round(recordHeight * currentAspect)
                        break
                    case '4k':
                        recordHeight = 2160
                        recordWidth = Math.round(recordHeight * currentAspect)
                        break
                }

                this.setRenderSize(recordWidth, recordHeight)
            }

            const stream = canvas.captureStream(60)
            const pixelCount = recordWidth * recordHeight
            const bitrate = Math.min(25000000, Math.max(8000000, pixelCount * 4))

            this.recordedChunks = []
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: bitrate,
            })

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data)
                }
            }

            this.mediaRecorder.onstop = () => {
                this.restoreRenderSize()

                const blob = new Blob(this.recordedChunks, { type: 'video/webm' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `luminar-${recordWidth}x${recordHeight}-${Date.now()}.webm`
                a.click()
                URL.revokeObjectURL(url)

                if (this.recordStatus) {
                    this.recordStatus.textContent = 'Recording complete! Download started.'
                    setTimeout(() => {
                        if (this.recordStatus) this.recordStatus.style.display = 'none'
                    }, 3000)
                }
            }

            this.mediaRecorder.start()
            this.isRecording = true
            this.recordingStartTime = performance.now()

            if (this.recordButton) {
                this.recordButton.textContent = '⏹ Stop recording'
                this.recordButton.style.opacity = '1'
            }
            if (this.recordStatus) {
                this.recordStatus.style.display = 'block'
                this.recordStatus.textContent = `Recording at ${recordWidth}x${recordHeight} (${(bitrate / 1000000).toFixed(0)} Mbps): 0.0s / ${this.recordingDuration}s`
            }
        } catch (error) {
            console.error('Failed to start recording:', error)
            this.restoreRenderSize()
            if (this.recordStatus) {
                this.recordStatus.style.display = 'block'
                this.recordStatus.textContent = 'Recording not supported in this browser.'
            }
        }
    }

    private stop() {
        if (!this.isRecording || !this.mediaRecorder) return

        this.isRecording = false
        this.mediaRecorder.stop()
        this.mediaRecorder = null

        if (this.recordButton) {
            this.recordButton.textContent = '▶ Start recording'
            this.recordButton.style.opacity = '1'
        }
    }

    private updateStatus(elapsed: number) {
        if (this.recordStatus) {
            const current = elapsed.toFixed(1)
            const canvas = this.renderer.domElement
            const bitrate = Math.min(25000000, Math.max(8000000, canvas.width * canvas.height * 4))
            this.recordStatus.textContent = `Recording at ${canvas.width}x${canvas.height} (${(bitrate / 1000000).toFixed(0)} Mbps): ${current}s / ${this.recordingDuration}s`
        }
    }
}
