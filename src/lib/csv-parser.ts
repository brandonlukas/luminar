export type VectorDatum = { x: number; y: number; dx: number; dy: number }

export function parseCsv(text: string): VectorDatum[] {
    const lines = text.split(/\r?\n/).filter(Boolean)
    const rows: VectorDatum[] = []
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
