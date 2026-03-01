import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

export class FFmpegEncoder {
    private ffmpeg: FFmpeg
    private frames: Uint8Array[] = []
    private initialized = false

    constructor() {
        this.ffmpeg = new FFmpeg()
    }

    async init(): Promise<void> {
        if (this.initialized) return

        this.ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message)
        })

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        })

        this.initialized = true
    }

    addFrame(pixels: Uint8Array): void {
        // Collect frames in JS memory — avoids FS pattern matching issues
        this.frames.push(pixels)
    }

    async finalize(
        width: number, height: number, fps: number, crf: number,
    ): Promise<Blob> {
        const frameSize = width * height * 4
        const totalSize = this.frames.length * frameSize

        // Concatenate all frames into a single raw video stream
        const concat = new Uint8Array(totalSize)
        for (let i = 0; i < this.frames.length; i++) {
            concat.set(this.frames[i], i * frameSize)
        }
        this.frames = [] // Free JS-side frame memory

        // Write the single concatenated file to the virtual FS
        await this.ffmpeg.writeFile('input.raw', concat)

        // Encode: FFmpeg reads the continuous stream (no %05d pattern needed)
        await this.ffmpeg.exec([
            '-f', 'rawvideo',
            '-pix_fmt', 'rgba',
            '-s', `${width}x${height}`,
            '-r', String(fps),
            '-i', 'input.raw',
            '-vf', 'vflip',
            '-c:v', 'libx264',
            '-crf', String(crf),
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            'output.mp4',
        ])

        const data = await this.ffmpeg.readFile('output.mp4')
        const raw = data instanceof Uint8Array
            ? data
            : new TextEncoder().encode(data as string)
        const ab = new ArrayBuffer(raw.byteLength)
        new Uint8Array(ab).set(raw)
        const blob = new Blob([ab], { type: 'video/mp4' })

        // Cleanup virtual FS
        try { await this.ffmpeg.deleteFile('input.raw') } catch { /* ignore */ }
        try { await this.ffmpeg.deleteFile('output.mp4') } catch { /* ignore */ }

        return blob
    }

    dispose(): void {
        this.frames = []
        this.ffmpeg.terminate()
    }
}
