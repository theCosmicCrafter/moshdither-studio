/* eslint-disable react-hooks/refs */
import * as React from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { ControlGroup } from "./ControlGroup";

interface DebouncedControlGroupProps {
  label: string;
  value: number | string;
  onChange: (val: number | string) => void;
  defaultValue?: number | string;
  type?: "slider" | "input" | "number";
  min?: number;
  max?: number;
  step?: number;
  style?: React.CSSProperties;
  /** Delay in ms before onChange fires. Default 150. */
  delay?: number;
}

/**
 * ControlGroup wrapper that debounces the onChange callback.
 *
 * The slider/input updates instantly for visual feedback, but the
 * expensive downstream operation (e.g. WebGL shader recompilation)
 * only triggers after the user pauses for `delay` ms.
 *
 * NOTE: This component uses a conditional setState during render to
 * keep local slider state in sync with prop-driven changes (undo/redo,
 * preset load). This is a documented React pattern; see
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
export const DebouncedControlGroup: React.FC<DebouncedControlGroupProps> = ({
  value,
  onChange,
  delay = 150,
  ...props
}) => {
  const [localValue, setLocalValue] = React.useState(value);
  const isInternalChange = React.useRef(false);
  const prevValueRef = React.useRef(value);

  // Keep local slider state in sync with external prop changes via useEffect
  // instead of render-phase setState to prevent dropped inputs.
  React.useEffect(() => {
    if (!isInternalChange.current && value !== prevValueRef.current) {
      setLocalValue(value);
    }
    prevValueRef.current = value;
    isInternalChange.current = false;
  }, [value]);

  const debouncedValue = useDebounce(localValue, delay);

  React.useEffect(() => {
    if (debouncedValue !== value) {
      isInternalChange.current = true;
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, value]);

  return <ControlGroup {...props} value={localValue} onChange={setLocalValue} />;
};
