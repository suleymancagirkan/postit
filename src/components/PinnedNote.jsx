import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { GripHorizontal, Palette, Check } from "lucide-react";
import { POSTIT_COLORS, COLOR_LIST } from "../hooks/useNotesStore";

export default function PinnedNote({
  note,
  onUpdate,
  onDelete,
  onBringToFront,
  onDragStateChange,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [livePos, setLivePos] = useState({ x: note.x, y: note.y });
  const [isBeingDeleted, setIsBeingDeleted] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [isOverTrashLocal, setIsOverTrashLocal] = useState(false);

  const dragMetaRef = useRef(null);
  const cardRef = useRef(null);

  const theme = POSTIT_COLORS[note.color] || POSTIT_COLORS.yellow;

  // Keep livePos synced when note coordinates change externally
  useEffect(() => {
    if (!isDragging) {
      setLivePos({ x: note.x, y: note.y });
    }
  }, [note.x, note.y, isDragging]);

  const handlePointerDown = (e) => {
    onBringToFront?.(note.id);

    // Allow normal editing/clicking inside textarea or buttons
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
    setShowPalette(false);

    onDragStateChange?.({
      isDragging: true,
      source: "note",
      noteId: note.id,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      if (!dragMetaRef.current) return;
      const dx = e.clientX - dragMetaRef.current.startClientX;
      const dy = e.clientY - dragMetaRef.current.startClientY;

      const nextX = Math.max(
        8,
        Math.min(window.innerWidth - 250, Math.round(dragMetaRef.current.initialX + dx))
      );
      const nextY = Math.max(
        8,
        Math.min(window.innerHeight - 250, Math.round(dragMetaRef.current.initialY + dy))
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
        Math.min(window.innerWidth - 250, Math.round(dragMetaRef.current.initialX + dx))
      );
      const finalY = Math.max(
        8,
        Math.min(window.innerHeight - 250, Math.round(dragMetaRef.current.initialY + dy))
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
        // Animate shrinking and being sucked into the bottom-right trash dock
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
  }, [isDragging, note.id, onUpdate, onDelete, onDragStateChange]);

  return (
    <motion.div
      ref={cardRef}
      data-interactive="true"
      onMouseEnter={onInteractiveEnter}
      onMouseLeave={onInteractiveLeave}
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
          : {
              x: livePos.x,
              y: livePos.y,
              scale: isDragging ? (isOverTrashLocal ? 0.86 : 1.05) : 1,
              rotate: isDragging ? (isOverTrashLocal ? 12 : 0) : note.rotation || 0,
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
        zIndex: isDragging ? 9999 : note.zIndex || 20,
        left: 0,
        top: 0,
      }}
      className={`fixed w-64 h-64 rounded-3xl ${theme.bodyBg} ${theme.border} border-2 paper-texture flex flex-col justify-between select-none transition-colors duration-200 ${
        isDragging
          ? "shadow-[0_28px_60px_-12px_rgba(0,0,0,0.42)] cursor-grabbing ring-2 ring-black/10"
          : "shadow-[0_14px_28px_-6px_rgba(0,0,0,0.26)] cursor-grab hover:shadow-[0_18px_36px_-8px_rgba(0,0,0,0.32)]"
      }`}
    >
      {/* Top Adhesive Strip */}
      <div
        className={`h-10 w-full rounded-t-[22px] ${theme.stripBg} border-b ${theme.border} px-3.5 flex items-center justify-between transition-colors duration-200`}
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal className={`w-4 h-4 ${theme.subText} opacity-75`} />
          <span className={`text-[11px] font-semibold ${theme.subText} opacity-85`}>
            Post-it
          </span>
        </div>

        {/* Color Picker Toggle Button */}
        <div className="relative" data-no-drag="true">
          <button
            type="button"
            title="Kağıt Rengini Değiştir"
            onClick={() => setShowPalette((prev) => !prev)}
            className={`p-1.5 rounded-full ${theme.accentBg} ${theme.text} hover:brightness-95 active:scale-95 transition cursor-pointer`}
          >
            <Palette className="w-3.5 h-3.5" />
          </button>

          {showPalette && (
            <div
              data-no-drag="true"
              className="absolute right-0 top-8 z-50 flex items-center gap-1.5 bg-neutral-900/95 px-2.5 py-1.5 rounded-2xl shadow-xl border border-white/15"
            >
              {COLOR_LIST.map((c) => {
                const active = c.id === note.color;
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => {
                      onUpdate?.(note.id, { color: c.id });
                      setShowPalette(false);
                    }}
                    className={`w-4.5 h-4.5 rounded-full ${c.swatch} flex items-center justify-center transition-transform cursor-pointer ${
                      active ? "scale-120 ring-2 ring-white" : "hover:scale-110 opacity-90"
                    }`}
                  >
                    {active && <Check className="w-2.5 h-2.5 text-neutral-900 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editable Note Content */}
      <div className="flex-1 p-3.5 pb-2 flex flex-col" data-no-drag="true">
        <textarea
          value={note.text}
          onFocus={() => onBringToFront?.(note.id)}
          onChange={(e) => onUpdate?.(note.id, { text: e.target.value })}
          placeholder="Not yazmak için tıklayın..."
          className={`w-full h-full resize-none bg-transparent border-0 outline-none ${theme.text} ${theme.placeholder} text-[14.5px] leading-relaxed font-medium postit-scroll select-text`}
        />
      </div>

      {/* Bottom Quick Color Dots & Subtle Fold Corner */}
      <div
        data-no-drag="true"
        className="px-3.5 pb-3 pt-1 flex items-center justify-between"
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

        <span className={`text-[10px] font-medium ${theme.subText} opacity-65`}>
          {theme.label}
        </span>
      </div>
    </motion.div>
  );
}
