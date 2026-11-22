import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import StickyStack from "./components/StickyStack";
import PinnedNote from "./components/PinnedNote";
import TrashDock, { isPointInTrashZone } from "./components/TrashDock";
import { useNotesStore } from "./hooks/useNotesStore";
import "./App.css";

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export default function App() {
  const {
    notes,
    stackDraft,
    updateStackDraft,
    advanceStackSheet,
    pinNoteFromStack,
    updateNote,
    bringToFront,
    deleteNote,
  } = useNotesStore();

  const [dragState, setDragState] = useState({
    isDragging: false,
    isOverTrash: false,
    source: null,
    noteId: null,
  });

  const isDraggingRef = useRef(false);
  const hoverCountRef = useRef(0);

  // Tauri setIgnoreCursorEvents helper (calls both WebviewWindow.setIgnoreCursorEvents and Rust state sync)
  const applyIgnoreCursorEvents = useCallback(async (ignore) => {
    if (!isTauriRuntime()) return;
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setIgnoreCursorEvents(ignore);
      await invoke("set_click_through", { ignore });
    } catch {
      // Fallback if only one API is reachable
      try {
        await invoke("set_click_through", { ignore });
      } catch {
        // ignore in browser preview
      }
    }
  }, []);

  // Collect all interactive bounding boxes ([data-interactive="true"]) and sync to Rust
  // so that even when setIgnoreCursorEvents(true) is active on empty desktop areas,
  // moving the mouse back over the stack, any pinned card, or the trash dock immediately wakes hit-testing.
  const syncInteractiveRegions = useCallback(() => {
    if (!isTauriRuntime()) return;
    const elements = document.querySelectorAll('[data-interactive="true"]');
    const regions = Array.from(elements).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      };
    });

    invoke("update_hit_regions", {
      regions,
      isDragging: isDraggingRef.current,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    syncInteractiveRegions();
    const timer = setInterval(syncInteractiveRegions, 250);
    window.addEventListener("resize", syncInteractiveRegions);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", syncInteractiveRegions);
    };
  }, [notes, dragState.isDragging, syncInteractiveRegions]);

  // Pointer move listener across the window to toggle setIgnoreCursorEvents dynamically
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDraggingRef.current) {
        applyIgnoreCursorEvents(false);
        return;
      }
      const interactiveEl = e.target?.closest?.('[data-interactive="true"]');
      if (interactiveEl) {
        applyIgnoreCursorEvents(false);
      } else if (hoverCountRef.current <= 0) {
        applyIgnoreCursorEvents(true);
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [applyIgnoreCursorEvents]);

  const handleInteractiveEnter = useCallback(() => {
    hoverCountRef.current += 1;
    applyIgnoreCursorEvents(false);
  }, [applyIgnoreCursorEvents]);

  const handleInteractiveLeave = useCallback(() => {
    hoverCountRef.current = Math.max(0, hoverCountRef.current - 1);
    if (!isDraggingRef.current && hoverCountRef.current === 0) {
      applyIgnoreCursorEvents(true);
    }
  }, [applyIgnoreCursorEvents]);

  // Unified drag state handler for both StickyStack tear-off and PinnedNote drag
  const handleDragStateChange = useCallback(
    ({ isDragging, source, noteId = null, clientX, clientY, isDrop = false }) => {
      const overTrash = isPointInTrashZone(clientX, clientY);
      isDraggingRef.current = isDragging;

      if (isDragging) {
        applyIgnoreCursorEvents(false);
        setDragState({
          isDragging: true,
          isOverTrash: overTrash,
          source,
          noteId,
        });
        return { isOverTrash: overTrash, droppedInTrash: false };
      }

      // Drag ended
      setDragState({
        isDragging: false,
        isOverTrash: false,
        source: null,
        noteId: null,
      });
      setTimeout(syncInteractiveRegions, 50);

      return {
        isOverTrash: overTrash,
        droppedInTrash: Boolean(isDrop && overTrash),
      };
    },
    [applyIgnoreCursorEvents, syncInteractiveRegions]
  );

  return (
    <main className="relative w-screen h-screen bg-transparent overflow-hidden select-none">
      {/* 1. Post-it Stack in the corner */}
      <StickyStack
        draft={stackDraft}
        onUpdateDraft={updateStackDraft}
        onTearOffPin={pinNoteFromStack}
        onDiscardDraft={() => advanceStackSheet(stackDraft.color)}
        onDragStateChange={handleDragStateChange}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
        pinnedCount={notes.length}
      />

      {/* 2. Pinned Independent Sticker Cards */}
      {notes.map((note) => (
        <PinnedNote
          key={note.id}
          note={note}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onBringToFront={bringToFront}
          onDragStateChange={handleDragStateChange}
          onInteractiveEnter={handleInteractiveEnter}
          onInteractiveLeave={handleInteractiveLeave}
        />
      ))}

      {/* 3. 45-Degree Diagonal Trash Dock (appears on drag start) */}
      <TrashDock
        isVisible={dragState.isDragging}
        isOverTrash={dragState.isOverTrash}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />
    </main>
  );
}
