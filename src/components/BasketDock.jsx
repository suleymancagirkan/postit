import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  RotateCcw,
  PinOff,
  Pin,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react";
import { POSTIT_COLORS } from "../hooks/useNotesStore";

export const BASKET_ZONE_RADIUS = 145;

export function getBasketTargetCenter() {
  if (typeof window === "undefined") return { x: 1200, y: 500 };
  return {
    x: window.innerWidth - 78,
    y: window.innerHeight - 245,
  };
}

export function isPointInBasketZone(clientX, clientY) {
  if (typeof window === "undefined") return false;
  const center = getBasketTargetCenter();
  const dist = Math.hypot(clientX - center.x, clientY - center.y);
  return dist <= BASKET_ZONE_RADIUS;
}

function stripHtmlPreview(raw = "") {
  if (!raw) return "Boş not...";
  const plain = raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u200B/g, "")
    .trim();
  return plain || "Boş not...";
}

export default function BasketDock({
  isDragging,
  isOverBasket,
  basketNotes = [],
  activeNotesCount = 0,
  isStackMinimized = false,
  onRestoreNote,
  onRestoreAll,
  onStashAll,
  onToggleStackMinimized,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      {/* 1. Drag-target Basket Dock (slides out from the right edge like TrashDock when dragging) */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            data-interactive="true"
            onMouseEnter={onInteractiveEnter}
            onMouseLeave={onInteractiveLeave}
            initial={{ x: 150, opacity: 0, scale: 0.7, rotate: 18 }}
            animate={{
              x: isOverBasket ? -14 : 0,
              opacity: 1,
              scale: isOverBasket ? 1.13 : 1,
              rotate: 0,
            }}
            exit={{ x: 150, opacity: 0, scale: 0.7, rotate: 18 }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 25,
            }}
            style={{ bottom: 184 }}
            className="fixed right-6 z-[10000] select-none pointer-events-auto"
          >
            <div
              className={`relative flex flex-col items-center justify-center w-36 h-36 rounded-3xl border-2 transition-colors duration-200 shadow-2xl ${
                isOverBasket
                  ? "bg-amber-500 border-amber-200 text-neutral-950 shadow-[0_24px_55px_rgba(245,158,11,0.55)]"
                  : "bg-neutral-900 border-neutral-700 text-neutral-100 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
              }`}
            >
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-200 ${
                  isOverBasket
                    ? "bg-black/15 scale-110 -rotate-6"
                    : "bg-neutral-800 rotate-0"
                }`}
              >
                <Archive
                  className={`w-7 h-7 transition-transform duration-200 ${
                    isOverBasket ? "text-neutral-950 scale-110" : "text-amber-400"
                  }`}
                />
              </div>

              <span className="text-xs font-bold tracking-wide">
                {isOverBasket ? "Sepete Sakla!" : "Not Sepeti"}
              </span>
              <span
                className={`text-[10px] mt-0.5 font-medium ${
                  isOverBasket ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {isOverBasket ? "Sepete konuluyor..." : "Saklamak için bırak"}
              </span>

              {basketNotes.length > 0 && (
                <div className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-amber-400 text-neutral-950 text-[10px] font-extrabold shadow-md">
                  {basketNotes.length}
                </div>
              )}

              {isOverBasket && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.05 }}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-neutral-900 flex items-center justify-center shadow-md"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Right-edge compact Basket Handle & Slide-out Drawer when not dragging */}
      {!isDragging && (basketNotes.length > 0 || isDrawerOpen || isStackMinimized) && (
        <div
          data-interactive="true"
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
          style={{ bottom: 190 }}
          className="fixed right-0 z-[9990] flex items-center select-none"
        >
          {/* Toggle Tab on the right screen edge */}
          <div className="flex flex-col items-end gap-1.5">
            {isStackMinimized && (
              <button
                type="button"
                onClick={onToggleStackMinimized}
                title="Küçültülmüş Post-it Yığınını Geri Aç"
                className="flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-l-2xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-r-0 border-white/15 shadow-xl cursor-pointer transition-transform hover:-translate-x-0.5"
              >
                <Layers className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[11px] font-semibold">Yığını Aç</span>
              </button>
            )}

            {(basketNotes.length > 0 || isDrawerOpen) && (
              <button
                type="button"
                onClick={() => setIsDrawerOpen((prev) => !prev)}
                title="Not Sepetini Aç / Kapat"
                className="flex items-center gap-1.5 pl-3 pr-2.5 py-2.5 rounded-l-2xl bg-neutral-900/95 hover:bg-neutral-800 text-white border border-r-0 border-white/15 shadow-xl cursor-pointer transition-transform hover:-translate-x-0.5"
              >
                {isDrawerOpen ? (
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5 text-amber-400" />
                )}
                <Archive className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-semibold">Sepet</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-neutral-950 text-[10px] font-extrabold">
                  {basketNotes.length}
                </span>
              </button>
            )}
          </div>

          {/* Slide-out Basket Drawer */}
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 300, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="mr-2 w-72 max-h-96 rounded-3xl bg-neutral-900/95 border border-white/15 text-white shadow-2xl p-3.5 flex flex-col"
              >
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <Archive className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold tracking-wide">
                      Saklama Sepeti ({basketNotes.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {activeNotesCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onStashAll?.(false)}
                        title="Ekrandaki Tüm Notları Sepete Topla"
                        className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-neutral-200 cursor-pointer transition"
                      >
                        Hepsini Topla
                      </button>
                    )}
                    {basketNotes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreAll?.(false);
                          setIsDrawerOpen(false);
                        }}
                        title="Tümünü Ekrana Geri Çıkar"
                        className="px-2 py-0.5 rounded-full bg-amber-400 hover:bg-amber-300 text-[10px] font-bold text-neutral-950 cursor-pointer transition"
                      >
                        Tümünü Çıkar
                      </button>
                    )}
                  </div>
                </div>

                {basketNotes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-400">
                    Sepette saklanan not yok.
                    <br />
                    <span className="text-[11px] text-neutral-500">
                      Notları sürükleyip sepete bırakarak saklayabilirsiniz.
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 postit-scroll">
                    {basketNotes.map((item) => {
                      const theme = POSTIT_COLORS[item.color] || POSTIT_COLORS.yellow;
                      const hasPin = Boolean(item.pinnedTarget);
                      return (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-2xl bg-neutral-800/90 border border-white/10 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-3 h-3 rounded-full shrink-0 ${theme.swatch} border border-black/20`}
                              />
                              <p className="text-xs font-medium text-neutral-100 truncate">
                                {stripHtmlPreview(item.text)}
                              </p>
                            </div>
                            {hasPin && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[9.5px] font-semibold text-amber-300 shrink-0">
                                <Pin className="w-2.5 h-2.5" />
                                {item.pinnedTarget.label}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1.5">
                            {hasPin && (
                              <button
                                type="button"
                                onClick={() => onRestoreNote?.(item.id, true)}
                                title="Sabitlemeyi (Pini) Kaldırarak Ekrana Çıkar"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-[10px] font-semibold text-neutral-200 cursor-pointer transition"
                              >
                                <PinOff className="w-3 h-3" />
                                <span>Pinsiz Çıkar</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onRestoreNote?.(item.id, false)}
                              title="Ekrana Geri Koy"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-[10px] font-bold text-neutral-950 cursor-pointer transition"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Ekrana Koy</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
