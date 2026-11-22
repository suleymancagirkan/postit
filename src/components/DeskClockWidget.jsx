import React, { useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, BellOff } from "lucide-react";

const STORAGE_KEY_CLOCK_POS = "postit_desktop_clock_pos_v1";
const STORAGE_KEY_CLOCK_TIMER = "postit_desktop_clock_timer_v1";

/**
 * Plays a pleasant mechanical twin-bell desk clock chime using the Web Audio API (no external audio assets).
 */
function playDeskBellChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const hitTimes = [0, 0.11, 0.22, 0.33, 0.55, 0.66, 0.77, 0.88];
    hitTimes.forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 1568 : 1760, ctx.currentTime + offset);

      overtone.type = "sine";
      overtone.frequency.setValueAtTime(idx % 2 === 0 ? 3136 : 3520, ctx.currentTime + offset);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + offset + 0.1);

      osc.connect(gain);
      overtone.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + offset);
      overtone.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.11);
      overtone.stop(ctx.currentTime + offset + 0.11);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1400);
  } catch {
    // ignore audio errors
  }
}

export const DESK_CLOCK_ID = "__desk_clock__";
export const DESK_CLOCK_SIZE = { width: 168, height: 196 };

export function getDefaultClockPosition() {
  if (typeof window === "undefined") return { x: 46, y: 310 };
  return {
    x: 42,
    y: Math.max(290, window.innerHeight - 250),
  };
}

export function getClockThumbtackAnchor(clockPos) {
  return {
    x: clockPos.x + DESK_CLOCK_SIZE.width / 2,
    y: clockPos.y + 16,
  };
}

function formatCountdown(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * 2.5D Twin-Bell Retro-Modern Desktop Table Clock & Countdown Timer Plugin
 * - Lives on the Desktop (Masaüstü), hiding when covered by normal windows unless its alarm is ringing!
 * - Can be linked to Post-it notes via red detective strings or @5dk note syntax.
 */
export default function DeskClockWidget({
  clockPos,
  onClockPosChange,
  isVisibleOnDesktop = true,
  isStringTargetHighlighted = false,
  linkedNoteCount = 0,
  externalTimerRequest = null,
  onAlarmStateChange,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const uid = useId().replace(/:/g, "");
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState("clock"); // "clock" | "timer"
  const [totalSeconds, setTotalSeconds] = useState(300); // default 5 min
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [isRunning, setIsRunning] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef(null);
  const lastHandledReqRef = useRef(null);

  // Restore saved timer state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOCK_TIMER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.totalSeconds) setTotalSeconds(parsed.totalSeconds);
        if (parsed.mode === "timer") setMode("timer");
        if (parsed.isRunning && parsed.targetTimestamp) {
          const left = Math.round((parsed.targetTimestamp - Date.now()) / 1000);
          if (left > 0) {
            setRemainingSeconds(left);
            setIsRunning(true);
          } else {
            setRemainingSeconds(0);
            setIsRunning(false);
          }
        } else if (typeof parsed.remainingSeconds === "number") {
          setRemainingSeconds(parsed.remainingSeconds);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist timer state
  useEffect(() => {
    try {
      const payload = {
        mode,
        totalSeconds,
        remainingSeconds,
        isRunning,
        targetTimestamp: isRunning ? Date.now() + remainingSeconds * 1000 : null,
      };
      localStorage.setItem(STORAGE_KEY_CLOCK_TIMER, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [mode, totalSeconds, remainingSeconds, isRunning]);

  // Accept external timer commands triggered by typing @5dk or @15dk inside a Post-it note
  useEffect(() => {
    if (
      !externalTimerRequest ||
      externalTimerRequest.reqId === lastHandledReqRef.current
    ) {
      return;
    }
    lastHandledReqRef.current = externalTimerRequest.reqId;
    const secs = Math.max(5, Math.round(externalTimerRequest.seconds || 300));
    setMode("timer");
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setIsRinging(false);
    setIsRunning(true);
  }, [externalTimerRequest]);

  // Real-time 1-second tick for both wall clock and countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());

      if (isRunning) {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsRinging(true);
            playDeskBellChime();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Repeat bell chime every 2.4s while ringing (auto-stops after 18s if untouched)
  useEffect(() => {
    onAlarmStateChange?.(isRinging);
    if (!isRinging) return;

    const chimeInterval = setInterval(() => {
      playDeskBellChime();
    }, 2400);

    const autoStopTimer = setTimeout(() => {
      setIsRinging(false);
    }, 18000);

    return () => {
      clearInterval(chimeInterval);
      clearTimeout(autoStopTimer);
    };
  }, [isRinging, onAlarmStateChange]);

  const handlePointerDown = (e) => {
    if (
      e.target.closest("[data-no-drag='true']") ||
      e.target.tagName.toLowerCase() === "button"
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

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
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDragging, clockPos, onClockPosChange]);

  const selectPresetMinutes = (mins) => {
    const secs = mins * 60;
    setMode("timer");
    setIsRinging(false);
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setIsRunning(true);
  };

  const handleTopPlungerClick = (e) => {
    e.stopPropagation();
    if (isRinging) {
      setIsRinging(false);
      setRemainingSeconds(totalSeconds);
      return;
    }
    setMode((prev) => (prev === "clock" ? "timer" : "clock"));
  };

  // Analog hand angles
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hourDeg = hours * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const secondDeg = seconds * 6;

  // Countdown progress ring (circumference = 2 * pi * 45 ≈ 282.7)
  const circumference = 282.74;
  const progressRatio =
    totalSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 0;
  const dashOffset = circumference * (1 - progressRatio);

  // Visible when Desktop is exposed, OR when being dragged, OR when alarm is actively ringing!
  const actuallyVisible = isVisibleOnDesktop || isDragging || isRinging;

  useEffect(() => {
    if (!actuallyVisible) {
      onInteractiveLeave?.();
    }
  }, [actuallyVisible, onInteractiveLeave]);

  return (
    <motion.div
      data-interactive={actuallyVisible ? "true" : "false"}
      onMouseEnter={actuallyVisible ? onInteractiveEnter : undefined}
      onMouseLeave={actuallyVisible ? onInteractiveLeave : undefined}
      onPointerDown={handlePointerDown}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={
        !actuallyVisible
          ? {
              x: clockPos.x,
              y: clockPos.y + 24,
              scale: 0.78,
              opacity: 0,
            }
          : isRinging
          ? {
              x: [clockPos.x - 4, clockPos.x + 4, clockPos.x - 4, clockPos.x + 4, clockPos.x],
              y: [clockPos.y, clockPos.y - 5, clockPos.y, clockPos.y - 4, clockPos.y],
              rotate: [-4, 4, -5, 5, 0],
              scale: 1.06,
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
          ? { duration: 0.42, repeat: Infinity }
          : isDragging
          ? { type: "tween", duration: 0 }
          : { type: "spring", stiffness: 360, damping: 26 }
      }
      style={{
        left: 0,
        top: 0,
        width: DESK_CLOCK_SIZE.width,
        height: DESK_CLOCK_SIZE.height,
        zIndex: isRinging || isDragging ? 9998 : 18,
        pointerEvents: actuallyVisible ? "auto" : "none",
      }}
      className={`fixed select-none flex flex-col items-center ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* 2.5D Twin-Bell Table Clock SVG Sculpture */}
      <div className="relative w-full h-full flex flex-col items-center">
        {/* Floor Contact Shadow under Brass Feet */}
        <div
          className={`absolute bottom-4 w-32 h-5 rounded-full bg-black blur-md pointer-events-none transition-opacity ${
            isRinging ? "opacity-60" : "opacity-45"
          }`}
        />

        <svg
          width="168"
          height="176"
          viewBox="0 0 168 176"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`overflow-visible transition-all duration-200 ${
            isStringTargetHighlighted
              ? "drop-shadow-[0_0_18px_rgba(239,68,68,0.85)]"
              : isRinging
              ? "drop-shadow-[0_0_24px_rgba(251,191,36,0.85)]"
              : "drop-shadow-[0_14px_22px_rgba(0,0,0,0.45)]"
          }`}
        >
          <defs>
            {/* 3D Brushed Brass Gradient for Bells, Plunger, and Legs */}
            <linearGradient id={`brass_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="30%" stopColor="#FACC15" />
              <stop offset="68%" stopColor="#CA8A04" />
              <stop offset="100%" stopColor="#713F12" />
            </linearGradient>

            {/* 3D Matte Charcoal / Vintage Cream Outer Clock Case */}
            <linearGradient id={`caseOuter_${uid}`} x1="24" y1="30" x2="144" y2="152" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="25%" stopColor="#334155" />
              <stop offset="70%" stopColor="#1E293B" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>

            {/* Metallic Inner Bezel Ring */}
            <linearGradient id={`bezelRing_${uid}`} x1="30" y1="36" x2="138" y2="144" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="45%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* Warm Ivory Paper-Like Clock Dial Face */}
            <radialGradient
              id={`dialFace_${uid}`}
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(76 80) scale(56)"
            >
              <stop offset="0%" stopColor="#FFFBEB" />
              <stop offset="75%" stopColor="#FEF3C7" />
              <stop offset="100%" stopColor="#FDE68A" />
            </radialGradient>
          </defs>

          {/* Left & Right 3D Angled Brass Support Legs */}
          <path
            d="M50 138 L37 160"
            stroke={`url(#brass_${uid})`}
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          <path
            d="M118 138 L131 160"
            stroke={`url(#brass_${uid})`}
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          {/* Rubber Foot Caps */}
          <circle cx="36" cy="161" r="4" fill="#1E293B" />
          <circle cx="132" cy="161" r="4" fill="#1E293B" />

          {/* Top-Center Brass Plunger / Mode & Stop Alarm Button (Also anchor for red detective strings!) */}
          <g
            data-no-drag="true"
            onClick={handleTopPlungerClick}
            className="cursor-pointer"
          >
            <title>
              {isRinging
                ? "Alarmı Sustur"
                : mode === "clock"
                ? "Zamanlayıcı Moduna Geç"
                : "Saat Moduna Geç"}
            </title>
            <rect
              x="79"
              y="13"
              width="10"
              height="16"
              rx="3"
              fill={`url(#brass_${uid})`}
            />
            <rect
              x="73"
              y="8"
              width="22"
              height="7"
              rx="3.5"
              fill={`url(#brass_${uid})`}
              stroke="#713F12"
              strokeWidth="0.8"
            />
            {/* Red detective string loop if any Post-it is tied to the clock */}
            {linkedNoteCount > 0 && (
              <circle
                cx="84"
                cy="16"
                r="5.5"
                fill="none"
                stroke="#DC2626"
                strokeWidth="2.6"
              />
            )}
          </g>

          {/* Center Hammer between the Twin Bells (Vibrates rapidly when ringing!) */}
          <motion.g
            animate={
              isRinging
                ? { rotate: [-22, 22, -22, 22, 0] }
                : { rotate: 0 }
            }
            transition={
              isRinging ? { duration: 0.14, repeat: Infinity } : { duration: 0.2 }
            }
            style={{ originX: "84px", originY: "34px" }}
          >
            <line
              x1="84"
              y1="34"
              x2="84"
              y2="21"
              stroke="#CBD5E1"
              strokeWidth="2.5"
            />
            <circle cx="84" cy="20" r="4" fill={`url(#brass_${uid})`} />
          </motion.g>

          {/* Left 3D Brass Twin Bell Dome */}
          <g transform="translate(36, 22) rotate(-34)">
            <line x1="0" y1="8" x2="0" y2="18" stroke="#94A3B8" strokeWidth="3" />
            <path
              d="M-20 10 C-20 -3 -11 -10 0 -10 C11 -10 20 -3 20 10 Z"
              fill={`url(#brass_${uid})`}
              stroke="#713F12"
              strokeWidth="1"
            />
            <ellipse cx="0" cy="-11" rx="3" ry="2" fill="#FEF08A" />
          </g>

          {/* Right 3D Brass Twin Bell Dome */}
          <g transform="translate(132, 22) rotate(34)">
            <line x1="0" y1="8" x2="0" y2="18" stroke="#94A3B8" strokeWidth="3" />
            <path
              d="M-20 10 C-20 -3 -11 -10 0 -10 C11 -10 20 -3 20 10 Z"
              fill={`url(#brass_${uid})`}
              stroke="#713F12"
              strokeWidth="1"
            />
            <ellipse cx="0" cy="-11" rx="3" ry="2" fill="#FEF08A" />
          </g>

          {/* 3D Outer Cylindrical Clock Case Shadow Depth */}
          <circle cx="84" cy="94" r="58" fill="#090D16" />

          {/* Main 3D Clock Case Body */}
          <circle
            cx="84"
            cy="90"
            r="58"
            fill={`url(#caseOuter_${uid})`}
            stroke="#64748B"
            strokeWidth="1.5"
          />

          {/* Metallic Inner Bezel Ring */}
          <circle cx="84" cy="90" r="51" fill={`url(#bezelRing_${uid})`} />

          {/* Warm Ivory Clock Dial Face */}
          <circle
            cx="84"
            cy="90"
            r="47.5"
            fill={`url(#dialFace_${uid})`}
            stroke="#D97706"
            strokeWidth="1"
          />

          {/* Countdown Active Progress Ring around the Dial */}
          {(mode === "timer" || isRunning || isRinging) && (
            <circle
              cx="84"
              cy="90"
              r="45"
              fill="none"
              stroke={isRinging ? "#E11D48" : "#F59E0B"}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 84 90)"
            />
          )}

          {/* 12 Hour Tick Marks around the Dial */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const isMajor = i % 3 === 0;
            const rOuter = 43.5;
            const rInner = isMajor ? 36.5 : 39.5;
            const x1 = 84 + rInner * Math.sin(angle);
            const y1 = 90 - rInner * Math.cos(angle);
            const x2 = 84 + rOuter * Math.sin(angle);
            const y2 = 90 - rOuter * Math.cos(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isMajor ? "#1E293B" : "#64748B"}
                strokeWidth={isMajor ? "2.4" : "1.4"}
                strokeLinecap="round"
              />
            );
          })}

          {/* Digital Sub-Dial Readout (Shows Countdown MM:SS or Digital Clock HH:MM) */}
          <rect
            x="58"
            y="102"
            width="52"
            height="17"
            rx="5"
            fill="#1E293B"
            stroke="#94A3B8"
            strokeWidth="0.8"
          />
          <text
            x="84"
            y="113.8"
            textAnchor="middle"
            fill={isRinging ? "#FDA4AF" : mode === "timer" || isRunning ? "#FDE047" : "#F8FAFC"}
            fontSize="10.5"
            fontWeight="800"
            fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
          >
            {mode === "timer" || isRunning || isRinging
              ? formatCountdown(remainingSeconds)
              : `${String(now.getHours()).padStart(2, "0")}:${String(
                  now.getMinutes()
                ).padStart(2, "0")}`}
          </text>

          {/* Analog Hour Hand */}
          <g transform={`rotate(${hourDeg} 84 90)`}>
            <line
              x1="84"
              y1="93"
              x2="84"
              y2="64"
              stroke="#0F172A"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>

          {/* Analog Minute Hand */}
          <g transform={`rotate(${minuteDeg} 84 90)`}>
            <line
              x1="84"
              y1="94"
              x2="84"
              y2="54"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </g>

          {/* Braun-inspired Orange Second Hand */}
          <g transform={`rotate(${secondDeg} 84 90)`}>
            <line
              x1="84"
              y1="98"
              x2="84"
              y2="50"
              stroke="#EA580C"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="84" cy="90" r="3.5" fill="#EA580C" />
            <circle cx="84" cy="90" r="1.4" fill="#FFFBEB" />
          </g>

          {/* Curved Glass Lens Specular Reflection */}
          <path
            d="M47 68 C55 49 77 43 99 48 C83 50 61 59 47 68 Z"
            fill="#FFFFFF"
            fillOpacity="0.4"
            pointerEvents="none"
          />
        </svg>

        {/* Compact Tactile Brass & Charcoal Timer Control Strip under the Clock Feet */}
        <div
          data-no-drag="true"
          className=" -mt-2 flex items-center gap-1 px-2 py-1 rounded-2xl bg-neutral-900/95 border border-amber-400/30 shadow-xl text-white"
        >
          {isRinging ? (
            <button
              type="button"
              onClick={() => {
                setIsRinging(false);
                setRemainingSeconds(totalSeconds);
              }}
              className="flex items-center gap-1 px-3 py-0.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer animate-pulse"
            >
              <BellOff className="w-3.5 h-3.5" />
              <span>Alarmı Sustur</span>
            </button>
          ) : (
            <>
              {[1, 5, 15, 25].map((m) => {
                const isSelected = mode === "timer" && totalSeconds === m * 60;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => selectPresetMinutes(m)}
                    title={`${m} Dakika Zamanlayıcı Başlat`}
                    className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-400 text-neutral-950"
                        : "bg-white/10 hover:bg-white/20 text-neutral-200"
                    }`}
                  >
                    {m}d
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setMode("timer");
                  if (remainingSeconds <= 0) {
                    setRemainingSeconds(totalSeconds || 300);
                  }
                  setIsRunning((prev) => !prev);
                }}
                title={isRunning ? "Duraklat" : "Başlat"}
                className="p-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 cursor-pointer transition"
              >
                {isRunning ? (
                  <Pause className="w-3 h-3 fill-current" />
                ) : (
                  <Play className="w-3 h-3 fill-current" />
                )}
              </button>

              {(isRunning || mode === "timer") && (
                <button
                  type="button"
                  onClick={() => {
                    setIsRunning(false);
                    setIsRinging(false);
                    setRemainingSeconds(totalSeconds);
                    setMode("clock");
                  }}
                  title="Sıfırla ve Saat Moduna Dön"
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 cursor-pointer transition"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
