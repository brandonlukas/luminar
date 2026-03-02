/** Create a collapsible controls section with header + body */
export function createSection(title: string): { section: HTMLDivElement; body: HTMLDivElement } {
    const section = document.createElement('div')
    section.className = 'controls__section'

    const header = document.createElement('div')
    header.className = 'controls__section-header'

    const titleEl = document.createElement('span')
    titleEl.className = 'controls__section-title'
    titleEl.textContent = title

    const arrow = document.createElement('span')
    arrow.className = 'controls__section-arrow'
    arrow.textContent = '\u25BC'

    header.appendChild(titleEl)
    header.appendChild(arrow)

    const body = document.createElement('div')
    body.className = 'controls__section-body'

    header.addEventListener('click', () => {
        section.classList.toggle('controls__section--collapsed')
    })

    section.appendChild(header)
    section.appendChild(body)

    return { section, body }
}

/** Format a number with "k" suffix for thousands */
export function formatCount(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
