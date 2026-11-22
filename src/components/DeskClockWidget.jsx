import React, { useState, useEffect, useRef, useId } from "react";
import { motion } from "framer-motion";
import { POSTIT_COLORS } from "../hooks/useNotesStore";

const STORAGE_KEY_CLOCK_POS = "postit_desktop_clock_pos_v1";
const STORAGE_KEY_CLOCK_FACE = "postit_desktop_clock_face_v1";

export const DESK_CLOCK_ID = "__desk_clock__";
export const DESK_CLOCK_SIZE = { width: 254, height: 144 };

const TURKISH_DAYS_SHORT = ["PAZ", "PZT", "SAL", "ÇAR", "PER", "CUM", "CMT"];

export function getDefaultClockPosition() {
  if (typeof window === "undefined") return { x: 36, y: 310 };
  return {
    x: 36,
    y: Math.max(280, window.innerHeight - 210),
  };
}

export function getClockThumbtackAnchor(clockPos) {
  return {
    x: clockPos.x + DESK_CLOCK_SIZE.width / 2,
    y: clockPos.y + 8,
  };
}

/**
 * Plays a warm Apple StandBy-inspired marimba/glass chime when a note's @timer finishes.
 */
export function playStandByAlarmChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [
      { freq: 587.33, time: 0 }, // D5
      { freq: 880.0, time: 0.14 }, // A5
      { freq: 1174.66, time: 0.28 }, // D6
      { freq: 1318.51, time: 0.44 }, // E6
    ];

    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      sub.type = "triangle";
      sub.frequency.setValueAtTime(freq * 2, ctx.currentTime + time);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + time + 0.35);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + time);
      sub.start(ctx.currentTime + time);
      osc.stop(ctx.currentTime + time + 0.36);
      sub.stop(ctx.currentTime + time + 0.36);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1100);
  } catch {
    // ignore audio errors
  }
}

export function formatRemainingTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Computes radial ray intersection with a rounded-rectangular StandBy perimeter
 * so the 60 tick marks match Image 1 (iOS StandBy Analog rectangular radial ticks).
 */
function buildStandByPerimeterTicks(width = 230, height = 120) {
  const cx = 127;
  const cy = 72;
  const halfW = width / 2;
  const halfH = height / 2;
  const ticks = [];

  for (let i = 0; i < 60; i++) {
    // Skip ticks right behind the 12, 3, 6, 9 numerals
    if (i === 0 || i === 15 || i === 30 || i === 45) {
      // Keep the cardinal marker lines for 3 and 9, short for 12 and 6
    }

    const angle = (i * 6 * Math.PI) / 180;
    const dx = Math.sin(angle);
    const dy = -Math.cos(angle);

    const tx = Math.abs(dx) > 1e-5 ? halfW / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 1e-5 ? halfH / Math.abs(dy) : Infinity;
    const tOuter = Math.min(tx, ty);

    const isHourTick = i % 5 === 0;
    const isCardinal = i % 15 === 0;

    let innerPull = isHourTick ? 24 : 11;
    if (i === 0 || i === 30) innerPull = 8; // Leave room for 12 and 6 numerals
    if (i === 15 || i === 45) innerPull = 22; // Long horizontal bars outside 3 and 9

    const xOuter = cx + dx * tOuter;
    const yOuter = cy + dy * tOuter;
    const xInner = cx + dx * Math.max(12, tOuter - innerPull);
    const yInner = cy + dy * Math.max(12, tOuter - innerPull);

    ticks.push({
      i,
      x1: xInner,
      y1: yInner,
      x2: xOuter,
      y2: yOuter,
      isHourTick,
      isCardinal,
    });
  }

  return ticks;
}

const STANDBY_TICKS = buildStandByPerimeterTicks(218, 110);

// Concentric rounded-rectangle ring geometries so up to 3 simultaneous note timers
// render as nested glowing colored rings around the StandBy clock bezel!
const MULTI_RING_TRACKS = [
  { x: 5.5, y: 5.5, width: 243, height: 131, rx: 31.5, perimeter: 702, strokeWidth: 4.0 },
  { x: 10.5, y: 10.5, width: 233, height: 121, rx: 27.5, perimeter: 668, strokeWidth: 3.4 },
  { x: 15.0, y: 15.0, width: 224, height: 112, rx: 24.0, perimeter: 636, strokeWidth: 3.0 },
];

/**
 * 2.5D iOS StandBy Mode Desktop Clock Plugin
 * - Face Mode 1 ("analog"): iOS StandBy rectangular radial analog face (Image 1)
 * - Face Mode 2 ("bubble"): iOS StandBy oversized 3D bubble digital face (Image 2)
 * - Supports multiple simultaneous note timers: renders concentric colored rings
 *   around the bezel (one ring per timed Post-it note, in each note's own color!)
 *   and displays their live countdowns together.
 */
export default function DeskClockWidget({
  clockPos,
  onClockPosChange,
  isVisibleOnDesktop = true,
  isStringTargetHighlighted = false,
  activeTimerEntries = [], // Array of { note, remainingMs, progress, isRinging }
  onDismissRingingTimer,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const uid = useId().replace(/:/g, "");
  const [now, setNow] = useState(() => new Date());
  const [faceMode, setFaceMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CLOCK_FACE) === "bubble"
        ? "bubble"
        : "analog";
    } catch {
      return "analog";
    }
  });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef(null);
  const didMoveRef = useRef(false);

  // 1-second tick for clock hands and countdown rings (low CPU usage)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    didMoveRef.current = false;
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX: clockPos.x,
      initialY: clockPos.y,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startClientX;
      const dy = e.clientY - dragStartRef.current.startClientY;
      if (Math.hypot(dx, dy) > 5) {
        didMoveRef.current = true;
      }

      const nextX = Math.max(
        10,
        Math.min(
          window.innerWidth - DESK_CLOCK_SIZE.width - 10,
          Math.round(dragStartRef.current.initialX + dx)
        )
      );
      const nextY = Math.max(
        10,
        Math.min(
          window.innerHeight - DESK_CLOCK_SIZE.height - 10,
          Math.round(dragStartRef.current.initialY + dy)
        )
      );
      onClockPosChange?.({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        localStorage.setItem(STORAGE_KEY_CLOCK_POS, JSON.stringify(clockPos));
      } catch {
        // ignore
      }

      // If it was a clean click (not a drag), either silence ringing alarm(s) or switch between StandBy Analog & Bubble Digital
      if (!didMoveRef.current) {
        const ringingEntry = activeTimerEntries.find((e) => e.isRinging);
        if (ringingEntry) {
          onDismissRingingTimer?.(ringingEntry.note.id);
        } else {
          setFaceMode((prev) => {
            const next = prev === "analog" ? "bubble" : "analog";
            try {
              localStorage.setItem(STORAGE_KEY_CLOCK_FACE, next);
            } catch {
              // ignore
            }
            return next;
          });
        }
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    isDragging,
    clockPos,
    onClockPosChange,
    activeTimerEntries,
    onDismissRingingTimer,
  ]);

  const primaryTimerEntry = activeTimerEntries[0] || null;
  const isRinging = activeTimerEntries.some((e) => e.isRinging);
  const timerNote = primaryTimerEntry?.note || null;
  const timerTheme = timerNote
    ? POSTIT_COLORS[timerNote.color] || POSTIT_COLORS.yellow
    : null;
  const ringHex = timerTheme ? timerTheme.hex : "#FACC15";
  const ringHexSoft = timerTheme ? timerTheme.hexSoft : "#FEF08A";

  // Clock time values
  const hours24 = now.getHours();
  const hours12 = hours24 % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();

  const smoothSeconds = seconds + millis / 1000;
  const hourDeg = hours12 * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6 + smoothSeconds * 0.1;
  const secondDeg = smoothSeconds * 6;

  const dayName = TURKISH_DAYS_SHORT[now.getDay()];
  const dayNumber = now.getDate();

  const actuallyVisible = isVisibleOnDesktop || isDragging || isRinging;

  useEffect(() => {
    if (!actuallyVisible) {
      onInteractiveLeave?.();
    }
  }, [actuallyVisible, onInteractiveLeave]);

  // Digits for Mode 2 (StandBy Bubble Digital, e.g. "9:41" or "19:45")
  const hourStr = String(hours24).padStart(2, "0");
  const minStr = String(minutes).padStart(2, "0");

  return (
    <motion.div
      data-interactive={actuallyVisible ? "true" : "false"}
      onMouseEnter={actuallyVisible ? onInteractiveEnter : undefined}
      onMouseLeave={actuallyVisible ? onInteractiveLeave : undefined}
      onPointerDown={handlePointerDown}
      initial={{ scale: 0.88, opacity: 0 }}
      animate={
        !actuallyVisible
          ? {
              x: clockPos.x,
              y: clockPos.y + 24,
              scale: 0.8,
              opacity: 0,
            }
          : isRinging
          ? {
              x: [
                clockPos.x - 5,
                clockPos.x + 5,
                clockPos.x - 5,
                clockPos.x + 5,
                clockPos.x,
              ],
              y: [
                clockPos.y,
                clockPos.y - 4,
                clockPos.y,
                clockPos.y - 4,
                clockPos.y,
              ],
              rotate: [-2.5, 2.5, -2.5, 2.5, 0],
              scale: 1.05,
              opacity: 1,
            }
          : {
              x: clockPos.x,
              y: clockPos.y,
              scale: isDragging ? 1.04 : 1,
              rotate: 0,
              opacity: 1,
            }
      }
      transition={
        isRinging
          ? { duration: 0.38, repeat: Infinity }
          : isDragging
          ? { type: "tween", duration: 0 }
          : { type: "spring", stiffness: 380, damping: 26 }
      }
      style={{
        left: 0,
        top: 0,
        width: DESK_CLOCK_SIZE.width,
        height: DESK_CLOCK_SIZE.height,
        zIndex: isRinging || isDragging ? 9998 : 18,
        pointerEvents: actuallyVisible ? "auto" : "none",
      }}
      title={
        isRinging
          ? "Alarmı susturmak için tıklayın"
          : "Sürükle: Taşı • Tıkla: StandBy Saat Modunu Değiştir (Analog / Dijital)"
      }
      className={`fixed select-none ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* 2.5D Desktop Contact Shadow */}
      <div
        className={`absolute -bottom-2.5 left-6 right-6 h-5 rounded-full bg-black blur-md pointer-events-none transition-opacity ${
          isRinging ? "opacity-65" : "opacity-45"
        }`}
      />

      <svg
        width={DESK_CLOCK_SIZE.width}
        height={DESK_CLOCK_SIZE.height}
        viewBox="0 0 254 144"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          {/* 3D Titanium Outer Case Bezel */}
          <linearGradient
            id={`standbyBezel_${uid}`}
            x1="0"
            y1="0"
            x2="254"
            y2="144"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#52525B" />
            <stop offset="28%" stopColor="#27272A" />
            <stop offset="70%" stopColor="#18181B" />
            <stop offset="100%" stopColor="#09090B" />
          </linearGradient>

          {/* Bubble Digital Mode Gradients (Matches Image 2 or active Post-it timer colors!) */}
          <linearGradient
            id={`bubbleHourGrad_${uid}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={primaryTimerEntry ? ringHexSoft : "#F472B6"}
            />
            <stop
              offset="100%"
              stopColor={primaryTimerEntry ? ringHex : "#DB2777"}
            />
          </linearGradient>

          <linearGradient
            id={`bubbleMin1Grad_${uid}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={
                activeTimerEntries[1]
                  ? (POSTIT_COLORS[activeTimerEntries[1].note.color] || POSTIT_COLORS.yellow).hex
                  : primaryTimerEntry
                  ? ringHex
                  : "#A78BFA"
              }
            />
            <stop
              offset="100%"
              stopColor={
                activeTimerEntries[1]
                  ? (POSTIT_COLORS[activeTimerEntries[1].note.color] || POSTIT_COLORS.yellow).hexSoft
                  : primaryTimerEntry
                  ? ringHexSoft
                  : "#7C3AED"
              }
            />
          </linearGradient>

          <linearGradient
            id={`bubbleMin2Grad_${uid}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={
                activeTimerEntries[1]
                  ? (POSTIT_COLORS[activeTimerEntries[1].note.color] || POSTIT_COLORS.yellow).hexSoft
                  : primaryTimerEntry
                  ? ringHexSoft
                  : "#C084FC"
              }
            />
            <stop
              offset="100%"
              stopColor={
                activeTimerEntries[1]
                  ? (POSTIT_COLORS[activeTimerEntries[1].note.color] || POSTIT_COLORS.yellow).hex
                  : primaryTimerEntry
                  ? ringHex
                  : "#9333EA"
              }
            />
          </linearGradient>

          <filter
            id={`ringGlow_${uid}`}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 2.5D Lower 3D Depth Extrusion Lip */}
        <rect
          x="3"
          y="7"
          width="248"
          height="135"
          rx="34"
          fill="#040406"
        />

        {/* 3D Titanium Outer Body */}
        <rect
          x="3"
          y="3"
          width="248"
          height="136"
          rx="34"
          fill={`url(#standbyBezel_${uid})`}
          stroke={
            isStringTargetHighlighted
              ? "#EF4444"
              : "rgba(255,255,255,0.18)"
          }
          strokeWidth={isStringTargetHighlighted ? "2.5" : "1.2"}
        />

        {/* Top Physical Hardware Side Button Detail (like iPhone StandBy top edge) */}
        <rect
          x="64"
          y="0.5"
          width="26"
          height="2.5"
          rx="1.2"
          fill="#52525B"
        />

        {/* Deep Pitch-Black OLED Screen Display */}
        <rect
          x="9"
          y="9"
          width="236"
          height="124"
          rx="29"
          fill="#050507"
        />

        {/* Multi-Timer Concentric Post-it Color Progress Rings around the StandBy Bezel! */}
        {activeTimerEntries.slice(0, 3).map((entry, idx) => {
          const track = MULTI_RING_TRACKS[idx];
          const entryTheme =
            POSTIT_COLORS[entry.note.color] || POSTIT_COLORS.yellow;
          const ratio = Math.max(0.02, Math.min(1, entry.progress));
          const offset = track.perimeter * (1 - ratio);

          return (
            <g key={entry.note.id}>
              <rect
                x={track.x}
                y={track.y}
                width={track.width}
                height={track.height}
                rx={track.rx}
                fill="none"
                stroke={entryTheme.hex}
                strokeOpacity="0.18"
                strokeWidth={track.strokeWidth}
              />
              <rect
                x={track.x}
                y={track.y}
                width={track.width}
                height={track.height}
                rx={track.rx}
                fill="none"
                stroke={entryTheme.hex}
                strokeWidth={entry.isRinging ? track.strokeWidth + 1.4 : track.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={track.perimeter}
                strokeDashoffset={entry.isRinging ? 0 : offset}
                filter={`url(#ringGlow_${uid})`}
              />
            </g>
          );
        })}

        {/* =========================================================
            FACE MODE 1: iOS StandBy Analog Mode (Image 1)
           ========================================================= */}
        {faceMode === "analog" && (
          <g>
            {/* 60 Radial Rectangular Perimeter Tick Marks */}
            {STANDBY_TICKS.map((t) => (
              <line
                key={t.i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={
                  t.isCardinal
                    ? "#BDBDC2"
                    : t.isHourTick
                    ? "#8E8E93"
                    : "#3A3A3C"
                }
                strokeWidth={t.isCardinal ? "2.2" : t.isHourTick ? "1.8" : "1.1"}
                strokeLinecap="round"
              />
            ))}

            {/* 12, 3, 6, 9 StandBy Wide Typography Numerals */}
            <text
              x="127"
              y="39"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="21"
              fontWeight="800"
              letterSpacing="-0.5"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            >
              12
            </text>
            <text
              x="202"
              y="79"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="21"
              fontWeight="800"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            >
              3
            </text>
            <text
              x="127"
              y="117"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="21"
              fontWeight="800"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            >
              6
            </text>
            <text
              x="52"
              y="79"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="21"
              fontWeight="800"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            >
              9
            </text>

            {/* Left Side Complication: Active @Timer Countdowns (Stacks up to 2 simultaneous timers in their respective note colors!) */}
            {activeTimerEntries.length > 0 ? (
              <g
                transform={`translate(66, ${
                  activeTimerEntries.length > 1 ? 66 : 72
                })`}
              >
                {activeTimerEntries.slice(0, 2).map((entry, idx) => {
                  const tTheme =
                    POSTIT_COLORS[entry.note.color] || POSTIT_COLORS.yellow;
                  const yOff = idx * 12;
                  return (
                    <g key={entry.note.id} transform={`translate(0, ${yOff})`}>
                      <circle cx="4" cy="-3" r="3.8" fill={tTheme.hex} />
                      <path
                        d="M4 -5 L4 -3 L5.4 -2"
                        stroke="#050507"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                      />
                      <text
                        x="10.5"
                        y="0.5"
                        fill={tTheme.hexSoft}
                        fontSize="9"
                        fontWeight="800"
                        fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
                      >
                        {entry.isRinging
                          ? "DOLDU!"
                          : formatRemainingTime(entry.remainingMs)}
                      </text>
                    </g>
                  );
                })}
              </g>
            ) : (
              <g transform="translate(70, 72)">
                <circle cx="4" cy="-3" r="3.8" fill="#F59E0B" opacity="0.85" />
                <text
                  x="11"
                  y="0.5"
                  fill="#A1A1AA"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                >
                  {`${hourStr}:${minStr}`}
                </text>
              </g>
            )}

            {/* Right Side Complication: Day of Week in Red + Date in White (Like WED 19 in Image 1) */}
            <text
              x="184"
              y="72.5"
              textAnchor="end"
              fontSize="9.5"
              fontWeight="800"
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
            >
              <tspan fill="#EF4444">{dayName} </tspan>
              <tspan fill="#FFFFFF">{dayNumber}</tspan>
            </text>

            {/* Analog Hour Hand (StandBy White Pill with thin neck) */}
            <g transform={`rotate(${hourDeg} 127 72)`}>
              <line
                x1="127"
                y1="72"
                x2="127"
                y2="62"
                stroke="#FFFFFF"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <rect
                x="123.8"
                y="43"
                width="6.4"
                height="22"
                rx="3.2"
                fill="#FFFFFF"
              />
            </g>

            {/* Analog Minute Hand (StandBy Longer White Pill with thin neck) */}
            <g transform={`rotate(${minuteDeg} 127 72)`}>
              <line
                x1="127"
                y1="72"
                x2="127"
                y2="60"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <rect
                x="124.2"
                y="26"
                width="5.6"
                height="37"
                rx="2.8"
                fill="#FFFFFF"
              />
            </g>

            {/* Sweeping Orange Second Hand (Image 1 Signature Orange Needle) */}
            <g transform={`rotate(${secondDeg} 127 72)`}>
              <line
                x1="127"
                y1="83"
                x2="127"
                y2="20"
                stroke={primaryTimerEntry ? ringHex : "#F97316"}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="127"
                cy="72"
                r="3.6"
                fill="#FFFFFF"
              />
              <circle
                cx="127"
                cy="72"
                r="2"
                fill={primaryTimerEntry ? ringHex : "#F97316"}
              />
            </g>
          </g>
        )}

        {/* =========================================================
            FACE MODE 2: iOS StandBy Bubble Digital Mode (Image 2)
           ========================================================= */}
        {faceMode === "bubble" && (
          <g>
            {/* Large Playful Bubble Hour Digits */}
            <text
              x="60"
              y="102"
              textAnchor="middle"
              fill={`url(#bubbleHourGrad_${uid})`}
              fontSize="76"
              fontWeight="900"
              letterSpacing="-4"
              style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))" }}
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Arial Rounded MT Bold', sans-serif"
            >
              {hourStr}
            </text>

            {/* 3D Floating Colon Spheres in Center (Image 2) */}
            <circle cx="117" cy="56" r="8.5" fill="#71717A" fillOpacity="0.85" />
            <circle
              cx="117"
              cy="86"
              r="8.5"
              fill="#D4D4D8"
              fillOpacity="0.9"
            />

            {/* Large Playful Bubble Minute First Digit */}
            <text
              x="158"
              y="102"
              textAnchor="middle"
              fill={`url(#bubbleMin1Grad_${uid})`}
              fontSize="76"
              fontWeight="900"
              transform="rotate(-3 158 72)"
              style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))" }}
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Arial Rounded MT Bold', sans-serif"
            >
              {minStr[0]}
            </text>

            {/* Large Playful Bubble Minute Second Digit */}
            <text
              x="208"
              y="102"
              textAnchor="middle"
              fill={`url(#bubbleMin2Grad_${uid})`}
              fontSize="76"
              fontWeight="900"
              transform="rotate(3 208 72)"
              style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))" }}
              fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Arial Rounded MT Bold', sans-serif"
            >
              {minStr[1]}
            </text>

            {/* Active Note Timer Overlay Pills in Bubble Mode (Shows up to 2 simultaneous note timers side by side!) */}
            {activeTimerEntries.length > 0 && (
              <g transform="translate(127, 23)">
                {activeTimerEntries.slice(0, 2).map((entry, idx, arr) => {
                  const tTheme =
                    POSTIT_COLORS[entry.note.color] || POSTIT_COLORS.yellow;
                  const offsetX =
                    arr.length === 1 ? 0 : idx === 0 ? -44 : 44;
                  return (
                    <g
                      key={entry.note.id}
                      transform={`translate(${offsetX}, 0)`}
                    >
                      <rect
                        x="-40"
                        y="-8.5"
                        width="80"
                        height="17"
                        rx="8.5"
                        fill="rgba(9,9,11,0.9)"
                        stroke={tTheme.hex}
                        strokeWidth="1.3"
                      />
                      <circle cx="-26" cy="0" r="3.4" fill={tTheme.hex} />
                      <path
                        d="M-26 -1.8 L-26 0 L-24.7 0.9"
                        stroke="#09090B"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                      />
                      <text
                        x="4"
                        y="3.2"
                        textAnchor="middle"
                        fill={tTheme.hexSoft}
                        fontSize="9.2"
                        fontWeight="800"
                        fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
                      >
                        {entry.isRinging
                          ? "DOLDU!"
                          : formatRemainingTime(entry.remainingMs)}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        )}

        {/* Subtle Curved Glass Specular Sheen */}
        <path
          d="M24 12 L230 12 C239 12 243 17 243 24 C180 18 75 18 11 24 C11 17 15 12 24 12 Z"
          fill="#FFFFFF"
          fillOpacity="0.08"
          pointerEvents="none"
        />
      </svg>
    </motion.div>
  );
}
