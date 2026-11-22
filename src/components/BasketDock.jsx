import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const BASKET_ZONE_RADIUS = 145;
const EDGE_MAGNET_THRESHOLD = 68;

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

/**
 * 2.5D Realistic Woven / Walnut-Wood & Brass Desktop Post-it Organizer Basket
 * - No badge above it, no settings drawer/modal.
 * - Clicking directly on a mini Post-it sticking out of the basket (or clicking the basket itself)
 *   immediately pops that note back out onto the screen!
 */
export default function BasketDock({
  isVisible,
  isOverBasket,
  basketNotes = [],
  onRestoreNote,
  onSummonBasket,
  onInteractiveEnter,
  onInteractiveLeave,
}) {
  const [isPullingBar, setIsPullingBar] = useState(false);
  const [pullLeftPx, setPullLeftPx] = useState(0);
  const pullStartXRef = useRef(null);
  const hasSnappedOpenRef = useRef(false);

  // Magnetic tension (0 -> 1) while pulling the right-edge handle to the left
  const pullTension = isPullingBar
    ? Math.min(1, pullLeftPx / EDGE_MAGNET_THRESHOLD)
    : 0;
  // Non-linear magnetic resistance: moves only ~32% until the threshold snaps open
  const resistedPullX = isPullingBar
    ? Math.round(pullLeftPx * (0.22 + 0.25 * Math.pow(pullTension, 1.8)))
    : 0;

  const handleBarPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pullStartXRef.current = e.clientX;
    hasSnappedOpenRef.current = false;
    setIsPullingBar(true);
    setPullLeftPx(0);
  };

  useEffect(() => {
    if (!isPullingBar) return;

    const handlePointerMove = (e) => {
      if (pullStartXRef.current === null) return;
      // Pulling to the left produces a positive pull distance
      const deltaLeft = Math.max(0, pullStartXRef.current - e.clientX);
      setPullLeftPx(deltaLeft);

      if (!hasSnappedOpenRef.current && deltaLeft >= EDGE_MAGNET_THRESHOLD) {
        hasSnappedOpenRef.current = true;
        setIsPullingBar(false);
        setPullLeftPx(0);
        pullStartXRef.current = null;
        onSummonBasket?.();
      }
    };

    const handlePointerUp = () => {
      setIsPullingBar(false);
      setPullLeftPx(0);
      pullStartXRef.current = null;
      hasSnappedOpenRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isPullingBar, onSummonBasket]);

  const previewSheets =
    basketNotes.length > 0
      ? basketNotes.slice(-4)
      : isOverBasket
      ? [{ id: "ghost", color: "yellow" }]
      : [];

  const sheetTransforms = [
    { x: 24, y: 15, rotate: -10 },
    { x: 45, y: 11, rotate: 4 },
    { x: 64, y: 14, rotate: 11 },
    { x: 36, y: 9, rotate: -2 },
  ];

  // Clicking the basket itself pops out the most recently stashed note directly onto the screen
  const handleBasketClick = (e) => {
    e.stopPropagation();
    if (basketNotes.length > 0) {
      const topNote = basketNotes[basketNotes.length - 1];
      onRestoreNote?.(topNote.id, false);
    }
  };

  return (
    <>
      {/* Permanent 10% Opacity Right-Edge Magnetic Pull Handle (Visible when basket is hidden) */}
      {!isVisible && (
        <div
          data-interactive="true"
          onMouseEnter={onInteractiveEnter}
          onMouseLeave={onInteractiveLeave}
          onPointerDown={handleBarPointerDown}
          style={{ bottom: 205 }}
          title="Sepeti çıkarmak için sola doğru çekin"
          className="fixed right-0 z-[9995] flex items-center justify-end pl-3 py-3 cursor-ew-resize select-none group"
        >
          <motion.div
            animate={{
              x: -resistedPullX,
              scaleY: isPullingBar ? 1 + pullTension * 0.22 : 1,
              scaleX: isPullingBar ? 1 + pullTension * 0.35 : 1,
            }}
            transition={
              isPullingBar
                ? { type: "tween", duration: 0 }
                : { type: "spring", stiffness: 520, damping: 24 }
            }
            className={`w-1.5 h-16 rounded-l-full bg-neutral-200 shadow-sm transition-opacity duration-200 ${
              isPullingBar
                ? "opacity-85 w-2 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                : "opacity-10 group-hover:opacity-55 group-hover:w-2"
            }`}
          />
        </div>
      )}

      <AnimatePresence>
        {(isVisible || (isPullingBar && pullTension > 0.15)) && (
          <motion.div
            data-interactive="true"
            onMouseEnter={onInteractiveEnter}
            onMouseLeave={onInteractiveLeave}
            onClick={handleBasketClick}
            initial={{ x: 145, opacity: 0, scale: 0.65, rotate: 22 }}
            animate={
              isVisible
                ? {
                    x: isOverBasket ? -12 : 0,
                    opacity: 1,
                    scale: isOverBasket ? 1.12 : 1,
                    rotate: isOverBasket ? -4 : 0,
                  }
                : {
                    // Magnetic peek preview while pulling the right-edge bar
                    x: 120 - pullTension * 55,
                    opacity: pullTension * 0.85,
                    scale: 0.75 + pullTension * 0.15,
                    rotate: 16 - pullTension * 10,
                  }
            }
            exit={{ x: 145, opacity: 0, scale: 0.65, rotate: 22 }}
            transition={{
              type: "spring",
              stiffness: 360,
              damping: 24,
            }}
            style={{ bottom: 185 }}
          title={
            basketNotes.length > 0
              ? "Notu ekrana geri çıkarmak için kağıda veya sepete tıklayın"
              : undefined
          }
          className={`fixed right-5 z-[10000] flex flex-col items-center select-none pointer-events-auto ${
            basketNotes.length > 0 ? "cursor-pointer" : ""
          }`}
        >
          <div className="relative flex items-center justify-center w-32 h-32">
            {/* Realistic Floor Contact Shadow */}
            <motion.div
              animate={{
                scale: isOverBasket ? 1.12 : 1,
                opacity: isOverBasket ? 0.55 : 0.38,
              }}
              className="absolute bottom-1 w-24 h-5 rounded-full bg-black blur-md pointer-events-none"
            />

            <svg
              width="128"
              height="124"
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
                const isClickable = item.id && item.id !== "ghost";

                return (
                  <motion.g
                    key={item.id || idx}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{
                      y: isOverBasket ? -7 : 0,
                      rotate: isOverBasket ? pos.rotate * 1.25 : pos.rotate,
                      opacity: item.id === "ghost" ? 0.55 : 1,
                    }}
                    whileHover={
                      isClickable
                        ? {
                            y: -14,
                            scale: 1.08,
                          }
                        : undefined
                    }
                    transition={{ type: "spring", stiffness: 360, damping: 22 }}
                    style={{ originX: "64px", originY: "56px" }}
                    className={isClickable ? "cursor-pointer" : ""}
                    onClick={(e) => {
                      if (!isClickable) return;
                      e.stopPropagation();
                      onRestoreNote?.(item.id, false);
                    }}
                  >
                    <g
                      transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.rotate})`}
                    >
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

              {/* Front 3D Tapered Woven Basket Body */}
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
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
