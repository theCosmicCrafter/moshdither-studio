import { useEffect, useState } from "react";

/**
 * Debounce a value so that rapid changes (e.g. slider dragging) don't
 * trigger expensive downstream work (WebGL shader recompilation) until
 * the user pauses for `delay` milliseconds.
 *
 * Usage in a slider:
 *   const [localValue, setLocalValue] = useState(currentValue);
 *   const debouncedValue = useDebounce(localValue, 150);
 *   useEffect(() => updateParam(key, debouncedValue), [debouncedValue]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
