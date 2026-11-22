import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import StickyStack from "./components/StickyStack";
import PinnedNote from "./components/PinnedNote";
import TrashDock, { isPointInTrashZone } from "./components/TrashDock";
import BasketDock, { isPointInBasketZone } from "./components/BasketDock";
import AgentStringsLayer, {
  getNoteThumbtackAnchor,
} from "./components/AgentStringsLayer";
import {
  useNotesStore,
  clampNoteSize,
  getConnectedClusterIds,
} from "./hooks/useNotesStore";
import "./App.css";

const BASKET_SUMMON_DURATION_MS = 25000;

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
    toggleNoteLink,
    removeNoteLink,
    stashNoteToBasket,
    restoreNoteFromBasket,
    stashAllNotesToBasket,
    restoreAllNotesFromBasket,
  } = useNotesStore();

  // Minimizing only hides the StickyStack; active notes remain on screen
  const [isStackMinimized, setIsStackMinimized] = useState(false);

  // Basket is hidden by default unless dragging a note or summoned via Tray / Edge Bar for 25s
  const [isBasketSummoned, setIsBasketSummoned] = useState(false);
  const basketTimerRef = useRef(null);

  const [dragState, setDragState] = useState({
    isDragging: false,
    isOverTrash: false,
    isOverBasket: false,
    source: null,
    noteId: null,
  });

  // Live 60fps positions of notes currently being dragged so connected red strings follow smoothly
  const [livePositionsMap, setLivePositionsMap] = useState({});

  // Active detective red string drag state (when dragging from a note's thumbtack to another note)
  const [activeStringDrag, setActiveStringDrag] = useState(null);

  // Timestamps of recently tied/plucked string pairs for damped harmonic guitar-string vibration
  const [pluckTimestampMap, setPluckTimestampMap] = useState({});

  // Cluster chain-reaction animation state ("dropping-trash" | "dropping-basket") for notes tied to a dropped note
  const [clusterDropAnim, setClusterDropAnim] = useState(null);

  const [visibilityMap, setVisibilityMap] = useState({});

  const isDraggingRef = useRef(false);
  const hoverCountRef = useRef(0);

  const activeNotes = notes.filter((n) => !n.inBasket);
  const basketNotes = notes.filter((n) => Boolean(n.inBasket));

  const summonBasketTemporarily = useCallback(
    (durationMs = BASKET_SUMMON_DURATION_MS) => {
      setIsBasketSummoned(true);
      if (basketTimerRef.current) {
        clearTimeout(basketTimerRef.current);
      }
      basketTimerRef.current = setTimeout(() => {
        setIsBasketSummoned(false);
        basketTimerRef.current = null;
      }, durationMs);
    },
    []
  );

  const dismissBasket = useCallback(() => {
    setIsBasketSummoned(false);
    if (basketTimerRef.current) {
      clearTimeout(basketTimerRef.current);
      basketTimerRef.current = null;
    }
  }, []);

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

  // Listen to System Tray actions (StrictMode-safe single handler)
  useEffect(() => {
    const handleTrayAction = (action) => {
      if (action === "toggle_stack") {
        setIsStackMinimized((prev) => !prev);
      } else if (action === "show_stack") {
        setIsStackMinimized(false);
      } else if (action === "show_basket") {
        summonBasketTemporarily(BASKET_SUMMON_DURATION_MS);
      } else if (action === "stash_all_keep_pins") {
        stashAllNotesToBasket(false);
        summonBasketTemporarily(BASKET_SUMMON_DURATION_MS);
      } else if (action === "stash_all_clear_pins") {
        stashAllNotesToBasket(true);
        summonBasketTemporarily(BASKET_SUMMON_DURATION_MS);
      } else if (action === "restore_all_basket") {
        restoreAllNotesFromBasket(false);
        setIsBasketSummoned(false);
      }
    };

    window.__postitTrayAction = handleTrayAction;

    if (!isTauriRuntime()) {
      return () => {
        delete window.__postitTrayAction;
      };
    }

    let cancelled = false;
    let unlistenFn = null;

    listen("tray-action", (event) => {
      if (cancelled) return;
      handleTrayAction(event.payload);
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
      if (window.__postitTrayAction === handleTrayAction) {
        delete window.__postitTrayAction;
      }
    };
  }, [stashAllNotesToBasket, restoreAllNotesFromBasket, summonBasketTemporarily]);

  // Poll OS window visibility for active screen-pinned notes
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;

    const checkPinnedVisibility = async () => {
      const pinnedNotes = notes.filter(
        (n) => !n.inBasket && Boolean(n.pinnedTarget)
      );
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
  }, [
    notes,
    visibilityMap,
    isStackMinimized,
    isBasketSummoned,
    dragState.isDragging,
    syncInteractiveRegions,
  ]);

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

  const handleRestoreNoteFromBasket = useCallback(
    (noteId, clearPin = false) => {
      const restoredCluster = getConnectedClusterIds(notes, noteId);
      restoreNoteFromBasket(noteId, clearPin);

      // Vibrate all strings in the restored cluster
      if (restoredCluster.size > 1) {
        const ts = performance.now();
        setPluckTimestampMap((prev) => {
          const next = { ...prev };
          for (const idA of restoredCluster) {
            for (const idB of restoredCluster) {
              if (idA < idB) {
                next[`${idA}__${idB}`] = ts;
              }
            }
          }
          return next;
        });
      }

      const remainingInBasket = basketNotes.filter(
        (n) => !restoredCluster.has(n.id)
      ).length;

      if (remainingInBasket <= 0) {
        setIsBasketSummoned(false);
        if (basketTimerRef.current) {
          clearTimeout(basketTimerRef.current);
          basketTimerRef.current = null;
        }
      } else {
        summonBasketTemporarily(BASKET_SUMMON_DURATION_MS);
      }
    },
    [notes, restoreNoteFromBasket, basketNotes, summonBasketTemporarily]
  );

  // Update live 60fps coordinates of a dragged note and trigger a subtle string vibration on drop
  const handleLivePositionChange = useCallback(
    (noteId, posOrNull) => {
      setLivePositionsMap((prev) => {
        if (!posOrNull) {
          if (!(noteId in prev)) return prev;
          const next = { ...prev };
          delete next[noteId];
          return next;
        }
        return { ...prev, [noteId]: posOrNull };
      });

      // When a note finishes dragging, pluck all strings attached to it
      if (!posOrNull) {
        const movedNote = notes.find((n) => n.id === noteId);
        if (
          movedNote &&
          Array.isArray(movedNote.linkedIds) &&
          movedNote.linkedIds.length > 0
        ) {
          const ts = performance.now();
          setPluckTimestampMap((prev) => {
            const next = { ...prev };
            for (const targetId of movedNote.linkedIds) {
              const pairKey =
                noteId < targetId
                  ? `${noteId}__${targetId}`
                  : `${targetId}__${noteId}`;
              next[pairKey] = ts;
            }
            return next;
          });
        }
      }
    },
    [notes]
  );

  // Start pulling a red detective string from a note's thumbtack
  const handleStartStringDrag = useCallback(
    (sourceNote, initialClientX, initialClientY) => {
      isDraggingRef.current = true;
      applyIgnoreCursorEvents(false);
      const startAnchor = getNoteThumbtackAnchor(sourceNote, livePositionsMap);

      setActiveStringDrag({
        sourceId: sourceNote.id,
        startX: startAnchor.x,
        startY: startAnchor.y,
        currentX: initialClientX,
        currentY: initialClientY,
        targetId: null,
        snapTargetAnchor: null,
      });
    },
    [applyIgnoreCursorEvents, livePositionsMap]
  );

  // Track active detective string drag and snap magnetically to target note thumbtacks
  useEffect(() => {
    if (!activeStringDrag) return;

    const findTargetNoteAtPoint = (clientX, clientY) => {
      for (const candidate of activeNotes) {
        if (candidate.id === activeStringDrag.sourceId) continue;
        const isVis = candidate.pinnedTarget
          ? visibilityMap[candidate.id] !== false
          : true;
        if (!isVis) continue;

        const w = clampNoteSize(candidate.width);
        const h = clampNoteSize(candidate.height);
        // Check if cursor is inside the target card or near its top thumbtack
        if (
          clientX >= candidate.x - 16 &&
          clientX <= candidate.x + w + 16 &&
          clientY >= candidate.y - 28 &&
          clientY <= candidate.y + h + 12
        ) {
          return candidate;
        }
      }
      return null;
    };

    const handleMove = (e) => {
      const target = findTargetNoteAtPoint(e.clientX, e.clientY);
      const snapAnchor = target
        ? getNoteThumbtackAnchor(target, livePositionsMap)
        : null;

      setActiveStringDrag((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              targetId: target ? target.id : null,
              snapTargetAnchor: snapAnchor,
            }
          : null
      );
    };

    const handleUp = (e) => {
      const target = findTargetNoteAtPoint(e.clientX, e.clientY);
      if (target) {
        const sourceId = activeStringDrag.sourceId;
        const targetId = target.id;
        toggleNoteLink(sourceId, targetId);

        const pairKey =
          sourceId < targetId
            ? `${sourceId}__${targetId}`
            : `${targetId}__${sourceId}`;
        setPluckTimestampMap((prev) => ({
          ...prev,
          [pairKey]: performance.now(),
        }));
      }

      isDraggingRef.current = false;
      setActiveStringDrag(null);
      setTimeout(syncInteractiveRegions, 50);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    activeStringDrag,
    activeNotes,
    visibilityMap,
    livePositionsMap,
    toggleNoteLink,
    syncInteractiveRegions,
  ]);

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

      if (isDrop && noteId && (overTrash || overBasket)) {
        const clusterIds = getConnectedClusterIds(notes, noteId);
        if (clusterIds.size > 1) {
          setClusterDropAnim({
            ids: clusterIds,
            sourceId: noteId,
            mode: overTrash ? "dropping-trash" : "dropping-basket",
          });
          setTimeout(() => {
            setClusterDropAnim(null);
          }, 290);
        }
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
    [notes, applyIgnoreCursorEvents, syncInteractiveRegions]
  );

  // Active cluster of the currently dragged note (so tied partner notes react over Trash/Basket)
  const draggedClusterIds =
    dragState.isDragging && dragState.noteId
      ? getConnectedClusterIds(notes, dragState.noteId)
      : null;

  return (
    <main className="relative w-screen h-screen bg-transparent overflow-hidden select-none">
      {/* 1. Post-it Stack in the corner */}
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

      {/* 2. Pinned Independent Sticker Cards */}
      {activeNotes.map((note) => {
        const isVisibleOnScreen = note.pinnedTarget
          ? visibilityMap[note.id] !== false
          : true;

        // Determine if this note is being pulled into Trash or Basket via a connected red string
        let clusterEffect = null;
        if (
          clusterDropAnim &&
          clusterDropAnim.ids.has(note.id) &&
          clusterDropAnim.sourceId !== note.id
        ) {
          clusterEffect = clusterDropAnim.mode;
        } else if (
          draggedClusterIds &&
          draggedClusterIds.has(note.id) &&
          dragState.noteId !== note.id
        ) {
          if (dragState.isOverTrash) {
            clusterEffect = "hover-trash";
          } else if (dragState.isOverBasket) {
            clusterEffect = "hover-basket";
          }
        }

        return (
          <PinnedNote
            key={note.id}
            note={note}
            isVisibleOnScreen={isVisibleOnScreen}
            isStringTargetHighlighted={activeStringDrag?.targetId === note.id}
            clusterEffect={clusterEffect}
            onUpdate={updateNote}
            onToggleScreenPin={toggleNoteScreenPin}
            onStartStringDrag={handleStartStringDrag}
            onLivePositionChange={handleLivePositionChange}
            onStashToBasket={stashNoteToBasket}
            onDelete={deleteNote}
            onBringToFront={bringToFront}
            onDragStateChange={handleDragStateChange}
            onInteractiveEnter={handleInteractiveEnter}
            onInteractiveLeave={handleInteractiveLeave}
          />
        );
      })}

      {/* 3. 2.5D Detective Red Yarn Strings Layer between connected Post-it thumbtacks */}
      <AgentStringsLayer
        notes={activeNotes}
        visibilityMap={visibilityMap}
        livePositionsMap={livePositionsMap}
        activeStringDrag={activeStringDrag}
        pluckTimestampMap={pluckTimestampMap}
        onCutString={removeNoteLink}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />

      {/* 4. 2.5D Storage Basket */}
      <BasketDock
        isVisible={dragState.isDragging || isBasketSummoned}
        isOverBasket={dragState.isOverBasket}
        basketNotes={basketNotes}
        onRestoreNote={handleRestoreNoteFromBasket}
        onSummonBasket={() => summonBasketTemporarily(BASKET_SUMMON_DURATION_MS)}
        onDismissBasket={dismissBasket}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />

      {/* 5. 2.5D Metallic Trash Can */}
      <TrashDock
        isVisible={dragState.isDragging}
        isOverTrash={dragState.isOverTrash}
        onInteractiveEnter={handleInteractiveEnter}
        onInteractiveLeave={handleInteractiveLeave}
      />
    </main>
  );
}
