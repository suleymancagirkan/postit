import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GripHorizontal, Pin, Monitor, AppWindow } from "lucide-react";
import {
  POSTIT_COLORS,
  COLOR_LIST,
  NOTE_SIZE_LIMITS,
  clampNoteSize,
} from "../hooks/useNotesStore";

export default function PinnedNote({
  note,
  isVisibleOnScreen = true,
  onUpdate,
  onToggleScreenPin,
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
  const [isOverTrashLocal, setIsOverTrashLocal] = useState(false);
  const [pinPulse, setPinPulse] = useState(false);

  const dragMetaRef = useRef(null);
  const resizeMetaRef = useRef(null);
  const cardRef = useRef(null);

  const theme = POSTIT_COLORS[note.color] || POSTIT_COLORS.yellow;
  const isPinnedToScreen = Boolean(note.pinnedTarget);
  const pinnedLabel = note.pinnedTarget?.label || "Masaüstü";
  const isDesktopTarget = note.pinnedTarget?.targetType === "desktop";

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

  // If the note hides while hovered, notify parent so click-through can re-engage
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

      if (dropStatus?.droppedInTrash) {
        setIsBeingDeleted(true);
        setTimeout(() => {
          onDelete?.(note.id);
        }, 230);
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
  }, [isDragging, note.id, liveSize.width, liveSize.height, onUpdate, onDelete, onDragStateChange]);

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
              scale: isDragging ? (isOverTrashLocal ? 0.86 : 1.05) : 1,
              rotate:
                isDragging || isResizing
                  ? isOverTrashLocal
                    ? 12
                    : 0
                  : note.rotation || 0,
              opacity: isOverTrashLocal ? 0.85 : 1,
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
      {/* Top-Center Tactile Push-Pin (Raptiye) Button */}
      <div
        data-no-drag="true"
        className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
      >
        <motion.button
          type="button"
          onClick={handleCenterPinClick}
          animate={
            pinPulse
              ? { scale: [1, 0.82, 1.18, 1], y: [0, 3, -1, 0] }
              : {
                  scale: isPinnedToScreen ? 1 : 0.96,
                  y: isPinnedToScreen ? 2 : 0,
                }
          }
          transition={{ duration: 0.25 }}
          title={
            isPinnedToScreen
              ? `${pinnedLabel} ekranına sabitlendi (Kaldırmak için tıkla)`
              : "Bulunduğu ekrana/pencereye sabitle (Sadece o ekranda görünür)"
          }
          className={`group relative flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
            isPinnedToScreen
              ? "bg-neutral-900 text-white border-neutral-700 shadow-[0_6px_14px_rgba(0,0,0,0.38)]"
              : `${theme.stripBg} ${theme.text} ${theme.border} shadow-md hover:bg-neutral-900 hover:text-white hover:border-neutral-700`
          }`}
        >
          {/* Pin Head Visual */}
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              isPinnedToScreen
                ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                : "bg-neutral-800/40 group-hover:bg-amber-300"
            }`}
          />
          <Pin
            className={`w-3 h-3 transition-transform duration-200 ${
              isPinnedToScreen
                ? "rotate-0 fill-current text-amber-300"
                : "rotate-45 opacity-80 group-hover:rotate-12"
            }`}
          />
          {isPinnedToScreen && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-tight max-w-[92px] truncate">
              {isDesktopTarget ? (
                <Monitor className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
              ) : (
                <AppWindow className="w-2.5 h-2.5 text-sky-300 shrink-0" />
              )}
              <span className="truncate">{pinnedLabel}</span>
            </span>
          )}
        </motion.button>

        {/* Subtle pin needle hole shadow on paper when pinned */}
        {isPinnedToScreen && (
          <div className="w-2 h-1 rounded-full bg-black/25 blur-[0.5px] -mt-0.5 pointer-events-none" />
        )}
      </div>

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

      {/* Editable Note Content */}
      <div className="flex-1 p-3 pb-1.5 flex flex-col" data-no-drag="true">
        <textarea
          value={note.text}
          onFocus={() => onBringToFront?.(note.id)}
          onChange={(e) => onUpdate?.(note.id, { text: e.target.value })}
          placeholder="Not yazmak için tıklayın..."
          className={`w-full h-full resize-none bg-transparent border-0 outline-none ${theme.text} ${theme.placeholder} text-[13.5px] leading-relaxed font-medium postit-scroll select-text`}
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
