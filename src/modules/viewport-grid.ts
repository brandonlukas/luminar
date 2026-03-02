import { FieldSlot } from './field-slot'
import { defaultSlotParams, MAX_SLOTS } from '../lib/constants'
import type { ParticleParams, SlotFieldData } from '../lib/types'

export interface ViewportGridCallbacks {
    onSlotSelected: (slot: FieldSlot | null) => void
    onSlotCountChanged: (count: number) => void
}

export class ViewportGrid {
    private gridContainer: HTMLDivElement
    private emptyState: HTMLElement
    private slots: (FieldSlot | null)[] = new Array(MAX_SLOTS).fill(null)
    private activeCount = 0
    private selectedSlot: FieldSlot | null = null
    private globalParams: ParticleParams
    private callbacks: ViewportGridCallbacks

    constructor(
        viewport: HTMLElement,
        emptyState: HTMLElement,
        globalParams: ParticleParams,
        callbacks: ViewportGridCallbacks,
    ) {
        this.globalParams = globalParams
        this.callbacks = callbacks
        this.emptyState = emptyState

        this.gridContainer = document.createElement('div')
        this.gridContainer.className = 'slot-grid'
        this.gridContainer.dataset.layout = 'single'
        viewport.insertBefore(this.gridContainer, emptyState)

        this.setupClickHandler()
        this.setupDragRearrange()
    }

    // ── Slot lifecycle ────────────────────────────

    addField(fieldData: SlotFieldData): number {
        const idx = this.slots.findIndex(s => s === null)
        if (idx === -1) return -1

        const slot = new FieldSlot(idx, this.globalParams, { ...defaultSlotParams })
        slot.loadField(fieldData)
        this.slots[idx] = slot

        this.gridContainer.appendChild(slot.container)
        this.activeCount++
        this.updateLayout()

        // Resize after layout settles
        requestAnimationFrame(() => slot.resize())

        this.selectSlot(slot)
        this.emptyState.classList.add('empty-state--hidden')

        return idx
    }

    removeSlot(index: number): void {
        const slot = this.slots[index]
        if (!slot) return

        const wasSelected = this.selectedSlot === slot
        slot.dispose()
        this.slots[index] = null
        this.activeCount--

        if (wasSelected) {
            const next = this.getActiveSlots()[0] ?? null
            this.selectSlot(next)
        }

        this.updateLayout()

        if (this.activeCount === 0) {
            this.emptyState.classList.remove('empty-state--hidden')
        }
    }

    // ── Selection ─────────────────────────────────

    selectSlot(slot: FieldSlot | null): void {
        if (this.selectedSlot) {
            this.selectedSlot.selected = false
        }
        this.selectedSlot = slot
        if (slot) {
            slot.selected = true
        }
        this.callbacks.onSlotSelected(slot)
    }

    getSelectedSlot(): FieldSlot | null {
        return this.selectedSlot
    }

    // ── Swap (drag-to-rearrange) ──────────────────

    private swapSlots(a: number, b: number): void {
        const tmp = this.slots[a]
        this.slots[a] = this.slots[b]
        this.slots[b] = tmp
        if (this.slots[a]) {
            this.slots[a]!.index = a
            this.slots[a]!.container.dataset.slotIndex = String(a)
        }
        if (this.slots[b]) {
            this.slots[b]!.index = b
            this.slots[b]!.container.dataset.slotIndex = String(b)
        }
        this.rebuildDOM()
        requestAnimationFrame(() => this.resizeAll())
    }

    // ── Layout ────────────────────────────────────

    private updateLayout(): void {
        const mode = this.activeCount <= 1 ? 'single' : 'dual'
        this.gridContainer.dataset.layout = mode
        this.rebuildDOM()
        requestAnimationFrame(() => this.resizeAll())
        this.callbacks.onSlotCountChanged(this.activeCount)
    }

    private rebuildDOM(): void {
        // Detach all without destroying
        while (this.gridContainer.firstChild) {
            this.gridContainer.removeChild(this.gridContainer.firstChild)
        }
        for (const slot of this.slots) {
            if (slot) {
                this.gridContainer.appendChild(slot.container)
            }
        }
    }

    // ── Queries ───────────────────────────────────

    getActiveSlots(): FieldSlot[] {
        return this.slots.filter((s): s is FieldSlot => s !== null)
    }

    isFull(): boolean {
        return this.activeCount >= MAX_SLOTS
    }

    getActiveCount(): number {
        return this.activeCount
    }

    // ── Global param propagation ──────────────────

    syncGlobalParams(): void {
        for (const slot of this.getActiveSlots()) {
            slot.syncGlobalParams(this.globalParams)
        }
    }

    // ── Animation ─────────────────────────────────

    updateAll(dt: number): void {
        for (const slot of this.getActiveSlots()) {
            slot.update(dt)
        }
    }

    renderAll(): void {
        for (const slot of this.getActiveSlots()) {
            slot.render()
        }
    }

    resizeAll(): void {
        for (const slot of this.getActiveSlots()) {
            slot.resize()
        }
    }

    // ── Event handlers ────────────────────────────

    private setupClickHandler(): void {
        this.gridContainer.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
            if (!target) return
            const index = parseInt(target.dataset.slotIndex ?? '-1', 10)
            if (index >= 0 && index < MAX_SLOTS && this.slots[index]) {
                this.selectSlot(this.slots[index])
            }
        })
    }

    private setupDragRearrange(): void {
        let draggedIndex: number | null = null

        this.gridContainer.addEventListener('dragstart', (e) => {
            if (this.activeCount < 2) {
                e.preventDefault()
                return
            }
            const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
            if (!target) return
            draggedIndex = parseInt(target.dataset.slotIndex ?? '-1', 10)
            target.classList.add('slot--dragging')
            e.dataTransfer?.setData('text/plain', String(draggedIndex))
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        })

        this.gridContainer.addEventListener('dragover', (e) => {
            // Only intercept when a slot drag is active
            if (draggedIndex === null) return
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
            const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
            if (target) target.classList.add('slot--dragover')
        })

        this.gridContainer.addEventListener('dragleave', (e) => {
            const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
            if (target) target.classList.remove('slot--dragover')
        })

        this.gridContainer.addEventListener('drop', (e) => {
            const target = (e.target as HTMLElement).closest('.slot') as HTMLElement | null
            // Only intercept drops that are slot rearranges
            if (!target || draggedIndex === null) return
            e.preventDefault()
            e.stopPropagation()
            target.classList.remove('slot--dragover')
            const dropIndex = parseInt(target.dataset.slotIndex ?? '-1', 10)
            if (dropIndex >= 0 && dropIndex !== draggedIndex) {
                this.swapSlots(draggedIndex, dropIndex)
            }
        })

        this.gridContainer.addEventListener('dragend', () => {
            draggedIndex = null
            this.gridContainer.querySelectorAll('.slot--dragging').forEach(el =>
                el.classList.remove('slot--dragging'),
            )
        })
    }
}
