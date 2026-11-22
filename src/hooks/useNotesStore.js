import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export const NOTE_SIZE_LIMITS = {
  MIN: 210,
  MAX: 340,
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

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
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
          sheetId: parsed.sheetId || 1,
        };
      }
    } catch {
      // ignore storage errors
    }
    return {
      text: "",
      color: "yellow",
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
            if (Array.isArray(parsed) && parsed.length > 0) {
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

  // Save notes instantaneously to both localStorage and Tauri notes.json whenever notes change
  useEffect(() => {
    if (!isLoaded) return;

    const serialized = JSON.stringify(notes, null, 2);
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, serialized);
    } catch (err) {
      console.warn("Failed to save notes to localStorage:", err);
    }

    if (isTauriRuntime()) {
      invoke("save_notes", { notesJson: serialized }).catch((err) => {
        console.warn("Failed to save notes to notes.json:", err);
      });
    }
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
      sheetId: (prev.sheetId || 1) + 1,
    }));
  }, []);

  const pinNoteFromStack = useCallback(
    ({ x, y, text, color }) => {
      highestZRef.current += 1;
      const now = Date.now();
      const size = NOTE_SIZE_LIMITS.DEFAULT;
      const clampedX = Math.max(16, Math.min(window.innerWidth - size - 16, Math.round(x)));
      const clampedY = Math.max(16, Math.min(window.innerHeight - size - 16, Math.round(y)));

      const newNote = {
        id: `note_${now}_${Math.random().toString(36).slice(2, 7)}`,
        text: (text ?? stackDraft.text).trim() || "",
        color: POSTIT_COLORS[color || stackDraft.color]
          ? color || stackDraft.color
          : "yellow",
        x: clampedX,
        y: clampedY,
        width: size,
        height: size,
        pinnedTarget: null,
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
        return {
          ...note,
          ...resolved,
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

  // Toggle pinning a note to the screen/window directly underneath its center coordinate
  const toggleNoteScreenPin = useCallback(async (note) => {
    if (note.pinnedTarget) {
      // Unpin -> becomes globally visible again
      setNotes((prev) =>
        prev.map((n) =>
          n.id === note.id
            ? { ...n, pinnedTarget: null, updatedAt: Date.now() }
            : n
        )
      );
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

    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? { ...n, pinnedTarget: detected, updatedAt: Date.now() }
          : n
      )
    );
    return detected;
  }, []);

  const bringToFront = useCallback((id) => {
    highestZRef.current += 1;
    const nextZ = highestZRef.current;
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, zIndex: nextZ } : note))
    );
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
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
  };
}
