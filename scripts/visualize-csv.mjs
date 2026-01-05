#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

// Inline CSV parser to avoid module resolution issues
function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean)
    const rows = []
    let skippedHeader = false

    for (const line of lines) {
        const parts = line.split(/[,\s]+/).filter(Boolean)
        if (parts.length < 4) continue

        const [x, y, dx, dy] = parts.map(Number)
        if ([x, y, dx, dy].some((n) => Number.isNaN(n))) {
            if (!skippedHeader && rows.length === 0) {
                skippedHeader = true
                console.log('skipping header line:', line.substring(0, 60))
            }
            continue
        }
        rows.push({ x, y, dx, dy })
    }

    return rows
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

function parseArgs() {
    const args = process.argv.slice(2)
    const out = { file: null, port: 5173, host: '0.0.0.0', preview: false }
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]
        if (arg === '--file' || arg === '-f') {
            out.file = args[++i]
        } else if (arg === '--port' || arg === '-p') {
            out.port = Number(args[++i]) || out.port
        } else if (arg === '--host') {
            out.host = args[++i] || out.host
        } else if (arg === '--preview') {
            out.preview = true
        }
    }
    return out
}

function writeFieldJson(rows) {
    const target = resolve(projectRoot, 'public', 'vector-field.json')
    writeFileSync(target, JSON.stringify(rows, null, 2), 'utf8')
    console.log(`wrote ${rows.length} vectors to ${target}`)
}

function runServer({ port, host, preview }) {
    const cmd = 'npm'
    const args = preview
        ? ['run', 'build-and-preview', '--', '--host', host, '--port', String(port)]
        : ['run', 'dev', '--', '--host', host, '--port', String(port)]
    console.log(`starting ${preview ? 'preview' : 'dev'} server on http://${host}:${port}`)
    const child = spawn(cmd, args, {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env,
    })
    child.on('exit', (code) => process.exit(code ?? 0))
}

function main() {
    const { file, port, host, preview } = parseArgs()
    if (!file) {
        console.error('Usage: npm run visualize:csv -- --file data.csv [--port 5173] [--host 0.0.0.0] [--preview]')
        process.exit(1)
    }
    const resolved = resolve(process.cwd(), file)
    if (!existsSync(resolved)) {
        console.error(`File not found: ${resolved}`)
        process.exit(1)
    }
    const text = readFileSync(resolved, 'utf8')
    const rows = parseCsv(text)
    if (rows.length === 0) {
        console.error('Parsed 0 rows; ensure CSV has x,y,dx,dy columns (header optional)')
        process.exit(1)
    }
    writeFieldJson(rows)
    runServer({ port, host, preview })
}

main()
