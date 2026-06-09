/**
 * EventBus — Decoupled component communication.
 *
 * Based on glsl-playground/src/eventBus.js
 * Enables hot-reloading shaders, texture events, and cross-component
 * messaging without tight coupling.
 */

export type EventHandler<T = unknown> = (data: T) => void;

export class EventBus {
  private listeners: Map<string, Set<EventHandler>>;

  constructor() {
    this.listeners = new Map();
  }

  on<T>(event: string, cb: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb as EventHandler);

    // Return unsubscribe function
    return () => this.off(event, cb);
  }

  off<T>(event: string, cb: EventHandler<T>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.delete(cb as EventHandler);
    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<T>(event: string, data?: T): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const cb of handlers) {
      try {
        cb(data);
      } catch (err) {
        console.error(`EventBus error in "${event}" handler:`, err);
      }
    }
  }

  once<T>(event: string, cb: EventHandler<T>): () => void {
    const wrapped = (data: T) => {
      this.off(event, wrapped as EventHandler);
      cb(data);
    };
    return this.on(event, wrapped as EventHandler);
  }

  hasListeners(event: string): boolean {
    const handlers = this.listeners.get(event);
    return !!handlers && handlers.size > 0;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Global singleton for app-wide events
let _globalBus: EventBus | null = null;

export function getGlobalEventBus(): EventBus {
  if (!_globalBus) {
    _globalBus = new EventBus();
  }
  return _globalBus;
}
