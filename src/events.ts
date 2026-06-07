// Tiny typed event bus — the only coupling between game systems.
import type { EventMap } from './types'

type Handler<K extends keyof EventMap> = (e: EventMap[K]) => void

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>()

  on<K extends keyof EventMap>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(fn as Handler<never>)
    return () => set.delete(fn as Handler<never>)
  }

  emit<K extends keyof EventMap>(type: K, e: EventMap[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    for (const fn of set) (fn as Handler<K>)(e)
  }

  /** Drop every subscription (used on full teardown, not on retry). */
  clear(): void {
    this.handlers.clear()
  }
}
