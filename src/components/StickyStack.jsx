import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUpRight, GripHorizontal, Layers, Magnet } from "lucide-react";
import { POSTIT_COLORS, COLOR_LIST, NOTE_SIZE_LIMITS } from "../hooks/useNotesStore";
import MarkdownEditor from "./MarkdownEditor";

const STACK_ORIGIN = { x: 36, y: 36 };
// Magnetic pull break distance: inside this radius the sheet resists like a magnet;
// beyond it, the magnetic bond snaps and the card leaps free to the cursor.
const MAGNET_BREAK_DISTANCE = 115;
const MAGNET_RECAPTURE_DISTANCE = 48;

export default function StickyStack({
  draft,
  onUpdateDraft,
  onTearOffPin,
  onDiscardDraft,
  onDragStateChange,
  onInteractiveEnter,
  onInteractiveLeave,
  pinnedCount = 0,
}) {
  const [isTearing, setIsTearing] = useState(false);
  const [rawOffset, setRawOffset] = useState({ x: 0, y: 0 });
  const [isSnappedFree, setIsSnappedFree] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const dragStartRef = useRef(null);
  const snappedFreeRef = useRef(false);
  const textareaRef = useRef(null);
  const stackContainerRef = useRef(null);

  const activeTheme = POSTIT_COLORS[draft.color] || POSTIT_COLORS.yellow;
  const cardSize = NOTE_SIZE_LIMITS.DEFAULT; // 210x210 default minimum size

  const rawDist = Math.hypot(rawOffset.x, rawOffset.y);
  // Magnetic tension ratio (0 -> 1) right before breaking free
  const magnetTension = isTearing && !isSnappedFree
    ? Math.min(1, rawDist / MAGNET_BREAK_DISTANCE)
    : 0;

  // Apply non-linear magnetic hold back while inside the magnetic field:
  // the sheet moves only ~28% to ~48% of the cursor distance until the magnetic force snaps!
  const pullRatio = isSnappedFree
    ? 1
    : 0.24 + 0.24 * Math.pow(magnetTension, 1.85);

  const visualOffset = {
    x: rawOffset.x * pullRatio,
    y: rawOffset.y * pullRatio,
  };

  const handlePointerDown = (e) => {
    if (
      e.target.closest("[data-no-drag='true']") ||
      e.target.tagName.toLowerCase() === "textarea" ||
      e.target.tagName.toLowerCase() === "button"
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const rect = stackContainerRef.current?.getBoundingClientRect();
    const grabOffsetX = rect ? startClientX - rect.left : cardSize / 2;
    const grabOffsetY = rect ? startClientY - rect.top : 24;

    dragStartRef.current = {
      startClientX,
      startClientY,
      grabOffsetX,
      grabOffsetY,
    };
    snappedFreeRef.current = false;

    setIsTearing(true);
    setIsSnappedFree(false);
    setRawOffset({ x: 0, y: 0 });

    onDragStateChange?.({
      isDragging: true,
      source: "stack",
      clientX: startClientX,
      clientY: startClientY,
    });
  };

  useEffect(() => {
    if (!isTearing) return;

    const handlePointerMove = (e) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startClientX;
      const dy = e.clientY - dragStartRef.current.startClientY;
      const dist = Math.hypot(dx, dy);

      if (!snappedFreeRef.current && dist >= MAGNET_BREAK_DISTANCE) {
        snappedFreeRef.current = true;
        setIsSnappedFree(true);
      } else if (snappedFreeRef.current && dist <= MAGNET_RECAPTURE_DISTANCE) {
        snappedFreeRef.current = false;
        setIsSnappedFree(false);
      }

      setRawOffset({ x: dx, y: dy });

      onDragStateChange?.({
        isDragging: true,
        source: "stack",
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };

    const handlePointerUp = (e) => {
      if (!dragStartRef.current) return;

      const finalX = e.clientX - dragStartRef.current.grabOffsetX;
      const finalY = e.clientY - dragStartRef.current.grabOffsetY;

      const dropResult = onDragStateChange?.({
        isDragging: false,
        source: "stack",
        clientX: e.clientX,
        clientY: e.clientY,
        isDrop: true,
      });

      if (dropResult?.droppedInTrash) {
        setIsDiscarding(true);
        setTimeout(() => {
          onDiscardDraft?.();
          setIsDiscarding(false);
          setIsTearing(false);
          setIsSnappedFree(false);
          setRawOffset({ x: 0, y: 0 });
        }, 220);
      } else if (snappedFreeRef.current) {
        // Magnetic bond was broken -> pin at (finalX, finalY)
        onTearOffPin?.({
          x: finalX,
          y: finalY,
          text: draft.text,
          color: draft.color,
        });
        setIsTearing(false);
        setIsSnappedFree(false);
        setRawOffset({ x: 0, y: 0 });
      } else {
        // Still captured by stack's magnetic force -> snap back to stack
        setIsTearing(false);
        setIsSnappedFree(false);
        setRawOffset({ x: 0, y: 0 });
      }

      dragStartRef.current = null;
      snappedFreeRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isTearing, draft.text, draft.color, onDragStateChange, onTearOffPin, onDiscardDraft]);

  const handleQuickPin = () => {
    const offsetIndex = pinnedCount % 6;
    const targetX = Math.min(window.innerWidth - cardSize - 40, 290 + offsetIndex * 34);
    const targetY = Math.min(window.innerHeight - cardSize - 40, 52 + offsetIndex * 26);
    onTearOffPin?.({
      x: targetX,
      y: targetY,
      text: draft.text,
      color: draft.color,
    });
  };

  return (
    <div
      ref={stackContainerRef}
      data-interactive="true"
      onMouseEnter={onInteractiveEnter}
      onMouseLeave={onInteractiveLeave}
      style={{
        left: STACK_ORIGIN.x,
        top: STACK_ORIGIN.y,
        width: cardSize,
        height: cardSize + 28,
      }}
      className="fixed z-30 select-none"
    >
      {/* Stack Header Badge */}
      <div className="flex items-center justify-between w-full px-0.5 mb-1.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-900/85 text-white text-[11px] font-medium tracking-wide shadow-md">
          <Layers className="w-3 h-3 text-amber-300" />
          <span>Post-it Destesi</span>
          {pinnedCount > 0 && (
            <span className="ml-0.5 px-1.5 rounded-full bg-white/20 text-[10px] font-semibold">
              {pinnedCount}
            </span>
          )}
        </div>

        {isTearing && !isSnappedFree && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-950 bg-amber-300/95 px-2 py-0.5 rounded-full shadow-sm animate-pulse">
            <Magnet className="w-2.5 h-2.5" />
            <span>{Math.round(magnetTension * 100)}%</span>
          </span>
        )}
      </div>

      <div
        style={{ width: cardSize, height: cardSize }}
        className="relative"
      >
        {/* Magnetic field tension ring while pulling against stack resistance */}
        {isTearing && !isSnappedFree && (
          <div
            style={{
              transform: `scale(${1 + magnetTension * 0.12})`,
              opacity: 0.25 + magnetTension * 0.55,
            }}
            className="absolute -inset-2 rounded-[28px] border-2 border-dashed border-amber-400/90 pointer-events-none transition-transform duration-75"
          />
        )}

        {/* Bottom-most sheet in the stack (-3deg) */}
        <div
          style={{ transform: "rotate(-3deg) translate(-3px, 5px)" }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-lg paper-texture pointer-events-none transition-colors duration-300`}
        >
          <div
            className={`h-8 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} opacity-90`}
          />
        </div>

        {/* Second sheet in the stack (1.5deg) */}
        <div
          style={{ transform: "rotate(1.5deg) translate(3px, 2px)" }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-lg paper-texture pointer-events-none transition-colors duration-300`}
        >
          <div
            className={`h-8 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} opacity-95`}
          />
        </div>

        {/* Underlying fresh sheet that springs up when tearing off the top sheet */}
        <motion.div
          initial={false}
          animate={{
            scale: isTearing ? (isSnappedFree ? 1 : 0.94 + magnetTension * 0.04) : 0.92,
            y: isTearing ? (isSnappedFree ? 0 : 6 - magnetTension * 4) : 8,
            rotate: isTearing ? 0 : -1,
            opacity: isTearing ? 1 : 0.7,
          }}
          transition={{ type: "spring", stiffness: 360, damping: 24 }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-xl paper-texture pointer-events-none`}
        >
          <div
            className={`h-9 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} flex items-center justify-between px-3`}
          >
            <div className="flex items-center gap-1.5 opacity-60">
              <Sparkles className={`w-3.5 h-3.5 ${activeTheme.subText}`} />
              <span className={`text-[11px] font-semibold ${activeTheme.subText}`}>
                Yeni Yaprak
              </span>
            </div>
          </div>
        </motion.div>

        {/* Active Top Sheet with Magnetic Resistance & Snap Release */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={draft.sheetId}
            onPointerDown={handlePointerDown}
            initial={{ scale: 0.9, y: 14, rotate: -2, opacity: 0 }}
            animate={
              isDiscarding
                ? {
                    x: window.innerWidth - STACK_ORIGIN.x - 120,
                    y: window.innerHeight - STACK_ORIGIN.y - 120,
                    scale: 0.15,
                    rotate: 35,
                    opacity: 0,
                  }
                : {
                    x: visualOffset.x,
                    y: visualOffset.y,
                    scale: isSnappedFree
                      ? 1.07
                      : isTearing
                      ? 1 - magnetTension * 0.035
                      : 1,
                    rotate: isTearing
                      ? Math.max(-10, Math.min(10, visualOffset.x * 0.045))
                      : 0,
                    opacity: 1,
                  }
            }
            transition={
              isTearing
                ? {
                    // Quick spring so the moment isSnappedFree flips true, the card leaps from the magnet to the cursor!
                    x: { type: "spring", stiffness: 620, damping: 32, mass: 0.5 },
                    y: { type: "spring", stiffness: 620, damping: 32, mass: 0.5 },
                    scale: { type: "spring", stiffness: 520, damping: 22 },
                    rotate: { type: "spring", stiffness: 450, damping: 26 },
                  }
                : { type: "spring", stiffness: 420, damping: 25 }
            }
            className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 paper-texture flex flex-col justify-between transition-shadow duration-200 ${
              isSnappedFree
                ? "shadow-[0_28px_60px_-10px_rgba(0,0,0,0.45)] ring-2 ring-black/10"
                : "shadow-[0_14px_30px_-8px_rgba(0,0,0,0.25)]"
            } ${isTearing ? "cursor-grabbing z-50" : "cursor-grab"}`}
          >
            {/* Top Adhesive Strip */}
            <div
              className={`h-9 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} px-3 flex items-center justify-between transition-colors duration-200`}
            >
              <div className="flex items-center gap-1.5">
                <GripHorizontal className={`w-4 h-4 ${activeTheme.subText} opacity-75`} />
                <span
                  className={`text-[11px] font-semibold tracking-tight ${activeTheme.subText}`}
                >
                  {isSnappedFree
                    ? "Koptu • Bırakın"
                    : isTearing
                    ? "Çekin..."
                    : "Yeni Post-it"}
                </span>
              </div>

              <div className="flex items-center gap-1" data-no-drag="true">
                <button
                  type="button"
                  onClick={handleQuickPin}
                  title="Masaüstüne Yapıştır"
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${activeTheme.accentBg} ${activeTheme.text} hover:brightness-95 active:scale-95 transition cursor-pointer shadow-2xs`}
                >
                  <span>Yapıştır</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Live Markdown Editor Body */}
            <div className="flex-1 p-3 pb-1.5 flex flex-col overflow-hidden" data-no-drag="true">
              <MarkdownEditor
                resetKey={draft.sheetId}
                value={draft.text}
                onChange={(html) => onUpdateDraft({ text: html })}
                placeholder="Notunuzu yazın (**kalın**, *italik*, ~~çizili~~) ve çekip koparın..."
                textClass={activeTheme.text}
                placeholderClass={activeTheme.placeholder}
              />
            </div>

            {/* Bottom Bar: Only the 6 Post-it Color Swatches (no color text on right) */}
            <div
              data-no-drag="true"
              className="px-3 pb-2.5 pt-1 flex items-center justify-start"
            >
              <div className="flex items-center gap-1.5">
                {COLOR_LIST.map((c) => {
                  const isSelected = c.id === draft.color;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => onUpdateDraft({ color: c.id })}
                      className={`w-3.5 h-3.5 rounded-full ${c.swatch} border border-black/20 transition-transform duration-150 cursor-pointer ${
                        isSelected
                          ? "scale-125 ring-2 ring-neutral-900/75 shadow-xs"
                          : "hover:scale-110 opacity-85 hover:opacity-100"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
