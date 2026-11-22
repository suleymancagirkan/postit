import React, { useState, useEffect, useRef } from "react";
import { Scissors } from "lucide-react";
import { clampNoteSize } from "../hooks/useNotesStore";

/**
 * Computes the exact thumbtack collar anchor point at the top-center of a Post-it card.
 */
export function getNoteThumbtackAnchor(note, livePositionsMap = {}) {
  const live = livePositionsMap[note.id];
  const x = live?.x !== undefined ? live.x : note.x;
  const y = live?.y !== undefined ? live.y : note.y;
  const width = live?.width !== undefined ? live.width : clampNoteSize(note.width);
  return {
    x: x + width / 2,
    y: y + 2,
  };
}

/**
 * Builds a quadratic Bezier catenary path between two thumbtack points (x1, y1) and (x2, y2),
 * adding natural gravity sag and an optional damped harmonic twang/pluck offset.
 */
function buildCatenaryPath(x1, y1, x2, y2, extraSagOffset = 0, swayXOffset = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  // Gravity sag: shorter strings have more proportional slack; very long strings pull tauter
  const baseSag = Math.min(135, Math.max(24, 34 + dist * 0.16));
  const totalSag = baseSag + extraSagOffset;

  const midX = (x1 + x2) / 2 + swayXOffset;
  const midY = (y1 + y2) / 2 + totalSag;

  // On a quadratic Bezier B(0.5) = 0.25*P1 + 0.5*C + 0.25*P2
  const actualMidX = 0.25 * x1 + 0.5 * midX + 0.25 * x2;
  const actualMidY = 0.25 * y1 + 0.5 * midY + 0.25 * y2;

  return {
    path: `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`,
    shadowPath: `M ${x1} ${y1 + 6} Q ${midX} ${midY + 18} ${x2} ${y2 + 6}`,
    midX: actualMidX,
    midY: actualMidY,
  };
}

/**
 * 2.5D Detective / Secret Agent Red Yarn Layer
 * - Connects linked Post-it thumbtacks with realistic gravity-sagged braided red yarn.
 * - Plucks / vibrates with damped harmonic physics when a new string is tied or a note moves.
 * - Renders a live stretching red yarn while dragging from any thumbtack to another note.
 */
export default function AgentStringsLayer({
  notes = [],
  visibilityMap = {},
  livePositionsMap = {},
  activeStringDrag = null,
  pluckTimestampMap = {},
  onCutString,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const [hoveredPairKey, setHoveredPairKey] = useState(null);
  const [animTick, setAnimTick] = useState(0);
  const rafRef = useRef(null);

  // Run 60fps animation loop briefly whenever any string was recently plucked/tied (within last 900ms)
  useEffect(() => {
    const timestamps = Object.values(pluckTimestampMap);
    if (timestamps.length === 0) return;

    const now = performance.now();
    const hasActivePluck = timestamps.some((ts) => now - ts < 950);
    if (!hasActivePluck) return;

    const step = () => {
      const currentNow = performance.now();
      const stillVibrating = Object.values(pluckTimestampMap).some(
        (ts) => currentNow - ts < 950
      );
      setAnimTick(currentNow);
      if (stillVibrating) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pluckTimestampMap, animTick]);

  // Build unique undirected pairs of visible linked notes
  const noteById = new Map();
  for (const n of notes) {
    if (!n.inBasket) {
      noteById.set(n.id, n);
    }
  }

  const pairs = [];
  const seenKeys = new Set();

  for (const note of noteById.values()) {
    const isSourceVisible = note.pinnedTarget
      ? visibilityMap[note.id] !== false
      : true;
    if (!isSourceVisible) continue;

    const links = Array.isArray(note.linkedIds) ? note.linkedIds : [];
    for (const targetId of links) {
      const target = noteById.get(targetId);
      if (!target) continue;

      const isTargetVisible = target.pinnedTarget
        ? visibilityMap[target.id] !== false
        : true;
      if (!isTargetVisible) continue;

      const pairKey =
        note.id < target.id
          ? `${note.id}__${target.id}`
          : `${target.id}__${note.id}`;
      if (seenKeys.has(pairKey)) continue;
      seenKeys.add(pairKey);

      pairs.push({
        pairKey,
        source: note,
        target,
      });
    }
  }

  const now = performance.now();

  return (
    <div className="pointer-events-none fixed inset-0 z-[9995] overflow-hidden select-none">
      <svg
        width="100%"
        height="100%"
        className="w-full h-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Braided Crimson Detective Yarn Gradient */}
          <linearGradient id="agentYarnCore" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#991B1B" />
            <stop offset="25%" stopColor="#DC2626" />
            <stop offset="50%" stopColor="#EF4444" />
            <stop offset="75%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>

          {/* Soft Floor Shadow Filter for the Floating Red String */}
          <filter id="yarnShadowBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        {/* 1. Tied Detective Strings between PinnedNotes */}
        {pairs.map(({ pairKey, source, target }) => {
          const p1 = getNoteThumbtackAnchor(source, livePositionsMap);
          const p2 = getNoteThumbtackAnchor(target, livePositionsMap);

          // Compute damped harmonic guitar-string vibration if recently tied/plucked
          const pluckTs = pluckTimestampMap[pairKey] || 0;
          const elapsedSec = (now - pluckTs) / 1000;
          let vibrateY = 0;
          let vibrateX = 0;
          if (elapsedSec >= 0 && elapsedSec < 0.95) {
            const envelope = Math.exp(-elapsedSec * 5.8);
            vibrateY = Math.sin(elapsedSec * 36) * envelope * 26;
            vibrateX = Math.cos(elapsedSec * 28) * envelope * 8;
          }

          const { path, shadowPath, midX, midY } = buildCatenaryPath(
            p1.x,
            p1.y,
            p2.x,
            p2.y,
            vibrateY,
            vibrateX
          );
          const isHovered = hoveredPairKey === pairKey;

          return (
            <g key={pairKey}>
              {/* 3D Floating String Drop Shadow */}
              <path
                d={shadowPath}
                fill="none"
                stroke="rgba(0,0,0,0.34)"
                strokeWidth="3.8"
                strokeLinecap="round"
                filter="url(#yarnShadowBlur)"
              />

              {/* Red Knot Loop around Source Thumbtack Neck */}
              <circle
                cx={p1.x}
                cy={p1.y}
                r="4.2"
                fill="none"
                stroke="#991B1B"
                strokeWidth="2.4"
              />

              {/* Red Knot Loop around Target Thumbtack Neck */}
              <circle
                cx={p2.x}
                cy={p2.y}
                r="4.2"
                fill="none"
                stroke="#991B1B"
                strokeWidth="2.4"
              />

              {/* Main Crimson Yarn Strand */}
              <path
                d={path}
                fill="none"
                stroke={isHovered ? "#F43F5E" : "url(#agentYarnCore)"}
                strokeWidth={isHovered ? "4" : "3.1"}
                strokeLinecap="round"
              />

              {/* Braided Wool Fiber Texture Highlight */}
              <path
                d={path}
                fill="none"
                stroke="#FECDD3"
                strokeWidth="1.1"
                strokeDasharray="4 6"
                strokeOpacity="0.65"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* 2. Live Preview String while dragging from a Thumbtack to connect another Note */}
        {activeStringDrag && (
          <g>
            {(() => {
              const { startX, startY, currentX, currentY, snapTargetAnchor } =
                activeStringDrag;
              const endX = snapTargetAnchor ? snapTargetAnchor.x : currentX;
              const endY = snapTargetAnchor ? snapTargetAnchor.y : currentY;
              const { path, shadowPath } = buildCatenaryPath(
                startX,
                startY,
                endX,
                endY
              );

              return (
                <>
                  <path
                    d={shadowPath}
                    fill="none"
                    stroke="rgba(0,0,0,0.28)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    filter="url(#yarnShadowBlur)"
                  />
                  <circle
                    cx={startX}
                    cy={startY}
                    r="4.5"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2.5"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="#FFE4E6"
                    strokeWidth="1.2"
                    strokeDasharray="4 5"
                    strokeOpacity="0.8"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={endX}
                    cy={endY}
                    r={snapTargetAnchor ? "6.5" : "4"}
                    fill={snapTargetAnchor ? "rgba(239,68,68,0.25)" : "#EF4444"}
                    stroke="#DC2626"
                    strokeWidth="2.2"
                  />
                </>
              );
            })()}
          </g>
        )}
      </svg>

      {/* 3. Interactive Midpoint Scissor Buttons to Cut any Tied String */}
      {pairs.map(({ pairKey, source, target }) => {
        const p1 = getNoteThumbtackAnchor(source, livePositionsMap);
        const p2 = getNoteThumbtackAnchor(target, livePositionsMap);
        const { midX, midY } = buildCatenaryPath(p1.x, p1.y, p2.x, p2.y);
        const isHovered = hoveredPairKey === pairKey;

        return (
          <button
            key={`cut_${pairKey}`}
            type="button"
            data-interactive="true"
            onMouseEnter={() => {
              setHoveredPairKey(pairKey);
              onInteractiveEnter?.();
            }}
            onMouseLeave={() => {
              setHoveredPairKey(null);
              onInteractiveLeave?.();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setHoveredPairKey(null);
              onInteractiveLeave?.();
              onCutString?.(source.id, target.id);
            }}
            style={{
              left: midX,
              top: midY,
              transform: "translate(-50%, -50%)",
            }}
            title="Ajan İpini Kes"
            className={`pointer-events-auto fixed flex items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
              isHovered
                ? "w-7 h-7 bg-neutral-900 text-rose-400 border border-rose-400/60 shadow-lg scale-110 opacity-100"
                : "w-5 h-5 bg-red-700/20 hover:bg-neutral-900 text-transparent hover:text-rose-400 opacity-35 hover:opacity-100"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}
