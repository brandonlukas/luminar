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
        // Collect frames in JS memory — the %05d pattern (image2 demuxer) and
        // individual FS writes fail silently with rolldown-vite due to Emscripten
        // FS path resolution differences between writeFile() and exec().
        // Single-file rawvideo input is the only reliable cross-bundler approach.
        this.frames.push(pixels)
    }

    async finalize(
        width: number, height: number, fps: number, crf: number,
        vflip = true,
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
        const args = [
            '-f', 'rawvideo',
            '-pix_fmt', 'rgba',
            '-s', `${width}x${height}`,
            '-r', String(fps),
            '-i', 'input.raw',
        ]
        if (vflip) args.push('-vf', 'vflip')
        args.push(
            '-c:v', 'libx264',
            '-crf', String(crf),
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            'output.mp4',
        )
        await this.ffmpeg.exec(args)

        const data = await this.ffmpeg.readFile('output.mp4')
        const raw = data instanceof Uint8Array
            ? data
            : new TextEncoder().encode(data as string)
        const blob = new Blob([raw.buffer as ArrayBuffer], { type: 'video/mp4' })

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
