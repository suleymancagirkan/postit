import React, { useState, useRef } from "react";

export const DOODLE_PENS = [
  {
    id: "ink",
    label: "Mürekkep Kalem",
    color: "#1E293B",
    width: 2.4,
    opacity: 0.9,
    swatchBg: "bg-[#1E293B]",
  },
  {
    id: "red",
    label: "Kırmızı Kalem",
    color: "#E11D48",
    width: 2.6,
    opacity: 0.92,
    swatchBg: "bg-[#E11D48]",
  },
  {
    id: "highlighter",
    label: "Fosforlu Kalem",
    color: "#F59E0B",
    width: 10,
    opacity: 0.34,
    swatchBg: "bg-[#F59E0B]",
  },
];

/**
 * Converts an array of normalized [0..1000] points into a smooth SVG quadratic Bezier path.
 */
function pointsToSmoothSvgPath(points = []) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${x} ${y} L ${x + 0.5} ${y + 0.5}`;
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = ((points[i][0] + points[i + 1][0]) / 2).toFixed(1);
    const yc = ((points[i][1] + points[i + 1][1]) / 2).toFixed(1);
    d += ` Q ${points[i][0]} ${points[i][1]}, ${xc} ${yc}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

/**
 * Vector SVG Freehand Drawing / Doodle Layer
 * - Stores coordinates normalized to a 1000x1000 viewBox so drawings scale cleanly
 *   when the Post-it card is resized between 210px and 340px.
 */
export default function DoodleCanvas({
  strokes = [],
  isDrawingMode = false,
  activePenId = "ink",
  onChangeStrokes,
}) {
  const [liveStroke, setLiveStroke] = useState(null);
  const svgRef = useRef(null);

  const activePen =
    DOODLE_PENS.find((p) => p.id === activePenId) || DOODLE_PENS[0];

  const getNormalizedPoint = (e) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return [500, 500];
    const nx = Math.max(
      0,
      Math.min(1000, Math.round(((e.clientX - rect.left) / rect.width) * 1000))
    );
    const ny = Math.max(
      0,
      Math.min(1000, Math.round(((e.clientY - rect.top) / rect.height) * 1000))
    );
    return [nx, ny];
  };

  const handlePointerDown = (e) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const pt = getNormalizedPoint(e);
    setLiveStroke({
      color: activePen.color,
      width: activePen.width * 4.2,
      opacity: activePen.opacity,
      points: [pt],
    });
  };

  const handlePointerMove = (e) => {
    if (!isDrawingMode || !liveStroke) return;
    e.preventDefault();
    e.stopPropagation();

    const pt = getNormalizedPoint(e);
    setLiveStroke((prev) => {
      if (!prev) return null;
      const last = prev.points[prev.points.length - 1];
      if (last && Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 6) {
        return prev;
      }
      return {
        ...prev,
        points: [...prev.points, pt],
      };
    });
  };

  const handlePointerUp = (e) => {
    if (!isDrawingMode || !liveStroke) return;
    e.preventDefault();
    e.stopPropagation();

    const completed = liveStroke;
    setLiveStroke(null);
    onChangeStrokes?.([...(Array.isArray(strokes) ? strokes : []), completed]);
  };

  const allStrokes = liveStroke
    ? [...(Array.isArray(strokes) ? strokes : []), liveStroke]
    : Array.isArray(strokes)
    ? strokes
    : [];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      data-no-drag={isDrawingMode ? "true" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute inset-0 w-full h-full z-20 ${
        isDrawingMode
          ? "pointer-events-auto cursor-crosshair"
          : "pointer-events-none"
      }`}
    >
      {allStrokes.map((s, idx) => (
        <path
          key={idx}
          d={pointsToSmoothSvgPath(s.points)}
          fill="none"
          stroke={s.color || "#1E293B"}
          strokeWidth={s.width || 10}
          strokeOpacity={s.opacity ?? 0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
