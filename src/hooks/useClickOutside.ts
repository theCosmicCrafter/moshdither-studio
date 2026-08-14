import { useEffect, useRef } from "react";

/**
 * Closes a menu/popover when a mousedown lands outside the returned ref's
 * element. Only listens while `isOpen` is true. `onClose` is stashed in a
 * ref rather than the effect's dependency array so callers can pass an
 * inline closure without re-subscribing the listener on every render.
 */
export function useClickOutside<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return ref;
}
