import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export const TRASH_ZONE_RADIUS = 160;

export function isPointInTrashZone(clientX, clientY) {
  if (typeof window === "undefined") return false;
  const cornerX = window.innerWidth - 82;
  const cornerY = window.innerHeight - 82;
  const dist = Math.hypot(clientX - cornerX, clientY - cornerY);
  return dist <= TRASH_ZONE_RADIUS;
}

/**
 * 2.5D Metallic Brushed-Steel Office Trash Can with Animated Hinged Lid
 * - No outer box: pure 2.5D object with floor shadow, open dark interior,
 *   crumpled paper balls visible inside, vertical metallic ribs, and animated lid.
 */
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
          initial={{ x: 135, y: 135, opacity: 0, scale: 0.65, rotate: 38 }}
          animate={{
            x: isOverTrash ? -10 : 0,
            y: isOverTrash ? -10 : 0,
            opacity: 1,
            scale: isOverTrash ? 1.1 : 1,
            rotate: isOverTrash ? -4 : 0,
          }}
          exit={{ x: 135, y: 135, opacity: 0, scale: 0.65, rotate: 38 }}
          transition={{
            type: "spring",
            stiffness: 360,
            damping: 24,
          }}
          className="fixed bottom-4 right-5 z-[10000] flex flex-col items-center select-none pointer-events-auto"
        >
          {/* 2.5D Trash Can Illustration (No badge above) */}
          <div className="relative w-32 h-36 flex items-center justify-center">
            {/* Realistic Floor Contact Shadow */}
            <motion.div
              animate={{
                scale: isOverTrash ? 1.12 : 1,
                opacity: isOverTrash ? 0.55 : 0.4,
              }}
              className="absolute bottom-1.5 w-24 h-6 rounded-full bg-black blur-md pointer-events-none"
            />

            <svg
              width="128"
              height="144"
              viewBox="0 0 128 144"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="overflow-visible drop-shadow-[0_14px_20px_rgba(0,0,0,0.42)]"
            >
              <defs>
                {/* Brushed Steel Outer Body Gradient */}
                <linearGradient
                  id="trashBodyGrad"
                  x1="22"
                  y1="44"
                  x2="106"
                  y2="132"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#64748B" />
                  <stop offset="18%" stopColor="#94A3B8" />
                  <stop offset="38%" stopColor="#E2E8F0" />
                  <stop offset="58%" stopColor="#64748B" />
                  <stop offset="82%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>

                {/* Active Crimson Tint Overlay when hovering with crumpled paper */}
                <linearGradient
                  id="trashBodyActiveGrad"
                  x1="22"
                  y1="44"
                  x2="106"
                  y2="132"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#9F1239" />
                  <stop offset="22%" stopColor="#F43F5E" />
                  <stop offset="42%" stopColor="#FDA4AF" />
                  <stop offset="68%" stopColor="#E11D48" />
                  <stop offset="100%" stopColor="#881337" />
                </linearGradient>

                {/* Metallic Rim Gradient */}
                <linearGradient
                  id="trashRimGrad"
                  x1="18"
                  y1="40"
                  x2="110"
                  y2="46"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="32%" stopColor="#F8FAFC" />
                  <stop offset="65%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>

                {/* Dark Deep Interior Mouth */}
                <radialGradient
                  id="trashInteriorGrad"
                  cx="0"
                  cy="0"
                  r="1"
                  gradientUnits="userSpaceOnUse"
                  gradientTransform="translate(64 44) scale(42 14)"
                >
                  <stop offset="0%" stopColor="#090D16" />
                  <stop offset="70%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#334155" />
                </radialGradient>

                {/* 3D Metallic Lid Dome Gradient */}
                <linearGradient
                  id="trashLidGrad"
                  x1="18"
                  y1="22"
                  x2="110"
                  y2="42"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#64748B" />
                  <stop offset="30%" stopColor="#F1F5F9" />
                  <stop offset="60%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>

                {/* Metallic Rib Flute Shadow */}
                <linearGradient
                  id="ribGrad"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                  gradientUnits="objectBoundingBox"
                >
                  <stop offset="0%" stopColor="#0F172A" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#0F172A" stopOpacity="0.5" />
                </linearGradient>
              </defs>

              {/* Tapered Cylinder Main Bin Body */}
              <path
                d="M23 43 L105 43 L95 123 C94 131 81 136 64 136 C47 136 34 131 33 123 Z"
                fill={
                  isOverTrash ? "url(#trashBodyActiveGrad)" : "url(#trashBodyGrad)"
                }
              />

              {/* Lower Metallic Base Foot Ring */}
              <path
                d="M33.5 121 C35 128.5 47.5 133.5 64 133.5 C80.5 133.5 93 128.5 94.5 121"
                stroke="#0F172A"
                strokeWidth="3"
                strokeOpacity="0.45"
                strokeLinecap="round"
              />
              <path
                d="M34 123 C36 130 48 135 64 135 C80 135 92 130 94 123"
                stroke="#F8FAFC"
                strokeWidth="1.2"
                strokeOpacity="0.4"
                strokeLinecap="round"
              />

              {/* 5 Vertical 3D Embossed Ribs / Flutes on the Bin Body */}
              <path
                d="M36 56 L42 117"
                stroke="url(#ribGrad)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="M50 58 L53 120"
                stroke="url(#ribGrad)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="M64 59 L64 121"
                stroke="url(#ribGrad)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="M78 58 L75 120"
                stroke="url(#ribGrad)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />
              <path
                d="M92 56 L86 117"
                stroke="url(#ribGrad)"
                strokeWidth="4.5"
                strokeLinecap="round"
              />

              {/* Horizontal Specular Belt Ring */}
              <path
                d="M26 68 C39 74 89 74 102 68"
                stroke="#FFFFFF"
                strokeWidth="1"
                strokeOpacity="0.35"
              />

              {/* Upper Rolled Metallic Lip / Collar */}
              <ellipse
                cx="64"
                cy="43"
                rx="43.5"
                ry="11.5"
                fill="url(#trashRimGrad)"
              />

              {/* Open Dark Mouth of the Trash Can */}
              <ellipse
                cx="64"
                cy="43"
                rx="39"
                ry="9.5"
                fill="url(#trashInteriorGrad)"
              />

              {/* Crumpled Paper Balls visible inside the open mouth when lid lifts */}
              <g opacity={isOverTrash ? "1" : "0.65"}>
                {/* Yellow crumpled paper ball inside */}
                <polygon
                  points="44,44 49,38 56,40 59,45 52,48 45,47"
                  fill="#FDE047"
                  stroke="#CA8A04"
                  strokeWidth="0.8"
                />
                <polyline
                  points="47,41 52,44 56,40"
                  stroke="#EAB308"
                  strokeWidth="0.9"
                />
                {/* Pink crumpled paper ball inside */}
                <polygon
                  points="68,45 73,39 81,41 83,46 76,49 69,47"
                  fill="#F9A8D4"
                  stroke="#DB2777"
                  strokeWidth="0.8"
                />
                <polyline
                  points="71,42 76,45 80,41"
                  stroke="#EC4899"
                  strokeWidth="0.9"
                />
                {/* Mint crumpled paper ball inside */}
                <polygon
                  points="56,46 61,41 68,42 70,47 63,50 57,48"
                  fill="#86EFAC"
                  stroke="#16A34A"
                  strokeWidth="0.8"
                />
              </g>

              {/* Inner Front Rim Highlight */}
              <path
                d="M25 43 C25 48.5 42.5 52.5 64 52.5 C85.5 52.5 103 48.5 103 43"
                stroke="#F8FAFC"
                strokeWidth="1.3"
                strokeOpacity="0.65"
              />

              {/* Animated 2.5D Hinged Trash Lid (pops open at an angle when paper approaches!) */}
              <motion.g
                initial={false}
                animate={
                  isOverTrash
                    ? {
                        rotate: 36,
                        x: 22,
                        y: -26,
                      }
                    : {
                        rotate: 0,
                        x: 0,
                        y: 0,
                      }
                }
                transition={{
                  type: "spring",
                  stiffness: 340,
                  damping: 19,
                }}
                style={{ originX: "105px", originY: "38px" }}
              >
                {/* Lid Bottom Shadow Flange */}
                <ellipse
                  cx="64"
                  cy="39.5"
                  rx="45"
                  ry="11"
                  fill="#1E293B"
                />

                {/* Lid Main Metallic Dome */}
                <path
                  d="M19 38.5 C19 31 39 25.5 64 25.5 C89 25.5 109 31 109 38.5 C109 44.5 89 49 64 49 C39 49 19 44.5 19 38.5 Z"
                  fill="url(#trashLidGrad)"
                />

                {/* Lid Concentric Ridge Ring */}
                <ellipse
                  cx="64"
                  cy="35.5"
                  rx="33"
                  ry="7"
                  stroke="#F8FAFC"
                  strokeWidth="1.1"
                  strokeOpacity="0.55"
                />
                <ellipse
                  cx="64"
                  cy="36.5"
                  rx="33"
                  ry="7"
                  stroke="#0F172A"
                  strokeWidth="1"
                  strokeOpacity="0.35"
                />

                {/* 3D Top Handle Arch on the Lid */}
                <path
                  d="M52 29 C52 22.5 56 20 64 20 C72 20 76 22.5 76 29"
                  stroke="#1E293B"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M52 28.5 C52 22.5 56 20 64 20 C72 20 76 22.5 76 28.5"
                  stroke="#E2E8F0"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />

                {/* Lid Glossy Specular Highlight */}
                <path
                  d="M27 36 C37 31 51 29.5 65 29.5"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeOpacity="0.65"
                  strokeLinecap="round"
                />
              </motion.g>
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
