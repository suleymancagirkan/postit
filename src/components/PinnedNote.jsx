import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import {
  POSTIT_COLORS,
  COLOR_LIST,
  NOTE_SIZE_LIMITS,
  clampNoteSize,
} from "../hooks/useNotesStore";
import MarkdownEditor from "./MarkdownEditor";

/**
 * 2.5D Red-Headed & Grey-Metallic Push-Pin (Raptiye) SVG Component
 * - Unpinned: hovers tilted above the paper showing the full sharp metallic needle.
 * - Pinned: plunges into the paper, hiding the lower needle tip inside the puncture hole
 *   and casting a realistic contact shadow on the paper surface.
 */
function RealisticThumbtack({ isPinned, pinPulse, targetLabel }) {
  return (
    <div className="group relative flex flex-col items-center select-none">
      {/* Hover-only subtle tooltip so there is no permanent box around the pin */}
      <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900/90 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
        {isPinned ? `📌 ${targetLabel} (Çıkarmak için tıkla)` : "Bu ekrana sapla"}
      </div>

      {/* Contact / Floating Shadow on the Paper */}
      <motion.div
        initial={false}
        animate={
          isPinned
            ? {
                width: 14,
                height: 6,
                y: 25,
                x: 2,
                opacity: 0.42,
                scale: 1,
              }
            : {
                width: 18,
                height: 6,
                y: 29,
                x: 7,
                opacity: 0.22,
                scale: 0.85,
              }
        }
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        className="pointer-events-none absolute rounded-full bg-black blur-[1.5px]"
      />

      {/* Puncture hole on the paper when the needle is pushed in */}
      {isPinned && (
        <div
          style={{ top: 25 }}
          className="pointer-events-none absolute w-1.5 h-1.5 rounded-full bg-neutral-950/75 ring-1 ring-black/20"
        />
      )}

      {/* 2.5D Thumbtack Body */}
      <motion.div
        initial={false}
        animate={
          pinPulse
            ? {
                y: isPinned ? [-8, 5, 2] : [2, -10, -6],
                rotate: isPinned ? [24, -6, -3] : [-3, 28, 24],
                scale: [1, 0.92, 1.06, 1],
              }
            : isPinned
            ? {
                y: 3,
                x: 0,
                rotate: -3,
                scale: 1,
              }
            : {
                y: -6,
                x: 3,
                rotate: 24,
                scale: 0.96,
              }
        }
        transition={{ type: "spring", stiffness: 450, damping: 22 }}
        className="relative z-10 drop-shadow-[0_3px_4px_rgba(0,0,0,0.3)] group-hover:scale-105 transition-transform"
      >
        <svg
          width="30"
          height="34"
          viewBox="0 0 30 34"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="overflow-visible"
        >
          <defs>
            {/* Metallic Grey Needle Gradient */}
            <linearGradient id="metalNeedle" x1="13" y1="18" x2="17" y2="33" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#64748B" />
              <stop offset="35%" stopColor="#F1F5F9" />
              <stop offset="65%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* Metallic Collar Ring under the plastic body */}
            <linearGradient id="metalCollar" x1="10" y1="18" x2="20" y2="21" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#94A3B8" />
              <stop offset="50%" stopColor="#F8FAFC" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>

            {/* 3D Red Plastic Lower Flange / Skirt */}
            <linearGradient id="redFlange" x1="6" y1="13" x2="24" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="35%" stopColor="#E11D48" />
              <stop offset="85%" stopColor="#9F1239" />
              <stop offset="100%" stopColor="#881337" />
            </linearGradient>

            {/* 3D Red Plastic Middle Neck */}
            <linearGradient id="redNeck" x1="10" y1="7" x2="20" y2="16" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="45%" stopColor="#BE123C" />
              <stop offset="100%" stopColor="#881337" />
            </linearGradient>

            {/* 3D Red Plastic Top Cap Dome */}
            <radialGradient
              id="redTopCap"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(12.5 5.5) rotate(35) scale(10 7)"
            >
              <stop offset="0%" stopColor="#FFE4E6" />
              <stop offset="22%" stopColor="#FB7185" />
              <stop offset="65%" stopColor="#E11D48" />
              <stop offset="100%" stopColor="#881337" />
            </radialGradient>
          </defs>

          {/* Grey Steel Needle (Shorter when plunged into the paper, full sharp point when unpinned) */}
          {isPinned ? (
            <path
              d="M13.7 19.5 L16.3 19.5 L15.6 25.2 C15.4 25.8 14.6 25.8 14.4 25.2 Z"
              fill="url(#metalNeedle)"
            />
          ) : (
            <path
              d="M13.5 19.5 L16.5 19.5 L15.35 32.2 C15.2 33.1 14.8 33.1 14.65 32.2 Z"
              fill="url(#metalNeedle)"
            />
          )}

          {/* Needle Specular Highlight Line */}
          <line
            x1="14.7"
            y1="20"
            x2="14.9"
            y2={isPinned ? "24.8" : "30.8"}
            stroke="#FFFFFF"
            strokeWidth="0.65"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />

          {/* Metallic Grey Base Collar */}
          <ellipse cx="15" cy="19.2" rx="4.2" ry="1.4" fill="url(#metalCollar)" />

          {/* Lower Wide Red Plastic Flange (Base Skirt) */}
          <path
            d="M7.2 16.2 C7.2 13.6 10.6 12.2 15 12.2 C19.4 12.2 22.8 13.6 22.8 16.2 C22.8 18.2 19.5 19.5 15 19.5 C10.5 19.5 7.2 18.2 7.2 16.2 Z"
            fill="url(#redFlange)"
          />
          {/* Flange Rim Highlight */}
          <path
            d="M8.4 15.8 C9.8 17.3 12.3 18 15 18 C17.7 18 20.2 17.3 21.6 15.8"
            stroke="#FDA4AF"
            strokeWidth="0.7"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />

          {/* Tapered Cylinder Neck */}
          <path
            d="M10.8 7.5 L19.2 7.5 L20.4 15.2 C20.4 16.6 18 17.5 15 17.5 C12 17.5 9.6 16.6 9.6 15.2 Z"
            fill="url(#redNeck)"
          />

          {/* Neck Left Specular Reflection */}
          <path
            d="M11.6 8.3 L11.0 14.8"
            stroke="#FECDD3"
            strokeWidth="1.1"
            strokeOpacity="0.45"
            strokeLinecap="round"
          />

          {/* Top Red Cap Head (3D Dome/Disk) */}
          <ellipse cx="15" cy="6.8" rx="6.6" ry="3.6" fill="url(#redTopCap)" />

          {/* Top Cap Glossy Specular Highlight */}
          <ellipse
            cx="12.6"
            cy="5.4"
            rx="2.8"
            ry="1.15"
            transform="rotate(-10 12.6 5.4)"
            fill="#FFFFFF"
            fillOpacity="0.65"
          />
        </svg>
      </motion.div>
    </div>
  );
}

export default function PinnedNote({
  note,
  isVisibleOnScreen = true,
  onUpdate,
  onToggleScreenPin,
  onStashToBasket,
  onDelete,
  onBringToFront,
  onDragStateChange,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [livePos, setLivePos] = useState({ x: note.x, y: note.y });
  const [liveSize, setLiveSize] = useState({
    width: clampNoteSize(note.width),
    height: clampNoteSize(note.height),
  });
  const [isBeingDeleted, setIsBeingDeleted] = useState(false);
  const [isBeingStashed, setIsBeingStashed] = useState(false);
  const [isOverTrashLocal, setIsOverTrashLocal] = useState(false);
  const [isOverBasketLocal, setIsOverBasketLocal] = useState(false);
  const [pinPulse, setPinPulse] = useState(false);

  const dragMetaRef = useRef(null);
  const resizeMetaRef = useRef(null);
  const cardRef = useRef(null);

  const theme = POSTIT_COLORS[note.color] || POSTIT_COLORS.yellow;
  const isPinnedToScreen = Boolean(note.pinnedTarget);
  const pinnedLabel = note.pinnedTarget?.label || "Masaüstü";

  useEffect(() => {
    if (!isDragging) {
      setLivePos({ x: note.x, y: note.y });
    }
  }, [note.x, note.y, isDragging]);

  useEffect(() => {
    if (!isResizing) {
      setLiveSize({
        width: clampNoteSize(note.width),
        height: clampNoteSize(note.height),
      });
    }
  }, [note.width, note.height, isResizing]);

  useEffect(() => {
    if (!isVisibleOnScreen) {
      onInteractiveLeave?.();
    }
  }, [isVisibleOnScreen, onInteractiveLeave]);

  const handlePointerDown = (e) => {
    if (!isVisibleOnScreen) return;
    onBringToFront?.(note.id);

    if (
      e.target.closest("[data-no-drag='true']") ||
      e.target.tagName.toLowerCase() === "textarea" ||
      e.target.tagName.toLowerCase() === "button"
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    dragMetaRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialX: livePos.x,
      initialY: livePos.y,
    };

    setIsDragging(true);

    onDragStateChange?.({
      isDragging: true,
      source: "note",
      noteId: note.id,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  const handleResizePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onBringToFront?.(note.id);

    resizeMetaRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialWidth: liveSize.width,
      initialHeight: liveSize.height,
    };

    setIsResizing(true);
  };

  const handleCenterPinClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPinPulse(true);
    setTimeout(() => setPinPulse(false), 320);
    await onToggleScreenPin?.(note);
  };

  // Drag position effect
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      if (!dragMetaRef.current) return;
      const dx = e.clientX - dragMetaRef.current.startClientX;
      const dy = e.clientY - dragMetaRef.current.startClientY;

      const nextX = Math.max(
        8,
        Math.min(
          window.innerWidth - liveSize.width - 8,
          Math.round(dragMetaRef.current.initialX + dx)
        )
      );
      const nextY = Math.max(
        8,
        Math.min(
          window.innerHeight - liveSize.height - 8,
          Math.round(dragMetaRef.current.initialY + dy)
        )
      );

      setLivePos({ x: nextX, y: nextY });

      const status = onDragStateChange?.({
        isDragging: true,
        source: "note",
        noteId: note.id,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      setIsOverTrashLocal(Boolean(status?.isOverTrash));
      setIsOverBasketLocal(Boolean(status?.isOverBasket));
    };

    const handlePointerUp = (e) => {
      if (!dragMetaRef.current) return;
      const dx = e.clientX - dragMetaRef.current.startClientX;
      const dy = e.clientY - dragMetaRef.current.startClientY;

      const finalX = Math.max(
        8,
        Math.min(
          window.innerWidth - liveSize.width - 8,
          Math.round(dragMetaRef.current.initialX + dx)
        )
      );
      const finalY = Math.max(
        8,
        Math.min(
          window.innerHeight - liveSize.height - 8,
          Math.round(dragMetaRef.current.initialY + dy)
        )
      );

      const dropStatus = onDragStateChange?.({
        isDragging: false,
        source: "note",
        noteId: note.id,
        clientX: e.clientX,
        clientY: e.clientY,
        isDrop: true,
      });

      setIsOverTrashLocal(false);
      setIsOverBasketLocal(false);

      if (dropStatus?.droppedInTrash) {
        setIsBeingDeleted(true);
        setTimeout(() => {
          onDelete?.(note.id);
        }, 230);
      } else if (dropStatus?.droppedInBasket) {
        setIsBeingStashed(true);
        setTimeout(() => {
          setIsBeingStashed(false);
          setIsDragging(false);
          onStashToBasket?.(note.id);
        }, 220);
      } else {
        setLivePos({ x: finalX, y: finalY });
        onUpdate?.(note.id, { x: finalX, y: finalY });
        setIsDragging(false);
      }

      dragMetaRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [
    isDragging,
    note.id,
    liveSize.width,
    liveSize.height,
    onUpdate,
    onDelete,
    onStashToBasket,
    onDragStateChange,
  ]);

  // Resize effect
  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (e) => {
      if (!resizeMetaRef.current) return;
      const dx = e.clientX - resizeMetaRef.current.startClientX;
      const dy = e.clientY - resizeMetaRef.current.startClientY;

      const nextWidth = clampNoteSize(resizeMetaRef.current.initialWidth + dx);
      const nextHeight = clampNoteSize(resizeMetaRef.current.initialHeight + dy);

      setLiveSize({ width: nextWidth, height: nextHeight });
    };

    const handlePointerUp = (e) => {
      if (!resizeMetaRef.current) return;
      const dx = e.clientX - resizeMetaRef.current.startClientX;
      const dy = e.clientY - resizeMetaRef.current.startClientY;

      const finalWidth = clampNoteSize(resizeMetaRef.current.initialWidth + dx);
      const finalHeight = clampNoteSize(resizeMetaRef.current.initialHeight + dy);

      setLiveSize({ width: finalWidth, height: finalHeight });
      onUpdate?.(note.id, { width: finalWidth, height: finalHeight });
      setIsResizing(false);
      resizeMetaRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, note.id, onUpdate]);

  const actuallyVisible = isVisibleOnScreen || isDragging || isResizing;

  return (
    <motion.div
      ref={cardRef}
      data-interactive={actuallyVisible ? "true" : "false"}
      onMouseEnter={actuallyVisible ? onInteractiveEnter : undefined}
      onMouseLeave={actuallyVisible ? onInteractiveLeave : undefined}
      onPointerDown={handlePointerDown}
      initial={{ scale: 0.88, opacity: 0 }}
      animate={
        isBeingDeleted
          ? {
              x: window.innerWidth - 110,
              y: window.innerHeight - 110,
              scale: 0.1,
              rotate: 42,
              opacity: 0,
            }
          : isBeingStashed
          ? {
              x: window.innerWidth - 110,
              y: window.innerHeight - 280,
              scale: 0.14,
              rotate: -18,
              opacity: 0,
            }
          : !actuallyVisible
          ? {
              x: livePos.x,
              y: livePos.y + 28,
              scale: 0.78,
              rotate: note.rotation || 0,
              opacity: 0,
            }
          : {
              x: livePos.x,
              y: livePos.y,
              scale: isDragging
                ? isOverTrashLocal || isOverBasketLocal
                  ? 0.86
                  : 1.05
                : 1,
              rotate:
                isDragging || isResizing
                  ? isOverTrashLocal
                    ? 12
                    : isOverBasketLocal
                    ? -8
                    : 0
                  : note.rotation || 0,
              opacity: isOverTrashLocal || isOverBasketLocal ? 0.88 : 1,
            }
      }
      transition={
        isDragging
          ? {
              x: { type: "tween", duration: 0 },
              y: { type: "tween", duration: 0 },
              scale: { type: "spring", stiffness: 400, damping: 26 },
              rotate: { type: "spring", stiffness: 350, damping: 24 },
            }
          : {
              type: "spring",
              stiffness: 380,
              damping: 28,
            }
      }
      style={{
        zIndex: isDragging || isResizing ? 9999 : note.zIndex || 20,
        left: 0,
        top: 0,
        width: liveSize.width,
        height: liveSize.height,
        pointerEvents: actuallyVisible ? "auto" : "none",
      }}
      className={`fixed rounded-3xl ${theme.bodyBg} ${theme.border} border-2 paper-texture flex flex-col justify-between select-none transition-colors duration-200 ${
        isDragging
          ? "shadow-[0_28px_60px_-12px_rgba(0,0,0,0.42)] cursor-grabbing ring-2 ring-black/10"
          : "shadow-[0_14px_28px_-6px_rgba(0,0,0,0.26)] cursor-grab hover:shadow-[0_18px_36px_-8px_rgba(0,0,0,0.32)]"
      }`}
    >
      {/* Top-Center Realistic 2.5D Red-Headed & Metallic Grey Push-Pin (No box/border) */}
      <button
        type="button"
        data-no-drag="true"
        onClick={handleCenterPinClick}
        className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 bg-transparent border-0 p-0 outline-none cursor-pointer"
      >
        <RealisticThumbtack
          isPinned={isPinnedToScreen}
          pinPulse={pinPulse}
          targetLabel={pinnedLabel}
        />
      </button>

      {/* Top Adhesive Strip */}
      <div
        className={`h-9 w-full rounded-t-[22px] ${theme.stripBg} border-b ${theme.border} px-3 flex items-center justify-between transition-colors duration-200`}
      >
        <div className="flex items-center gap-1">
          <GripHorizontal className={`w-3.5 h-3.5 ${theme.subText} opacity-75`} />
        </div>

        {isResizing && (
          <span className={`text-[10px] font-semibold ${theme.subText} opacity-80`}>
            {liveSize.width}×{liveSize.height}
          </span>
        )}
      </div>

      {/* Editable Live Markdown Note Content */}
      <div className="flex-1 p-3 pb-1.5 flex flex-col overflow-hidden" data-no-drag="true">
        <MarkdownEditor
          resetKey={note.id}
          value={note.text}
          onFocus={() => onBringToFront?.(note.id)}
          onChange={(html) => onUpdate?.(note.id, { text: html })}
          placeholder="Not yazın (**kalın**, *italik*, ~~çizili~~)..."
          textClass={theme.text}
          placeholderClass={theme.placeholder}
        />
      </div>

      {/* Bottom Bar: Left Color Dots & Right Resize Handle */}
      <div
        data-no-drag="true"
        className="px-3 pb-2.5 pt-1 flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          {COLOR_LIST.map((c) => {
            const isSelected = c.id === note.color;
            return (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => onUpdate?.(note.id, { color: c.id })}
                className={`w-3.5 h-3.5 rounded-full ${c.swatch} border border-black/20 transition-transform duration-150 cursor-pointer ${
                  isSelected
                    ? "scale-125 ring-2 ring-neutral-900/70"
                    : "hover:scale-110 opacity-75 hover:opacity-100"
                }`}
              />
            );
          })}
        </div>

        {/* Diagonal Corner Resize Handle */}
        <div
          data-no-drag="true"
          onPointerDown={handleResizePointerDown}
          title={`Boyutlandır (${NOTE_SIZE_LIMITS.MIN}px – ${NOTE_SIZE_LIMITS.MAX}px)`}
          className="w-5 h-5 -mr-1 -mb-1 flex items-end justify-end p-1 cursor-nwse-resize opacity-45 hover:opacity-90 transition-opacity"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`${theme.subText} fill-current`}
          >
            <path
              d="M9 1L1 9M9 5L5 9M9 8.5L8.5 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
