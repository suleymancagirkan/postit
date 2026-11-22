import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, PinOff, Pin, Layers } from "lucide-react";
import { POSTIT_COLORS } from "../hooks/useNotesStore";

export const BASKET_ZONE_RADIUS = 145;

export function getBasketTargetCenter() {
  if (typeof window === "undefined") return { x: 1200, y: 500 };
  return {
    x: window.innerWidth - 82,
    y: window.innerHeight - 235,
  };
}

export function isPointInBasketZone(clientX, clientY) {
  if (typeof window === "undefined") return false;
  const center = getBasketTargetCenter();
  const dist = Math.hypot(clientX - center.x, clientY - center.y);
  return dist <= BASKET_ZONE_RADIUS;
}

const SWATCH_HEX = {
  yellow: { fill: "#FFF275", strip: "#F4E04D", stroke: "#D4BE2A" },
  pink: { fill: "#FFC4D6", strip: "#F6A9C1", stroke: "#E087A4" },
  mint: { fill: "#B5F2D6", strip: "#95E4C0", stroke: "#6EC9A0" },
  sky: { fill: "#BCE4FF", strip: "#9AD0F7", stroke: "#72B6E8" },
  lavender: { fill: "#DEC7FF", strip: "#C7A9F7", stroke: "#AA86E5" },
  peach: { fill: "#FFD1B3", strip: "#F9B88E", stroke: "#E39868" },
};

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

/**
 * 2.5D Realistic Woven / Walnut-Wood & Brass Desktop Post-it Organizer Basket SVG
 * Renders actual colorful mini Post-it sheets sticking out of the 3D basket pocket!
 */
function RealisticBasketObject({
  basketNotes = [],
  isOverBasket = false,
  compact = false,
}) {
  const previewSheets =
    basketNotes.length > 0
      ? basketNotes.slice(-4)
      : isOverBasket
      ? [{ id: "ghost", color: "yellow" }]
      : [];

  const sheetTransforms = [
    { x: 26, y: 16, rotate: -9 },
    { x: 46, y: 12, rotate: 4 },
    { x: 64, y: 15, rotate: 11 },
    { x: 37, y: 10, rotate: -2 },
  ];

  return (
    <div
      className={`relative flex items-center justify-center ${
        compact ? "w-24 h-24" : "w-32 h-32"
      }`}
    >
      {/* Realistic Floor / Wall Contact Shadow */}
      <motion.div
        animate={{
          scale: isOverBasket ? 1.12 : 1,
          opacity: isOverBasket ? 0.55 : 0.38,
        }}
        className="absolute bottom-1 w-24 h-5 rounded-full bg-black blur-md pointer-events-none"
      />

      <svg
        width={compact ? "96" : "128"}
        height={compact ? "96" : "124"}
        viewBox="0 0 128 124"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible drop-shadow-[0_12px_18px_rgba(0,0,0,0.4)]"
      >
        <defs>
          {/* Back Wooden / Woven Wall of the Basket */}
          <linearGradient
            id="basketBackWall"
            x1="20"
            y1="26"
            x2="108"
            y2="75"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="50%" stopColor="#451A03" />
            <stop offset="100%" stopColor="#271001" />
          </linearGradient>

          {/* Front 3D Curved Walnut / Rattan Basket Body */}
          <linearGradient
            id="basketFrontBody"
            x1="14"
            y1="46"
            x2="114"
            y2="114"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="22%" stopColor="#F59E0B" />
            <stop offset="52%" stopColor="#B45309" />
            <stop offset="85%" stopColor="#78350F" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>

          {/* Top Braided Rim Lip */}
          <linearGradient
            id="basketRimGrad"
            x1="12"
            y1="44"
            x2="116"
            y2="54"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#B45309" />
            <stop offset="30%" stopColor="#FDE68A" />
            <stop offset="65%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* Brushed Brass Nameplate */}
          <linearGradient
            id="brassPlate"
            x1="42"
            y1="74"
            x2="86"
            y2="92"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="45%" stopColor="#FEF08A" />
            <stop offset="75%" stopColor="#CA8A04" />
            <stop offset="100%" stopColor="#854D0E" />
          </linearGradient>
        </defs>

        {/* Back Wall of the Organizer Basket */}
        <rect
          x="18"
          y="28"
          width="92"
          height="56"
          rx="14"
          fill="url(#basketBackWall)"
          stroke="#92400E"
          strokeWidth="2"
        />

        {/* Deep Inner Pocket Shadow */}
        <ellipse cx="64" cy="52" rx="41" ry="10" fill="#1C0A00" />

        {/* Stored Colorful Mini Post-it Sheets Peeking Out of the Basket Pocket */}
        {previewSheets.map((item, idx) => {
          const palette = SWATCH_HEX[item.color] || SWATCH_HEX.yellow;
          const pos = sheetTransforms[idx % sheetTransforms.length];
          return (
            <motion.g
              key={item.id || idx}
              initial={{ y: 20, opacity: 0 }}
              animate={{
                y: isOverBasket ? -7 : 0,
                rotate: isOverBasket ? pos.rotate * 1.25 : pos.rotate,
                opacity: item.id === "ghost" ? 0.55 : 1,
              }}
              transition={{ type: "spring", stiffness: 340, damping: 22 }}
              style={{ originX: "64px", originY: "56px" }}
            >
              <g transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.rotate})`}>
                {/* Mini Post-it Sheet Card */}
                <rect
                  x="0"
                  y="0"
                  width="38"
                  height="42"
                  rx="6"
                  fill={palette.fill}
                  stroke={palette.stroke}
                  strokeWidth="1.2"
                />
                {/* Top Adhesive Strip on Mini Post-it */}
                <path
                  d="M0 6 C0 2.7 2.7 0 6 0 L32 0 C35.3 0 38 2.7 38 6 L38 10 L0 10 Z"
                  fill={palette.strip}
                />
                {/* Faux handwritten lines on the mini sheet */}
                <line
                  x1="6"
                  y1="17"
                  x2="30"
                  y2="17"
                  stroke="#000000"
                  strokeOpacity="0.22"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="6"
                  y1="23"
                  x2="24"
                  y2="23"
                  stroke="#000000"
                  strokeOpacity="0.18"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
            </motion.g>
          );
        })}

        {/* Front 3D Tapered Woven Basket Body (covers lower half of the tucked notes) */}
        <path
          d="M15 49 C15 49 41 55 64 55 C87 55 113 49 113 49 L103 103 C101.5 110 86 115 64 115 C42 115 26.5 110 25 103 Z"
          fill="url(#basketFrontBody)"
        />

        {/* Woven Rattan Texture Horizontal Strands & Vertical Ribs */}
        <path
          d="M19 64 C42 70 86 70 109 64"
          stroke="#451A03"
          strokeWidth="2.2"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
        <path
          d="M19.5 65.5 C42 71.5 86 71.5 108.5 65.5"
          stroke="#FDE68A"
          strokeWidth="1"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />

        <path
          d="M22 79 C43 85 85 85 106 79"
          stroke="#451A03"
          strokeWidth="2.2"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
        <path
          d="M24 94 C44 99 84 99 104 94"
          stroke="#451A03"
          strokeWidth="2.2"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />

        {/* Vertical Woven Ribs */}
        <path
          d="M35 53 L39 109"
          stroke="#451A03"
          strokeWidth="2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />
        <path
          d="M64 55 L64 113"
          stroke="#451A03"
          strokeWidth="2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />
        <path
          d="M93 53 L89 109"
          stroke="#451A03"
          strokeWidth="2"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />

        {/* Front Rolled Braided Rim Collar */}
        <path
          d="M13 48.5 C39 56 89 56 115 48.5"
          stroke="url(#basketRimGrad)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M15 47.5 C39 54.5 89 54.5 113 47.5"
          stroke="#FEF3C7"
          strokeWidth="1.3"
          strokeOpacity="0.65"
          strokeLinecap="round"
        />

        {/* 3D Brushed Brass Label Tag with Rivets on the Front of the Basket */}
        <rect
          x="39"
          y="73"
          width="50"
          height="20"
          rx="5"
          fill="url(#brassPlate)"
          stroke="#713F12"
          strokeWidth="1.2"
        />
        <circle cx="43.5" cy="83" r="1.3" fill="#713F12" />
        <circle cx="84.5" cy="83" r="1.3" fill="#713F12" />

        {/* Count or Icon engraved on Brass Plate */}
        <text
          x="64"
          y="86.5"
          textAnchor="middle"
          fill="#451A03"
          fontSize="10.5"
          fontWeight="800"
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        >
          {basketNotes.length > 0 ? `${basketNotes.length} NOT` : "SEPET"}
        </text>
      </svg>
    </div>
  );
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
      {/* 1. Drag-target 2.5D Realistic Basket (slides in from the right edge above Trash Can) */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            data-interactive="true"
            onMouseEnter={onInteractiveEnter}
            onMouseLeave={onInteractiveLeave}
            initial={{ x: 145, opacity: 0, scale: 0.65, rotate: 22 }}
            animate={{
              x: isOverBasket ? -12 : 0,
              opacity: 1,
              scale: isOverBasket ? 1.12 : 1,
              rotate: isOverBasket ? -4 : 0,
            }}
            exit={{ x: 145, opacity: 0, scale: 0.65, rotate: 22 }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 24,
            }}
            style={{ bottom: 185 }}
            className="fixed right-5 z-[10000] flex flex-col items-center select-none pointer-events-auto"
          >
            <motion.div
              animate={{
                y: isOverBasket ? -5 : 0,
                scale: isOverBasket ? 1.05 : 0.95,
              }}
              className={`mb-0.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide shadow-lg transition-colors duration-200 ${
                isOverBasket
                  ? "bg-amber-400 text-neutral-950 ring-2 ring-amber-200"
                  : "bg-neutral-900/85 text-neutral-200"
              }`}
            >
              {isOverBasket ? "Bırak • Sepete Koy!" : "Saklama Sepeti"}
            </motion.div>

            <RealisticBasketObject
              basketNotes={basketNotes}
              isOverBasket={isOverBasket}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Resting 2.5D Wall-Mounted Basket on the right edge when notes are stored or stack is minimized */}
      {!isDragging && (basketNotes.length > 0 || isDrawerOpen || isStackMinimized) && (
        <div
          data-interactive="true"
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
          style={{ bottom: 185 }}
          className="fixed right-2 z-[9990] flex items-center select-none"
        >
          {/* Slide-out Basket Drawer (to the left of the 2.5D basket) */}
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div
                initial={{ x: 260, opacity: 0, scale: 0.92 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: 260, opacity: 0, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="mr-2 w-72 max-h-96 rounded-3xl bg-neutral-900/95 border border-amber-500/30 text-white shadow-2xl p-3.5 flex flex-col"
              >
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/10">
                  <span className="text-xs font-bold tracking-wide text-amber-300">
                    Saklama Sepeti ({basketNotes.length})
                  </span>

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

          {/* Right-Edge Interactive 2.5D Mini Basket & Restore Stack Trigger */}
          <div className="flex flex-col items-center gap-1.5">
            {isStackMinimized && (
              <button
                type="button"
                onClick={onToggleStackMinimized}
                title="Küçültülmüş Post-it Yığınını Geri Aç"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-amber-300 border border-amber-400/30 shadow-lg cursor-pointer transition-transform hover:scale-105 text-[10.5px] font-bold"
              >
                <Layers className="w-3 h-3" />
                <span>Yığını Aç</span>
              </button>
            )}

            {(basketNotes.length > 0 || isDrawerOpen) && (
              <motion.button
                type="button"
                onClick={() => setIsDrawerOpen((prev) => !prev)}
                whileHover={{ scale: 1.07, x: -4 }}
                whileTap={{ scale: 0.95 }}
                title="Saklama Sepetini Aç / Kapat"
                className="bg-transparent border-0 p-0 cursor-pointer outline-none"
              >
                <RealisticBasketObject
                  basketNotes={basketNotes}
                  isOverBasket={isDrawerOpen}
                  compact
                />
              </motion.button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
