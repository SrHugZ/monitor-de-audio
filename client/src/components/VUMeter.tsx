import { useMemo } from "react";

interface VUMeterProps {
  level: number; // -60 to 0 dB
  height?: number;
  segments?: number;
  orientation?: "vertical" | "horizontal";
  showPeak?: boolean;
  className?: string;
}

function getSegmentClass(segmentIndex: number, totalSegments: number, active: boolean): string {
  if (!active) return "vu-segment-off";
  const pct = segmentIndex / totalSegments;
  if (pct >= 0.9) return "vu-segment-red";
  if (pct >= 0.75) return "vu-segment-orange";
  if (pct >= 0.6) return "vu-segment-yellow";
  return "vu-segment-green";
}

export default function VUMeter({
  level,
  height = 80,
  segments = 20,
  orientation = "vertical",
  className = "",
}: VUMeterProps) {
  // Converte dB para índice de segmento ativo
  const activeSegments = useMemo(() => {
    if (level <= -60) return 0;
    if (level >= 0) return segments;
    // Mapeamento linear de -60dB a 0dB
    return Math.round(((level + 60) / 60) * segments);
  }, [level, segments]);

  if (orientation === "horizontal") {
    return (
      <div
        className={`flex flex-row gap-[1px] ${className}`}
        style={{ width: height, height: 8 }}
        title={`${level.toFixed(1)} dB`}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-[1px] transition-colors duration-50 ${getSegmentClass(i, segments, i < activeSegments)}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col-reverse gap-[1px] ${className}`}
      style={{ height, width: 8 }}
      title={`${level.toFixed(1)} dB`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[1px] transition-colors duration-50 ${getSegmentClass(i, segments, i < activeSegments)}`}
        />
      ))}
    </div>
  );
}

// Versão dupla (stereo) para canais estéreo
export function StereoVUMeter({
  levelL,
  levelR,
  height = 80,
  segments = 20,
  className = "",
}: {
  levelL: number;
  levelR: number;
  height?: number;
  segments?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-row gap-[2px] ${className}`}>
      <VUMeter level={levelL} height={height} segments={segments} />
      <VUMeter level={levelR} height={height} segments={segments} />
    </div>
  );
}
