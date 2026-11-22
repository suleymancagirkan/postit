import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUpRight, GripHorizontal, Layers } from "lucide-react";
import { POSTIT_COLORS, COLOR_LIST } from "../hooks/useNotesStore";

const STACK_ORIGIN = { x: 36, y: 36 };
const TEAR_DISTANCE_THRESHOLD = 85;

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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);

  const dragStartRef = useRef(null);
  const textareaRef = useRef(null);
  const stackContainerRef = useRef(null);

  const activeTheme = POSTIT_COLORS[draft.color] || POSTIT_COLORS.yellow;

  // Distance dragged from stack origin
  const dragDistance = Math.hypot(dragOffset.x, dragOffset.y);
  const isTornLoose = isTearing && dragDistance > TEAR_DISTANCE_THRESHOLD;

  const handlePointerDown = (e) => {
    // Do not start drag if clicking color buttons, textarea, or action buttons
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
    const grabOffsetX = rect ? startClientX - rect.left : 130;
    const grabOffsetY = rect ? startClientY - rect.top : 24;

    dragStartRef.current = {
      startClientX,
      startClientY,
      grabOffsetX,
      grabOffsetY,
    };

    setIsTearing(true);
    setDragOffset({ x: 0, y: 0 });
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
      setDragOffset({ x: dx, y: dy });

      onDragStateChange?.({
        isDragging: true,
        source: "stack",
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };

    const handlePointerUp = (e) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startClientX;
      const dy = e.clientY - dragStartRef.current.startClientY;
      const dist = Math.hypot(dx, dy);

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
        // Sucked into trash dock
        setIsDiscarding(true);
        setTimeout(() => {
          onDiscardDraft?.();
          setIsDiscarding(false);
          setIsTearing(false);
          setDragOffset({ x: 0, y: 0 });
        }, 220);
      } else if (dist > TEAR_DISTANCE_THRESHOLD) {
        // Torn off from stack and pinned at (finalX, finalY)
        onTearOffPin?.({
          x: finalX,
          y: finalY,
          text: draft.text,
          color: draft.color,
        });
        setIsTearing(false);
        setDragOffset({ x: 0, y: 0 });
      } else {
        // Snap back to stack
        setIsTearing(false);
        setDragOffset({ x: 0, y: 0 });
      }

      dragStartRef.current = null;
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
    const targetX = Math.min(window.innerWidth - 300, 340 + offsetIndex * 36);
    const targetY = Math.min(window.innerHeight - 300, 56 + offsetIndex * 28);
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
      style={{ left: STACK_ORIGIN.x, top: STACK_ORIGIN.y }}
      className="fixed z-30 w-64 h-64 select-none"
    >
      {/* Stack Header Badge */}
      <div className=" -top-7 left-1 flex items-center justify-between w-64 px-1 mb-1.5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-900/85 text-white text-[11px] font-medium tracking-wide shadow-md">
          <Layers className="w-3 h-3 text-amber-300" />
          <span>Post-it Destesi</span>
          {pinnedCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-semibold">
              {pinnedCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium text-neutral-800 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">
          Koparmak için sürükle
        </span>
      </div>

      <div className="relative w-64 h-64">
        {/* Bottom-most sheet in the stack (-3deg) */}
        <div
          style={{ transform: "rotate(-3deg) translate(-3px, 5px)" }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-lg paper-texture pointer-events-none transition-colors duration-300`}
        >
          <div
            className={`h-9 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} opacity-90`}
          />
        </div>

        {/* Second sheet in the stack (1.5deg) */}
        <div
          style={{ transform: "rotate(1.5deg) translate(3px, 2px)" }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-lg paper-texture pointer-events-none transition-colors duration-300`}
        >
          <div
            className={`h-9 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} opacity-95`}
          />
        </div>

        {/* Underlying fresh sheet that springs up when tearing off the top sheet */}
        <motion.div
          initial={false}
          animate={{
            scale: isTearing ? (isTornLoose ? 1 : 0.96) : 0.93,
            y: isTearing ? (isTornLoose ? 0 : 4) : 8,
            rotate: isTearing ? 0 : -1,
            opacity: isTearing ? 1 : 0.7,
          }}
          transition={{ type: "spring", stiffness: 360, damping: 24 }}
          className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 shadow-xl paper-texture pointer-events-none`}
        >
          <div
            className={`h-10 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} flex items-center justify-between px-3.5`}
          >
            <div className="flex items-center gap-1.5 opacity-60">
              <Sparkles className={`w-3.5 h-3.5 ${activeTheme.subText}`} />
              <span className={`text-[11px] font-semibold ${activeTheme.subText}`}>
                Yeni Yaprak Hazır
              </span>
            </div>
          </div>
          <div className="p-4">
            <p className={`text-sm ${activeTheme.subText} opacity-45 italic`}>
              Bir sonraki notunuz için yeni yaprak...
            </p>
          </div>
        </motion.div>

        {/* Active Top Sheet (0deg at rest, scales & deepens shadow when torn off) */}
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
                    x: dragOffset.x,
                    y: dragOffset.y,
                    scale: isTornLoose ? 1.06 : isTearing ? 1.03 : 1,
                    rotate: isTearing
                      ? Math.max(-8, Math.min(8, dragOffset.x * 0.035))
                      : 0,
                    opacity: 1,
                  }
            }
            transition={
              isTearing
                ? { type: "tween", duration: 0 }
                : { type: "spring", stiffness: 380, damping: 26 }
            }
            className={`absolute inset-0 rounded-3xl ${activeTheme.bodyBg} ${activeTheme.border} border-2 paper-texture flex flex-col justify-between transition-shadow duration-200 ${
              isTornLoose
                ? "shadow-[0_28px_60px_-12px_rgba(0,0,0,0.42)] ring-2 ring-black/10"
                : "shadow-[0_14px_30px_-8px_rgba(0,0,0,0.25)]"
            } ${isTearing ? "cursor-grabbing z-50" : "cursor-grab"}`}
          >
            {/* Top Adhesive Strip */}
            <div
              className={`h-10 w-full rounded-t-[22px] ${activeTheme.stripBg} border-b ${activeTheme.border} px-3.5 flex items-center justify-between transition-colors duration-200`}
            >
              <div className="flex items-center gap-1.5">
                <GripHorizontal className={`w-4 h-4 ${activeTheme.subText} opacity-75`} />
                <span
                  className={`text-[11px] font-semibold tracking-tight ${activeTheme.subText}`}
                >
                  {isTornLoose ? "Bırak ve Yapıştır" : "Yeni Post-it"}
                </span>
              </div>

              {/* Quick Pin Button & Color Swatch Trigger */}
              <div className="flex items-center gap-1.5" data-no-drag="true">
                <button
                  type="button"
                  onClick={handleQuickPin}
                  title="Masaüstüne Yapıştır"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${activeTheme.accentBg} ${activeTheme.text} hover:brightness-95 active:scale-95 transition cursor-pointer shadow-2xs`}
                >
                  <span>Yapıştır</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Textarea Body */}
            <div className="flex-1 p-3.5 pb-2 flex flex-col" data-no-drag="true">
              <textarea
                ref={textareaRef}
                value={draft.text}
                onChange={(e) => onUpdateDraft({ text: e.target.value })}
                placeholder="Notunuzu buraya yazın ve kağıdı desteden tutup ekrana sürükleyin..."
                className={`w-full h-full resize-none bg-transparent border-0 outline-none ${activeTheme.text} ${activeTheme.placeholder} text-[14.5px] leading-relaxed font-medium postit-scroll select-text`}
              />
            </div>

            {/* Bottom Bar: 6 Post-it Color Selector */}
            <div
              data-no-drag="true"
              className="px-3.5 pb-3 pt-1 flex items-center justify-between"
            >
              <div className="flex items-center gap-1.5">
                {COLOR_LIST.map((c) => {
                  const isSelected = c.id === draft.color;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        onUpdateDraft({ color: c.id });
                        setShowColorMenu(false);
                      }}
                      className={`w-4 h-4 rounded-full ${c.swatch} border border-black/20 transition-transform duration-150 cursor-pointer ${
                        isSelected
                          ? "scale-125 ring-2 ring-neutral-900/75 shadow-xs"
                          : "hover:scale-110 opacity-85 hover:opacity-100"
                      }`}
                    />
                  );
                })}
              </div>

              <span className={`text-[10px] font-semibold ${activeTheme.subText} opacity-75`}>
                {activeTheme.label}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
