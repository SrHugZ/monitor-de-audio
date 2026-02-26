import { useCallback, useEffect, useRef, useState } from "react";

interface VerticalFaderProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  height?: number;
  color?: string;
  showValue?: boolean;
  label?: string;
  className?: string;
}

function levelToDb(level: number): number {
  if (level <= 0) return -60;
  if (level >= 1) return 0;
  return 20 * Math.log10(level);
}

export default function VerticalFader({
  value,
  onChange,
  onChangeEnd,
  disabled = false,
  height = 120,
  color = "#22c55e",
  showValue = true,
  label,
  className = "",
}: VerticalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!isDragging.current) {
      setLocalValue(value);
    }
  }, [value]);

  const thumbHeight = 28;
  const trackHeight = height - thumbHeight;
  // Posição do thumb: 0 = bottom (min), trackHeight = top (max)
  const thumbTop = trackHeight - localValue * trackHeight;

  const getValueFromY = useCallback(
    (clientY: number): number => {
      if (!trackRef.current) return localValue;
      const rect = trackRef.current.getBoundingClientRect();
      const relY = clientY - rect.top - thumbHeight / 2;
      const clamped = Math.max(0, Math.min(trackHeight, relY));
      return 1 - clamped / trackHeight;
    },
    [trackHeight, localValue]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const newVal = getValueFromY(e.clientY);
      setLocalValue(newVal);
      onChange(newVal);
    },
    [disabled, getValueFromY, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || disabled) return;
      e.preventDefault();
      const newVal = getValueFromY(e.clientY);
      setLocalValue(newVal);
      onChange(newVal);
    },
    [disabled, getValueFromY, onChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const newVal = getValueFromY(e.clientY);
      setLocalValue(newVal);
      onChangeEnd?.(newVal);
    },
    [getValueFromY, onChangeEnd]
  );

  // Double click para resetar para 0.7 (~-3dB)
  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    const resetVal = 0.7;
    setLocalValue(resetVal);
    onChange(resetVal);
    onChangeEnd?.(resetVal);
  }, [disabled, onChange, onChangeEnd]);

  const dB = levelToDb(localValue);
  const dbText = dB <= -60 ? "-∞" : `${dB.toFixed(1)}`;

  // Gradiente de fill abaixo do thumb
  const fillHeight = (1 - localValue) * trackHeight + thumbHeight / 2;

  return (
    <div className={`flex flex-col items-center gap-1 select-none ${className}`}>
      {label && (
        <span
          className="text-[10px] font-mono font-semibold tracking-wider uppercase truncate max-w-full"
          style={{ color: disabled ? "oklch(0.35 0.01 260)" : "oklch(0.65 0.01 260)" }}
        >
          {label}
        </span>
      )}

      <div
        ref={trackRef}
        className="relative rounded-sm"
        style={{
          width: 20,
          height,
          background: "oklch(0.10 0.005 260)",
          border: "1px solid oklch(0.22 0.01 260)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Linha central */}
        <div
          className="absolute left-1/2 top-0 bottom-0"
          style={{ width: 1, background: "oklch(0.25 0.01 260)", transform: "translateX(-50%)" }}
        />

        {/* Fill abaixo do thumb */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={{
            height: fillHeight,
            background: `${color}22`,
            borderTop: `1px solid ${color}44`,
          }}
        />

        {/* Marcações de escala */}
        {[0.75, 0.5, 0.25].map((mark) => (
          <div
            key={mark}
            className="absolute left-0 right-0"
            style={{
              top: thumbHeight / 2 + (1 - mark) * trackHeight - 0.5,
              height: 1,
              background: "oklch(0.28 0.01 260)",
            }}
          />
        ))}

        {/* Thumb */}
        <div
          className="absolute left-1/2 rounded-sm"
          style={{
            width: 18,
            height: thumbHeight,
            top: thumbTop,
            transform: "translateX(-50%)",
            background: disabled
              ? "oklch(0.25 0.01 260)"
              : `linear-gradient(180deg, oklch(0.42 0.01 260) 0%, oklch(0.32 0.01 260) 45%, oklch(0.28 0.01 260) 50%, oklch(0.32 0.01 260) 55%, oklch(0.42 0.01 260) 100%)`,
            border: `1px solid ${disabled ? "oklch(0.30 0.01 260)" : "oklch(0.50 0.01 260)"}`,
            boxShadow: disabled ? "none" : `0 2px 4px oklch(0.05 0.005 260 / 0.8), inset 0 1px 0 oklch(0.55 0.01 260 / 0.5)`,
            zIndex: 10,
          }}
        >
          {/* Linha central do thumb */}
          <div
            className="absolute left-[20%] right-[20%] top-1/2"
            style={{ height: 1, background: "oklch(0.55 0.01 260)", transform: "translateY(-50%)" }}
          />
        </div>
      </div>

      {showValue && (
        <span
          className="text-[10px] font-mono tabular-nums"
          style={{ color: disabled ? "oklch(0.35 0.01 260)" : color }}
        >
          {dbText}
        </span>
      )}
    </div>
  );
}
