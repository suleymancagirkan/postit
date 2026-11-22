import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import StickyStack from "./components/StickyStack";
import PinnedNote from "./components/PinnedNote";
import TrashDock, { isPointInTrashZone } from "./components/TrashDock";
import BasketDock, { isPointInBasketZone } from "./components/BasketDock";
import { useNotesStore, clampNoteSize } from "./hooks/useNotesStore";
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
    toggleNoteScreenPin,
    bringToFront,
    deleteNote,
    stashNoteToBasket,
    restoreNoteFromBasket,
    stashAllNotesToBasket,
    restoreAllNotesFromBasket,
  } = useNotesStore();

  // Minimizing only minimizes the StickyStack; active notes remain on screen
  const [isStackMinimized, setIsStackMinimized] = useState(false);

  const [dragState, setDragState] = useState({
    isDragging: false,
    isOverTrash: false,
    isOverBasket: false,
    source: null,
    noteId: null,
  });

  const [visibilityMap, setVisibilityMap] = useState({});

  const isDraggingRef = useRef(false);
  const hoverCountRef = useRef(0);

  const activeNotes = notes.filter((n) => !n.inBasket);
  const basketNotes = notes.filter((n) => Boolean(n.inBasket));

  const applyIgnoreCursorEvents = useCallback(async (ignore) => {
    if (!isTauriRuntime()) return;
    try {
      const appWindow = getCurrentWindow();
      await appWindow.setIgnoreCursorEvents(ignore);
      await invoke("set_click_through", { ignore });
    } catch {
      try {
        await invoke("set_click_through", { ignore });
      } catch {
        // ignore in browser preview
      }
    }
  }, []);

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

  // Listen to System Tray actions ("toggle_stack", "stash_all_keep_pins", "stash_all_clear_pins", "restore_all_basket")
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenFn = null;
    listen("tray-action", (event) => {
      const action = event.payload;
      if (action === "toggle_stack") {
        setIsStackMinimized((prev) => !prev);
      } else if (action === "stash_all_keep_pins") {
        stashAllNotesToBasket(false);
      } else if (action === "stash_all_clear_pins") {
        stashAllNotesToBasket(true);
      } else if (action === "restore_all_basket") {
        restoreAllNotesFromBasket(false);
      }
    })
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch(() => {});

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [stashAllNotesToBasket, restoreAllNotesFromBasket]);

  // Poll OS window visibility for active screen-pinned notes
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;

    const checkPinnedVisibility = async () => {
      const pinnedNotes = notes.filter((n) => !n.inBasket && Boolean(n.pinnedTarget));
      if (pinnedNotes.length === 0) {
        if (!cancelled) setVisibilityMap({});
        return;
      }

      const queries = pinnedNotes.map((n) => {
        const w = clampNoteSize(n.width);
        const h = clampNoteSize(n.height);
        return {
          id: n.id,
          centerX: n.x + w / 2,
          centerY: n.y + h / 2,
          targetType: n.pinnedTarget.targetType || "desktop",
          hwnd: Number(n.pinnedTarget.hwnd) || 0,
          processName: n.pinnedTarget.processName || "",
        };
      });

      try {
        const results = await invoke("check_notes_visibility", { queries });
        if (cancelled || !Array.isArray(results)) return;

        setVisibilityMap((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const item of results) {
            if (next[item.id] !== item.visible) {
              next[item.id] = item.visible;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch {
        // ignore errors
      }
    };

    checkPinnedVisibility();
    const interval = setInterval(checkPinnedVisibility, 180);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [notes]);

  useEffect(() => {
    syncInteractiveRegions();
    const timer = setInterval(syncInteractiveRegions, 220);
    window.addEventListener("resize", syncInteractiveRegions);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", syncInteractiveRegions);
    };
  }, [notes, visibilityMap, isStackMinimized, dragState.isDragging, syncInteractiveRegions]);

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

  const handleDragStateChange = useCallback(
    ({ isDragging, source, noteId = null, clientX, clientY, isDrop = false }) => {
      const overTrash = isPointInTrashZone(clientX, clientY);
      const overBasket = !overTrash && isPointInBasketZone(clientX, clientY);
      isDraggingRef.current = isDragging;

      if (isDragging) {
        applyIgnoreCursorEvents(false);
        setDragState({
          isDragging: true,
          isOverTrash: overTrash,
          isOverBasket: overBasket,
          source,
          noteId,
        });
        return {
          isOverTrash: overTrash,
          isOverBasket: overBasket,
          droppedInTrash: false,
          droppedInBasket: false,
        };
      }

      setDragState({
        isDragging: false,
        isOverTrash: false,
        isOverBasket: false,
        source: null,
        noteId: null,
      });
      setTimeout(syncInteractiveRegions, 50);

      return {
        isOverTrash: overTrash,
        isOverBasket: overBasket,
        droppedInTrash: Boolean(isDrop && overTrash),
        droppedInBasket: Boolean(isDrop && overBasket),
      };
    },
    [applyIgnoreCursorEvents, syncInteractiveRegions]
  );

  return (
    <main className="relative w-screen h-screen bg-transparent overflow-hidden select-none">
      {/* 1. Post-it Stack in the corner (Minimizing hides only this stack, not the pinned notes) */}
      {!isStackMinimized && (
        <StickyStack
          draft={stackDraft}
          onUpdateDraft={updateStackDraft}
          onTearOffPin={pinNoteFromStack}
          onDiscardDraft={() => advanceStackSheet(stackDraft.color)}
          onMinimizeStack={() => setIsStackMinimized(true)}
          onDragStateChange={handleDragStateChange}
          onInteractiveEnter={handleInteractiveEnter}
          onInteractiveLeave={handleInteractiveLeave}
          pinnedCount={activeNotes.length}
        />
      )}

      {/* 2. Pinned Independent Sticker Cards (Stay on screen even when the stack is minimized) */}
      {activeNotes.map((note) => {
        const isVisibleOnScreen = note.pinnedTarget
          ? visibilityMap[note.id] !== false
          : true;

        return (
          <PinnedNote
            key={note.id}
            note={note}
            isVisibleOnScreen={isVisibleOnScreen}
            onUpdate={updateNote}
            onToggleScreenPin={toggleNoteScreenPin}
            onStashToBasket={stashNoteToBasket}
            onDelete={deleteNote}
            onBringToFront={bringToFront}
            onDragStateChange={handleDragStateChange}
            onInteractiveEnter={handleInteractiveEnter}
            onInteractiveLeave={handleInteractiveLeave}
          />
        );
      })}

      {/* 3. Right-Edge Storage Basket Dock (slides in when dragging, or accessible via right tab) */}
      <BasketDock
        isDragging={dragState.isDragging}
        isOverBasket={dragState.isOverBasket}
        basketNotes={basketNotes}
        activeNotesCount={activeNotes.length}
        isStackMinimized={isStackMinimized}
        onRestoreNote={restoreNoteFromBasket}
        onRestoreAll={restoreAllNotesFromBasket}
        onStashAll={stashAllNotesToBasket}
        onToggleStackMinimized={() => setIsStackMinimized((prev) => !prev)}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />

      {/* 4. Bottom-Right 45-Degree Diagonal Trash Dock */}
      <TrashDock
        isVisible={dragState.isDragging}
        isOverTrash={dragState.isOverTrash}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />
    </main>
  );
}
