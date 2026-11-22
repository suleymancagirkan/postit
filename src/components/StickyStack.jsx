import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, GripHorizontal, Minus } from "lucide-react";
import { POSTIT_COLORS, COLOR_LIST, NOTE_SIZE_LIMITS } from "../hooks/useNotesStore";
import MarkdownEditor from "./MarkdownEditor";
import { CrumpledPaperCreases } from "./PinnedNote";

const CRUMPLED_CLIP_PATH =
  "polygon(14% 6%, 39% 1%, 66% 5%, 89% 13%, 98% 36%, 93% 67%, 85% 91%, 59% 98%, 31% 94%, 11% 85%, 2% 58%, 5% 27%)";
const NORMAL_CLIP_PATH =
  "polygon(0% 0%, 50% 0%, 100% 0%, 100% 25%, 100% 50%, 100% 75%, 100% 100%, 50% 100%, 25% 100%, 0% 100%, 0% 50%, 0% 25%)";

const DEFAULT_STACK_ORIGIN = { x: 36, y: 36 };
const STORAGE_KEY_STACK_POS = "postit_desktop_stack_pos_v1";
// Magnetic pull break distance: inside this radius the sheet resists like a magnet;
// beyond it, the magnetic bond snaps and the card leaps free to the cursor.
const MAGNET_BREAK_DISTANCE = 115;
const MAGNET_RECAPTURE_DISTANCE = 48;

export default function StickyStack({
  draft,
  onUpdateDraft,
  onTearOffPin,
  onDiscardDraft,
  onMinimizeStack,
  onDragStateChange,
  onInteractiveEnter,
  onInteractiveLeave,
  pinnedCount = 0,
}) {
  const [isTearing, setIsTearing] = useState(false);
  const [rawOffset, setRawOffset] = useState({ x: 0, y: 0 });
  const [isSnappedFree, setIsSnappedFree] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isOverTrashLocal, setIsOverTrashLocal] = useState(false);
  const [isOverBasketLocal, setIsOverBasketLocal] = useState(false);

  // Moving the entire stack by dragging the top-left 6-dot grip icon
  const [stackPos, setStackPos] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STACK_POS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_STACK_ORIGIN;
  });
  const [isMovingStack, setIsMovingStack] = useState(false);
  const stackMoveStartRef = useRef(null);

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

      const status = onDragStateChange?.({
        isDragging: true,
        source: "stack",
        clientX: e.clientX,
        clientY: e.clientY,
      });
      setIsOverTrashLocal(Boolean(status?.isOverTrash));
      setIsOverBasketLocal(Boolean(status?.isOverBasket));
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
          setIsOverTrashLocal(false);
          setIsOverBasketLocal(false);
          setIsTearing(false);
          setIsSnappedFree(false);
          setRawOffset({ x: 0, y: 0 });
        }, 260);
      } else if (dropResult?.droppedInBasket) {
        setIsOverTrashLocal(false);
        setIsOverBasketLocal(false);
        onTearOffPin?.({
          x: 340,
          y: 120,
          text: draft.text,
          color: draft.color,
          inBasket: true,
        });
        setIsTearing(false);
        setIsSnappedFree(false);
        setRawOffset({ x: 0, y: 0 });
      } else if (snappedFreeRef.current) {
        setIsOverTrashLocal(false);
        setIsOverBasketLocal(false);
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
        setIsOverTrashLocal(false);
        setIsOverBasketLocal(false);
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

  // Dragging from the 6-dot grip icon moves the entire stack
  const handleStackGripPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    stackMoveStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX: stackPos.x,
      initialY: stackPos.y,
    };
    setIsMovingStack(true);
  };

  useEffect(() => {
    if (!isMovingStack) return;

    const handlePointerMove = (e) => {
      if (!stackMoveStartRef.current) return;
      const dx = e.clientX - stackMoveStartRef.current.startClientX;
      const dy = e.clientY - stackMoveStartRef.current.startClientY;

      const nextX = Math.max(
        12,
        Math.min(
          window.innerWidth - cardSize - 12,
          Math.round(stackMoveStartRef.current.initialX + dx)
        )
      );
      const nextY = Math.max(
        12,
        Math.min(
          window.innerHeight - cardSize - 12,
          Math.round(stackMoveStartRef.current.initialY + dy)
        )
      );

      setStackPos({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      setIsMovingStack(false);
      stackMoveStartRef.current = null;
      try {
        localStorage.setItem(STORAGE_KEY_STACK_POS, JSON.stringify(stackPos));
      } catch {
        // ignore
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isMovingStack, cardSize, stackPos]);

  const handleMinimizeToTray = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onInteractiveLeave?.();
    onMinimizeStack?.();
  };

  return (
    <div
      ref={stackContainerRef}
      data-interactive="true"
      onMouseEnter={onInteractiveEnter}
      onMouseLeave={onInteractiveLeave}
      style={{
        left: stackPos.x,
        top: stackPos.y,
        width: cardSize,
        height: cardSize,
      }}
      className="fixed z-30 select-none"
    >
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
                    x: window.innerWidth - stackPos.x - 155,
                    y: window.innerHeight - stackPos.y - 165,
                    scale: 0.16,
                    rotate: 160,
                    opacity: 0,
                  }
                : {
                    x: visualOffset.x,
                    y: visualOffset.y,
                    scale: isOverTrashLocal
                      ? 0.52
                      : isOverBasketLocal
                      ? 0.75
                      : isSnappedFree
                      ? 1.07
                      : isTearing
                      ? 1 - magnetTension * 0.035
                      : 1,
                    rotate: isOverTrashLocal
                      ? 24
                      : isOverBasketLocal
                      ? -8
                      : isTearing
                      ? Math.max(-10, Math.min(10, visualOffset.x * 0.045))
                      : 0,
                    opacity: 1,
                  }
            }
            transition={
              isTearing
                ? {
                    x: { type: "spring", stiffness: 620, damping: 32, mass: 0.5 },
                    y: { type: "spring", stiffness: 620, damping: 32, mass: 0.5 },
                    scale: { type: "spring", stiffness: 450, damping: 22 },
                    rotate: { type: "spring", stiffness: 420, damping: 24 },
                  }
                : { type: "spring", stiffness: 420, damping: 25 }
            }
            style={{
              clipPath:
                isOverTrashLocal || isDiscarding
                  ? CRUMPLED_CLIP_PATH
                  : "none",
            }}
            className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 paper-texture flex flex-col justify-between transition-shadow duration-200 ${
              isSnappedFree
                ? "shadow-[0_28px_60px_-10px_rgba(0,0,0,0.45)] ring-2 ring-black/10"
                : "shadow-[0_14px_30px_-8px_rgba(0,0,0,0.25)]"
            } ${isTearing ? "cursor-grabbing z-50" : "cursor-grab"}`}
          >
            <CrumpledPaperCreases isCrumpled={isOverTrashLocal || isDiscarding} />
            {/* Top Adhesive Strip: Left 6-dot icon moves the stack, middle empty area tears off top sheet, right minus minimizes stack */}
            <div
              className={`h-9 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} px-3 flex items-center justify-between transition-colors duration-200`}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-no-drag="true"
                  onPointerDown={handleStackGripPointerDown}
                  title="Yığının tamamını taşımak için basılı tutup sürükleyin"
                  className={`p-1 -ml-1 rounded-lg hover:bg-black/10 active:scale-95 transition ${
                    isMovingStack ? "cursor-grabbing bg-black/15" : "cursor-move"
                  }`}
                >
                  <GripHorizontal className={`w-4 h-4 ${activeTheme.subText} opacity-80`} />
                </button>
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
                  onClick={handleMinimizeToTray}
                  title="Yığını Gizle"
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${activeTheme.accentBg} ${activeTheme.text} hover:brightness-95 active:scale-95 transition cursor-pointer shadow-2xs`}
                >
                  <Minus className="w-3 h-3" />
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
