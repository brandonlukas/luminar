#!/usr/bin/env node
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import sirv from 'sirv'
import open from 'open'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')
const distPath = resolve(projectRoot, 'dist')

function parseArgs() {
    const args = process.argv.slice(2)
    const out = { port: 5173, host: '0.0.0.0' }

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (arg === '--port' || arg === '-p') {
            out.port = Number(args[++i]) || out.port
        } else if (arg === '--host') {
            out.host = args[++i] || out.host
        }
    }
    return out
}

function main() {
    const { port, host } = parseArgs()
    const serve = sirv(distPath, { gzip: true, etag: true })

    const server = http.createServer((req, res) => {
        serve(req, res, () => {
            // If no file found, serve index.html (SPA routing)
            if (req.url !== '/' && !req.url.includes('.')) {
                req.url = '/'
                serve(req, res)
            } else {
                res.statusCode = 404
                res.end('Not found')
            }
        })
    })

    server.listen(port, host, () => {
        const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`
        console.log(`🚀 Launching luminar on ${url}`)
        console.log('📂 Drag & drop CSV files into the browser to visualize')
        console.log('')
        // Open browser on localhost (not 0.0.0.0)
        if (host === '0.0.0.0' || host === 'localhost') {
            open(`http://localhost:${port}`).catch(() => { })
        }
    })

    process.on('SIGINT', () => {
        server.close(() => process.exit(0))
    })
}

main()
