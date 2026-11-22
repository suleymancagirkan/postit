import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export const NOTE_SIZE_LIMITS = {
  MIN: 210,
  MAX: 500,
  DEFAULT: 210,
};

export function clampNoteSize(value) {
  const num = Number(value) || NOTE_SIZE_LIMITS.DEFAULT;
  return Math.max(
    NOTE_SIZE_LIMITS.MIN,
    Math.min(NOTE_SIZE_LIMITS.MAX, Math.round(num))
  );
}

export const POSTIT_COLORS = {
  yellow: {
    id: "yellow",
    label: "Klasik Sarı",
    hex: "#FACC15",
    hexSoft: "#FEF08A",
    bodyBg: "bg-[#FFF275]",
    stripBg: "bg-[#F4E04D]",
    border: "border-[#E5CF38]",
    text: "text-[#2C2406]",
    placeholder: "placeholder-[#8A791D]/65",
    swatch: "bg-[#F9E547]",
    ring: "ring-[#D4BE2A]",
    accentBg: "bg-[#E8D43F]",
    subText: "text-[#6E5E12]",
  },
  pink: {
    id: "pink",
    label: "Pastel Pembe",
    hex: "#FB7185",
    hexSoft: "#FECDD3",
    bodyBg: "bg-[#FFC4D6]",
    stripBg: "bg-[#F6A9C1]",
    border: "border-[#EA96B0]",
    text: "text-[#38101E]",
    placeholder: "placeholder-[#8C3B58]/60",
    swatch: "bg-[#FFAEC8]",
    ring: "ring-[#E087A4]",
    accentBg: "bg-[#F09AB5]",
    subText: "text-[#7A2E49]",
  },
  mint: {
    id: "mint",
    label: "Nane Yeşili",
    hex: "#34D399",
    hexSoft: "#A7F3D0",
    bodyBg: "bg-[#B5F2D6]",
    stripBg: "bg-[#95E4C0]",
    border: "border-[#80D6AF]",
    text: "text-[#0D3322]",
    placeholder: "placeholder-[#2D7A57]/60",
    swatch: "bg-[#98E8C3]",
    ring: "ring-[#6EC9A0]",
    accentBg: "bg-[#88DCB6]",
    subText: "text-[#236647]",
  },
  sky: {
    id: "sky",
    label: "Gökyüzü Mavisi",
    hex: "#38BDF8",
    hexSoft: "#BAE6FD",
    bodyBg: "bg-[#BCE4FF]",
    stripBg: "bg-[#9AD0F7]",
    border: "border-[#84C1EE]",
    text: "text-[#0C293D]",
    placeholder: "placeholder-[#316B94]/60",
    swatch: "bg-[#9ED3FA]",
    ring: "ring-[#72B6E8]",
    accentBg: "bg-[#8BC6F2]",
    subText: "text-[#245A80]",
  },
  lavender: {
    id: "lavender",
    label: "Lavanta Moru",
    hex: "#C084FC",
    hexSoft: "#E9D5FF",
    bodyBg: "bg-[#DEC7FF]",
    stripBg: "bg-[#C7A9F7]",
    border: "border-[#B896EE]",
    text: "text-[#25113E]",
    placeholder: "placeholder-[#634091]/60",
    swatch: "bg-[#CCAFF9]",
    ring: "ring-[#AA86E5]",
    accentBg: "bg-[#BD9DF2]",
    subText: "text-[#53327D]",
  },
  peach: {
    id: "peach",
    label: "Şeftali Turuncusu",
    hex: "#FB923C",
    hexSoft: "#FED7AA",
    bodyBg: "bg-[#FFD1B3]",
    stripBg: "bg-[#F9B88E]",
    border: "border-[#EEA779]",
    text: "text-[#3B1C08]",
    placeholder: "placeholder-[#8F4D24]/60",
    swatch: "bg-[#FCBE95]",
    ring: "ring-[#E39868]",
    accentBg: "bg-[#F2AC80]",
    subText: "text-[#7D3F19]",
  },
};

export const COLOR_LIST = Object.values(POSTIT_COLORS);

const STORAGE_KEY_NOTES = "postit_desktop_notes_v1";
const STORAGE_KEY_DRAFT = "postit_desktop_stack_draft_v1";

const NATURAL_ANGLES = [-2.4, -1.6, -0.8, 0.7, 1.4, 2.2, -1.2, 1.8];

function pickNaturalAngle(index = 0) {
  return NATURAL_ANGLES[index % NATURAL_ANGLES.length];
}

/**
 * Extracts a timer expression (e.g. "25d", "15dk", "30s", "19.20", "19:20") from note HTML/text
 * and computes `{ expr, label, totalMs, startedAt, targetAt }`.
 */
export function extractTimerSpecFromText(htmlOrText = "") {
  if (!htmlOrText) return null;

  // Check for data-timer-expr="..." chip first
  const chipMatch = htmlOrText.match(/data-timer-expr="([^"]+)"/i);
  let rawExpr = chipMatch ? chipMatch[1].trim() : null;

  if (!rawExpr) {
    // Also check plain text @25d or @19.20
    const plain = htmlOrText.replace(/<[^>]+>/g, " ");
    const atMatch = plain.match(
      /(?:^|\s)@(\d{1,2}[.:]\d{2}|\d{1,3}\s*(?:dk|d|min|m|sn|s|sa|h))\b/i
    );
    if (atMatch) {
      rawExpr = atMatch[1].trim();
    }
  }

  if (!rawExpr) return null;

  const now = Date.now();

  // Case 1: Target Wall-Clock Time like "19.20" or "19:20"
  const clockMatch = rawExpr.match(/^(\d{1,2})[.:](\d{2})$/);
  if (clockMatch) {
    const hours = Math.min(23, Math.max(0, parseInt(clockMatch[1], 10)));
    const mins = Math.min(59, Math.max(0, parseInt(clockMatch[2], 10)));
    const targetDate = new Date();
    targetDate.setHours(hours, mins, 0, 0);
    if (targetDate.getTime() <= now) {
      // If that time already passed today, schedule for tomorrow
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const totalMs = Math.max(1000, targetDate.getTime() - now);
    const label = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    return {
      expr: rawExpr.toLowerCase(),
      label,
      isTargetClockTime: true,
      totalMs,
      startedAt: now,
      targetAt: targetDate.getTime(),
    };
  }

  // Case 2: Duration like "25d", "15dk", "30s", "1sa"
  const durMatch = rawExpr.match(/^(\d{1,3})\s*(dk|d|min|m|sn|s|sa|h)$/i);
  if (durMatch) {
    const amount = Math.max(1, parseInt(durMatch[1], 10));
    const unit = durMatch[2].toLowerCase();
    let multiplierMs = 60 * 1000;
    if (unit === "s" || unit === "sn") {
      multiplierMs = 1000;
    } else if (unit === "sa" || unit === "h") {
      multiplierMs = 3600 * 1000;
    }
    const totalMs = amount * multiplierMs;
    return {
      expr: rawExpr.toLowerCase(),
      label: rawExpr,
      isTargetClockTime: false,
      totalMs,
      startedAt: now,
      targetAt: now + totalMs,
    };
  }

  return null;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

/**
 * Finds all note IDs connected to `startId` (transitively via BFS over `linkedIds`).
 */
export function getConnectedClusterIds(notesList, startId) {
  const visited = new Set();
  if (!startId || !Array.isArray(notesList)) return visited;

  const byId = new Map(notesList.map((n) => [n.id, n]));
  if (!byId.has(startId)) {
    visited.add(startId);
    return visited;
  }

  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const currentNote = byId.get(currentId);
    if (!currentNote) continue;

    // Outgoing links
    const links = Array.isArray(currentNote.linkedIds)
      ? currentNote.linkedIds
      : [];
    for (const neighborId of links) {
      if (byId.has(neighborId) && !visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    // Incoming links (in case any link was one-way)
    for (const other of notesList) {
      if (
        !visited.has(other.id) &&
        Array.isArray(other.linkedIds) &&
        other.linkedIds.includes(currentId)
      ) {
        visited.add(other.id);
        queue.push(other.id);
      }
    }
  }

  return visited;
}

export function useNotesStore() {
  const [notes, setNotes] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [stackDraft, setStackDraft] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAFT);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          text: parsed.text ?? "",
          color: POSTIT_COLORS[parsed.color] ? parsed.color : "yellow",
          drawing: Array.isArray(parsed.drawing) ? parsed.drawing : [],
          sheetId: parsed.sheetId || 1,
        };
      }
    } catch {
      // ignore storage errors
    }
    return {
      text: "",
      color: "yellow",
      drawing: [],
      sheetId: 1,
    };
  });

  const highestZRef = useRef(10);

  // Load persisted notes on mount (from Tauri app_data_dir/notes.json, fallback to localStorage)
  useEffect(() => {
    let mounted = true;

    async function loadInitialNotes() {
      let loadedNotes = null;

      if (isTauriRuntime()) {
        try {
          const rawJson = await invoke("load_notes");
          if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (Array.isArray(parsed)) {
              // Trust SQLite authoritative result even when empty ([]) so deleted notes never resurrect from localStorage
              loadedNotes = parsed;
            }
          }
        } catch (err) {
          console.warn("Tauri load_notes fallback to localStorage:", err);
        }
      }

      if (!loadedNotes) {
        try {
          const localRaw = localStorage.getItem(STORAGE_KEY_NOTES);
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (Array.isArray(parsed)) {
              loadedNotes = parsed;
            }
          }
        } catch (err) {
          console.warn("localStorage read error:", err);
        }
      }

      if (mounted) {
        const validNotes = Array.isArray(loadedNotes)
          ? loadedNotes.map((n) => ({
            ...n,
            width: clampNoteSize(n.width),
            height: clampNoteSize(n.height),
            pinnedTarget: n.pinnedTarget || null,
            inBasket: Boolean(n.inBasket),
            linkedIds: Array.isArray(n.linkedIds) ? n.linkedIds : [],
            activeTimer: n.activeTimer || extractTimerSpecFromText(n.text),
            drawing: Array.isArray(n.drawing) ? n.drawing : [],
          }))
          : [];
        const maxZ = validNotes.reduce(
          (acc, item) => Math.max(acc, Number(item.zIndex) || 10),
          10
        );
        highestZRef.current = maxZ;
        setNotes(validNotes);
        setIsLoaded(true);
      }
    }

    loadInitialNotes();
    return () => {
      mounted = false;
    };
  }, []);

  // Save notes with 180ms debounce to both localStorage and Tauri SQLite postit.db
  // so fast typing, resizing, and freehand drawing run at 60/120 FPS without IPC stutter.
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      const serialized = JSON.stringify(notes);
      try {
        localStorage.setItem(STORAGE_KEY_NOTES, serialized);
      } catch (err) {
        console.warn("Failed to save notes to localStorage:", err);
      }

      if (isTauriRuntime()) {
        invoke("save_notes", { notesJson: serialized }).catch((err) => {
          console.warn("Failed to save notes to postit.db:", err);
        });
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [notes, isLoaded]);

  // Persist active top stack sheet draft
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(stackDraft));
    } catch {
      // ignore
    }
  }, [stackDraft]);

  const updateStackDraft = useCallback((patch) => {
    setStackDraft((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  }, []);

  const advanceStackSheet = useCallback((nextColor) => {
    setStackDraft((prev) => ({
      text: "",
      color: nextColor || prev.color,
      drawing: [],
      sheetId: (prev.sheetId || 1) + 1,
    }));
  }, []);

  const pinNoteFromStack = useCallback(
    ({ x, y, text, color, drawing, inBasket = false }) => {
      highestZRef.current += 1;
      const now = Date.now();
      const size = NOTE_SIZE_LIMITS.DEFAULT;
      const clampedX = Math.max(16, Math.min(window.innerWidth - size - 16, Math.round(x)));
      const clampedY = Math.max(16, Math.min(window.innerHeight - size - 16, Math.round(y)));

      const textVal = (text ?? stackDraft.text).trim() || "";
      const initialTimer = extractTimerSpecFromText(textVal);
      const initialDrawing = Array.isArray(drawing ?? stackDraft.drawing)
        ? drawing ?? stackDraft.drawing
        : [];

      const newNote = {
        id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
        text: textVal,
        color: POSTIT_COLORS[color || stackDraft.color]
          ? color || stackDraft.color
          : "yellow",
        x: clampedX,
        y: clampedY,
        width: size,
        height: size,
        pinnedTarget: null,
        inBasket: Boolean(inBasket),
        linkedIds: [],
        activeTimer: initialTimer,
        drawing: initialDrawing,
        rotation: pickNaturalAngle(notes.length + Math.floor(Math.random() * 6)),
        zIndex: highestZRef.current,
        createdAt: now,
        updatedAt: now,
      };

      setNotes((prev) => [...prev, newNote]);
      advanceStackSheet(color || stackDraft.color);
      return newNote;
    },
    [stackDraft, notes.length, advanceStackSheet]
  );

  const updateNote = useCallback((id, patch) => {
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id !== id) return note;
        const resolved = typeof patch === "function" ? patch(note) : patch;
        const nextText =
          resolved.text !== undefined ? resolved.text : note.text;

        // Sync activeTimer if the note's text changed
        let nextTimer =
          resolved.activeTimer !== undefined
            ? resolved.activeTimer
            : note.activeTimer || null;

        if (resolved.text !== undefined && resolved.activeTimer === undefined) {
          const parsedSpec = extractTimerSpecFromText(nextText);
          if (!parsedSpec) {
            nextTimer = null;
          } else if (!note.activeTimer || note.activeTimer.expr !== parsedSpec.expr) {
            nextTimer = parsedSpec;
          }
        }

        return {
          ...note,
          ...resolved,
          activeTimer: nextTimer,
          width:
            resolved.width !== undefined
              ? clampNoteSize(resolved.width)
              : clampNoteSize(note.width),
          height:
            resolved.height !== undefined
              ? clampNoteSize(resolved.height)
              : clampNoteSize(note.height),
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  // Toggle pinning a note (and any notes tied to it via detective strings) to the screen/window underneath
  const toggleNoteScreenPin = useCallback(async (note) => {
    if (note.pinnedTarget) {
      // Unpin entire connected string cluster
      setNotes((prev) => {
        const cluster = getConnectedClusterIds(prev, note.id);
        const now = Date.now();
        return prev.map((n) =>
          cluster.has(n.id)
            ? { ...n, pinnedTarget: null, updatedAt: now }
            : n
        );
      });
      return null;
    }

    const width = clampNoteSize(note.width);
    const height = clampNoteSize(note.height);
    const centerX = note.x + width / 2;
    const centerY = note.y + height / 2;

    let detected = {
      targetType: "desktop",
      hwnd: 0,
      processName: "desktop",
      label: "Masaüstü",
      title: "Masaüstü",
    };

    if (isTauriRuntime()) {
      try {
        const res = await invoke("detect_target_at_point", {
          x: centerX,
          y: centerY,
        });
        if (res && res.targetType) {
          detected = res;
        }
      } catch (err) {
        console.warn("detect_target_at_point fallback:", err);
      }
    }

    setNotes((prev) => {
      const cluster = getConnectedClusterIds(prev, note.id);
      const now = Date.now();
      return prev.map((n) =>
        cluster.has(n.id)
          ? { ...n, pinnedTarget: detected, updatedAt: now }
          : n
      );
    });
    return detected;
  }, []);

  const bringToFront = useCallback((id) => {
    highestZRef.current += 1;
    const nextZ = highestZRef.current;
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, zIndex: nextZ } : note))
    );
  }, []);

  // Deleting a note deletes its entire string-connected cluster and flushes immediately to SQLite
  const deleteNote = useCallback((id) => {
    setNotes((prev) => {
      const cluster = getConnectedClusterIds(prev, id);
      const nextNotes = prev
        .filter((note) => !cluster.has(note.id))
        .map((note) =>
          Array.isArray(note.linkedIds)
            ? {
              ...note,
              linkedIds: note.linkedIds.filter((lid) => !cluster.has(lid)),
            }
            : note
        );

      const serialized = JSON.stringify(nextNotes);
      try {
        localStorage.setItem(STORAGE_KEY_NOTES, serialized);
      } catch {
        // ignore
      }
      if (isTauriRuntime()) {
        invoke("save_notes", { notesJson: serialized }).catch(() => {});
      }

      return nextNotes;
    });
  }, []);

  // Connect or disconnect two notes (or a note and __desk_clock__) with a red detective string
  const toggleNoteLink = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const now = Date.now();
    let added = false;
    setNotes((prev) => {
      const source = prev.find((n) => n.id === sourceId);
      if (!source) return prev;
      const alreadyLinked =
        Array.isArray(source.linkedIds) && source.linkedIds.includes(targetId);
      added = !alreadyLinked;

      return prev.map((note) => {
        const currentLinks = Array.isArray(note.linkedIds) ? note.linkedIds : [];
        if (note.id === sourceId) {
          const nextLinks = alreadyLinked
            ? currentLinks.filter((id) => id !== targetId)
            : [...new Set([...currentLinks, targetId])];
          return { ...note, linkedIds: nextLinks, updatedAt: now };
        }
        if (note.id === targetId) {
          const nextLinks = alreadyLinked
            ? currentLinks.filter((id) => id !== sourceId)
            : [...new Set([...currentLinks, sourceId])];
          return { ...note, linkedIds: nextLinks, updatedAt: now };
        }
        return note;
      });
    });
    return added;
  }, []);

  // Cut/remove a specific detective string link between two notes
  const removeNoteLink = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId) return;
    const now = Date.now();
    setNotes((prev) =>
      prev.map((note) => {
        const currentLinks = Array.isArray(note.linkedIds) ? note.linkedIds : [];
        if (note.id === sourceId && currentLinks.includes(targetId)) {
          return {
            ...note,
            linkedIds: currentLinks.filter((id) => id !== targetId),
            updatedAt: now,
          };
        }
        if (note.id === targetId && currentLinks.includes(sourceId)) {
          return {
            ...note,
            linkedIds: currentLinks.filter((id) => id !== sourceId),
            updatedAt: now,
          };
        }
        return note;
      })
    );
  }, []);

  // Move a note AND its entire connected string cluster into the storage basket together
  const stashNoteToBasket = useCallback((id, clearPin = false) => {
    setNotes((prev) => {
      const cluster = getConnectedClusterIds(prev, id);
      const now = Date.now();
      return prev.map((note) =>
        cluster.has(note.id)
          ? {
            ...note,
            inBasket: true,
            pinnedTarget: clearPin ? null : note.pinnedTarget,
            updatedAt: now,
          }
          : note
      );
    });
  }, []);

  // Restore a note AND its entire connected string cluster from the basket back onto the screen together
  const restoreNoteFromBasket = useCallback((id, clearPin = false) => {
    setNotes((prev) => {
      const cluster = getConnectedClusterIds(prev, id);
      const now = Date.now();
      return prev.map((note) => {
        if (!cluster.has(note.id)) return note;
        highestZRef.current += 1;
        return {
          ...note,
          inBasket: false,
          pinnedTarget: clearPin ? null : note.pinnedTarget,
          zIndex: highestZRef.current,
          updatedAt: now,
        };
      });
    });
  }, []);

  // Move all currently active notes into the basket
  const stashAllNotesToBasket = useCallback((clearPins = false) => {
    const now = Date.now();
    setNotes((prev) =>
      prev.map((note) =>
        note.inBasket
          ? note
          : {
            ...note,
            inBasket: true,
            pinnedTarget: clearPins ? null : note.pinnedTarget,
            updatedAt: now,
          }
      )
    );
  }, []);

  // Restore all stashed notes from the basket back onto the screen
  const restoreAllNotesFromBasket = useCallback((clearPins = false) => {
    const now = Date.now();
    setNotes((prev) =>
      prev.map((note) =>
        !note.inBasket
          ? note
          : {
            ...note,
            inBasket: false,
            pinnedTarget: clearPins ? null : note.pinnedTarget,
            updatedAt: now,
          }
      )
    );
  }, []);

  return {
    notes,
    isLoaded,
    stackDraft,
    updateStackDraft,
    advanceStackSheet,
    pinNoteFromStack,
    updateNote,
    toggleNoteScreenPin,
    bringToFront,
    deleteNote,
    toggleNoteLink,
    removeNoteLink,
    stashNoteToBasket,
    restoreNoteFromBasket,
    stashAllNotesToBasket,
    restoreAllNotesFromBasket,
  };
}
