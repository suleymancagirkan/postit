import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Sparkles } from "lucide-react";

export const TRASH_ZONE_RADIUS = 165;

export function isPointInTrashZone(clientX, clientY) {
  if (typeof window === "undefined") return false;
  const cornerX = window.innerWidth - 78;
  const cornerY = window.innerHeight - 78;
  const dist = Math.hypot(clientX - cornerX, clientY - cornerY);
  return dist <= TRASH_ZONE_RADIUS;
}

export default function TrashDock({
  isVisible,
  isOverTrash,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-interactive="true"
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
          /* Slides smoothly from the bottom-right corner at a 45-degree diagonal angle */
          initial={{ x: 140, y: 140, opacity: 0, scale: 0.65, rotate: 45 }}
          animate={{
            x: isOverTrash ? -14 : 0,
            y: isOverTrash ? -14 : 0,
            opacity: 1,
            scale: isOverTrash ? 1.14 : 1,
            rotate: 0,
          }}
          exit={{ x: 140, y: 140, opacity: 0, scale: 0.65, rotate: 45 }}
          transition={{
            type: "spring",
            stiffness: 360,
            damping: 25,
          }}
          className="fixed bottom-6 right-6 z-[10000] select-none pointer-events-auto"
        >
          <div
            className={`relative flex flex-col items-center justify-center w-36 h-36 rounded-3xl border-2 transition-colors duration-200 shadow-2xl ${
              isOverTrash
                ? "bg-rose-600 border-rose-300 text-white shadow-[0_24px_55px_rgba(225,29,72,0.55)]"
                : "bg-neutral-900 border-neutral-700 text-neutral-100 shadow-[0_20px_45px_rgba(0,0,0,0.45)]"
            }`}
          >
            {/* 45-degree diagonal indicator accent */}
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-transform duration-200 ${
                isOverTrash
                  ? "bg-white/20 scale-110 -rotate-12"
                  : "bg-neutral-800 rotate-0"
              }`}
            >
              <Trash2
                className={`w-7 h-7 transition-transform duration-200 ${
                  isOverTrash ? "text-white scale-110" : "text-rose-400"
                }`}
              />
            </div>

            <span className="text-xs font-bold tracking-wide">
              {isOverTrash ? "Bırak ve Sil!" : "Çöp Kutusu"}
            </span>
            <span
              className={`text-[10px] mt-0.5 font-medium ${
                isOverTrash ? "text-rose-100" : "text-neutral-400"
              }`}
            >
              {isOverTrash ? "İçine çekiliyor..." : "Silmek için sürükle"}
            </span>

            {isOverTrash && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1.05 }}
                className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-amber-300 text-neutral-900 flex items-center justify-center shadow-md"
              >
                <Sparkles className="w-4 h-4" />
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
