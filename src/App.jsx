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
import DeskClockWidget, {
  DESK_CLOCK_ID,
  DESK_CLOCK_SIZE,
  getDefaultClockPosition,
  getClockThumbtackAnchor,
  playStandByAlarmChime,
} from "./components/DeskClockWidget";
import {
  useNotesStore,
  clampNoteSize,
  getConnectedClusterIds,
} from "./hooks/useNotesStore";
import "./App.css";

const BASKET_SUMMON_DURATION_MS = 25000;
const STORAGE_KEY_CLOCK_POS = "postit_desktop_clock_pos_v1";

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

  const [isStackMinimized, setIsStackMinimized] = useState(false);

  // 2.5D iOS StandBy Mode Desktop Clock plugin state
  const [isClockEnabled, setIsClockEnabled] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [ringingNoteIds, setRingingNoteIds] = useState([]);
  const [clockPos, setClockPos] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOCK_POS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return getDefaultClockPosition();
  });

  const [isBasketSummoned, setIsBasketSummoned] = useState(false);
  const basketTimerRef = useRef(null);

  const [dragState, setDragState] = useState({
    isDragging: false,
    isOverTrash: false,
    isOverBasket: false,
    source: null,
    noteId: null,
  });

  const [livePositionsMap, setLivePositionsMap] = useState({});
  const [activeStringDrag, setActiveStringDrag] = useState(null);
  const [pluckTimestampMap, setPluckTimestampMap] = useState({});
  const [clusterDropAnim, setClusterDropAnim] = useState(null);
  const [visibilityMap, setVisibilityMap] = useState({});

  const isDraggingRef = useRef(false);
  const hoverCountRef = useRef(0);
  const firedTimersRef = useRef(new Set());
  const lastIgnoreStateRef = useRef(null);
  const lastRegionsSigRef = useRef("");

  const activeNotes = notes.filter((n) => !n.inBasket);
  const basketNotes = notes.filter((n) => Boolean(n.inBasket));
  const hasAnyActiveNoteTimer = activeNotes.some((n) =>
    Boolean(n.activeTimer?.targetAt)
  );

  // Only tick when at least one note has an active @25d / @19.20 timer (zero idle re-renders)
  useEffect(() => {
    if (!hasAnyActiveNoteTimer) return;

    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNowTs(currentNow);

      for (const note of activeNotes) {
        const timer = note.activeTimer;
        if (!timer || !timer.targetAt) continue;

        const timerKey = `${note.id}_${timer.startedAt}_${timer.targetAt}`;
        if (
          currentNow >= timer.targetAt &&
          !firedTimersRef.current.has(timerKey)
        ) {
          firedTimersRef.current.add(timerKey);
          playStandByAlarmChime();
          setRingingNoteIds((prev) =>
            prev.includes(note.id) ? prev : [...prev, note.id]
          );
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hasAnyActiveNoteTimer, activeNotes]);

  // Repeat alarm chime every 2.8s while any note's @timer is ringing
  useEffect(() => {
    if (ringingNoteIds.length === 0) return;

    const chimeInterval = setInterval(() => {
      playStandByAlarmChime();
    }, 2800);

    return () => clearInterval(chimeInterval);
  }, [ringingNoteIds]);

  const handleDismissTimerAlarm = useCallback(
    (noteId) => {
      setRingingNoteIds((prev) => prev.filter((id) => id !== noteId));
      // Clear the finished/cancelled activeTimer on that note and remove the timer chip from text if desired
      updateNote(noteId, (note) => ({
        activeTimer: null,
        text: (note.text || "").replace(
          /<span[^>]*data-timer-chip="true"[^>]*>.*?<\/span>/gi,
          ""
        ),
      }));
    },
    [updateNote]
  );

  // Collect all active timer entries sorted by soonest expiration (ringing timers first)
  // so multiple simultaneous timers render concentric colored rings on the StandBy Desk Clock!
  const activeTimerEntries = (() => {
    const timedNotes = activeNotes.filter((n) => Boolean(n.activeTimer?.targetAt));
    if (timedNotes.length === 0) return [];

    return timedNotes
      .map((note) => {
        const t = note.activeTimer;
        const remainingMs = Math.max(0, t.targetAt - nowTs);
        const totalMs = Math.max(
          1000,
          t.totalMs || t.targetAt - t.startedAt || 60000
        );
        const elapsedRatio = Math.max(
          0,
          Math.min(1, 1 - remainingMs / totalMs)
        );
        const isRinging = ringingNoteIds.includes(note.id);
        return {
          note,
          remainingMs,
          progress: isRinging ? 1 : elapsedRatio,
          isRinging,
        };
      })
      .sort((a, b) => {
        if (a.isRinging !== b.isRinging) return a.isRinging ? -1 : 1;
        return a.remainingMs - b.remainingMs;
      });
  })();

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
    if (lastIgnoreStateRef.current === ignore) return;
    lastIgnoreStateRef.current = ignore;
    try {
      await invoke("set_click_through", { ignore });
    } catch {
      // ignore in browser preview
    }
  }, []);

  const syncInteractiveRegions = useCallback(() => {
    if (!isTauriRuntime()) return;
    const elements = document.querySelectorAll('[data-interactive="true"]');
    const regions = Array.from(elements).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    });

    const sig = `${isDraggingRef.current}:${regions
      .map((r) => `${r.x},${r.y},${r.width},${r.height}`)
      .join("|")}`;
    if (sig === lastRegionsSigRef.current) return;
    lastRegionsSigRef.current = sig;

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
      } else if (action === "toggle_clock") {
        setIsClockEnabled((prev) => !prev);
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

  // Poll OS window visibility for active screen-pinned notes and Desktop StandBy Clock
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;

    const checkPinnedVisibility = async () => {
      const pinnedNotes = notes.filter(
        (n) => !n.inBasket && Boolean(n.pinnedTarget)
      );

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

      if (isClockEnabled) {
        queries.push({
          id: DESK_CLOCK_ID,
          centerX: clockPos.x + DESK_CLOCK_SIZE.width / 2,
          centerY: clockPos.y + DESK_CLOCK_SIZE.height / 2,
          targetType: "desktop",
          hwnd: 0,
          processName: "desktop",
        });
      }

      if (queries.length === 0) {
        if (!cancelled) setVisibilityMap({});
        return;
      }

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
  }, [notes, isClockEnabled, clockPos.x, clockPos.y]);

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

  const handleStartStringDrag = useCallback(
    (sourceNote, initialClientX, initialClientY) => {
      isDraggingRef.current = true;
      applyIgnoreCursorEvents(false);
      const startAnchor = getNoteThumbtackAnchor(
        sourceNote,
        livePositionsMap,
        clockPos
      );

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
    [applyIgnoreCursorEvents, livePositionsMap, clockPos]
  );

  useEffect(() => {
    if (!activeStringDrag) return;

    const findTargetNoteAtPoint = (clientX, clientY) => {
      const isClockVis =
        isClockEnabled &&
        (visibilityMap[DESK_CLOCK_ID] !== false || ringingNoteIds.length > 0);
      if (
        isClockVis &&
        clientX >= clockPos.x - 12 &&
        clientX <= clockPos.x + DESK_CLOCK_SIZE.width + 12 &&
        clientY >= clockPos.y - 12 &&
        clientY <= clockPos.y + DESK_CLOCK_SIZE.height + 12
      ) {
        return { id: DESK_CLOCK_ID };
      }

      for (const candidate of activeNotes) {
        if (candidate.id === activeStringDrag.sourceId) continue;
        const isVis = candidate.pinnedTarget
          ? visibilityMap[candidate.id] !== false
          : true;
        if (!isVis) continue;

        const w = clampNoteSize(candidate.width);
        const h = clampNoteSize(candidate.height);
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
        ? target.id === DESK_CLOCK_ID
          ? getClockThumbtackAnchor(clockPos)
          : getNoteThumbtackAnchor(target, livePositionsMap, clockPos)
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
    isClockEnabled,
    ringingNoteIds.length,
    clockPos,
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

  const draggedClusterIds =
    dragState.isDragging && dragState.noteId
      ? getConnectedClusterIds(notes, dragState.noteId)
      : null;

  const isClockVisibleOnDesktop =
    isClockEnabled &&
    (visibilityMap[DESK_CLOCK_ID] !== false || ringingNoteIds.length > 0);

  // Any note whose @timer is ringing (plus any notes tied to it by red detective string!) vibrates
  const ringingClusterIds =
    ringingNoteIds.length > 0
      ? (() => {
          const set = new Set();
          for (const rId of ringingNoteIds) {
            const cluster = getConnectedClusterIds(activeNotes, rId);
            cluster.forEach((cid) => set.add(cid));
          }
          return set;
        })()
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

      {/* 1.5. 2.5D iOS StandBy Mode Desktop Clock Plugin (Renders concentric colored rings for multiple simultaneous @25d / @19.20 timers!) */}
      {isClockEnabled && (
        <DeskClockWidget
          clockPos={clockPos}
          onClockPosChange={setClockPos}
          isVisibleOnDesktop={isClockVisibleOnDesktop}
          isStringTargetHighlighted={activeStringDrag?.targetId === DESK_CLOCK_ID}
          activeTimerEntries={activeTimerEntries}
          onDismissRingingTimer={handleDismissTimerAlarm}
          onInteractiveEnter={handleInteractiveEnter}
          onInteractiveLeave={handleInteractiveLeave}
        />
      )}

      {/* 2. Pinned Independent Sticker Cards */}
      {activeNotes.map((note) => {
        const isVisibleOnScreen = note.pinnedTarget
          ? visibilityMap[note.id] !== false
          : true;

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

        const isNoteAlarmRinging = Boolean(
          ringingClusterIds && ringingClusterIds.has(note.id)
        );
        const timerRemainingMs = note.activeTimer?.targetAt
          ? Math.max(0, note.activeTimer.targetAt - nowTs)
          : null;

        return (
          <PinnedNote
            key={note.id}
            note={note}
            isVisibleOnScreen={isVisibleOnScreen}
            isStringTargetHighlighted={activeStringDrag?.targetId === note.id}
            isClockAlarmRinging={isNoteAlarmRinging}
            timerRemainingMs={timerRemainingMs}
            onDismissTimerAlarm={handleDismissTimerAlarm}
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

      {/* 3. 2.5D Detective Red Yarn Strings Layer */}
      <AgentStringsLayer
        notes={activeNotes}
        visibilityMap={visibilityMap}
        livePositionsMap={livePositionsMap}
        clockPos={clockPos}
        isClockVisible={isClockVisibleOnDesktop}
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
