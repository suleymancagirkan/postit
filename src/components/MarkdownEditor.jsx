import React, { useRef, useEffect, useState } from "react";

const CHECKBOX_SVG_CHECKED = `<svg viewBox="0 0 14 14" fill="none" class="w-3 h-3 text-white pointer-events-none"><path d="M3 7.3L5.8 10L11 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Cute vibrant vector clock icon for @25d / @19.20 inline timer badges (no emoji)
const TIMER_CHIP_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 shrink-0 pointer-events-none"><circle cx="8" cy="8.5" r="5.8" stroke="currentColor" stroke-width="1.7"/><path d="M8 5.5V8.5L10.2 9.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.2 1.8H9.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12.6" cy="3.8" r="1" fill="currentColor"/></svg>`;

/**
 * Downscales & compresses a pasted or dropped screenshot/image Blob into a lightweight data URL
 * so screenshots stay crisp on the Post-it and fast inside SQLite postit.db.
 */
function compressImageFileToDataUrl(file, maxWidth = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Creates a Polaroid/Sticker screenshot element inside the Post-it note with a hover delete button.
 */
function createScreenshotFigureElement(dataUrl) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-screenshot-card", "true");
  wrapper.setAttribute("contenteditable", "false");
  wrapper.className =
    "group/img relative my-1.5 p-1.5 rounded-2xl bg-white/75 border border-black/15 shadow-sm select-none overflow-hidden";

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Ekran Görüntüsü";
  img.className = "w-full max-h-40 object-contain rounded-xl pointer-events-none block";

  const removeBtn = document.createElement("span");
  removeBtn.setAttribute("data-remove-screenshot", "true");
  removeBtn.title = "Görseli Kaldır";
  removeBtn.className =
    "absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-neutral-900/85 hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity cursor-pointer shadow-md";
  removeBtn.textContent = "×";

  wrapper.appendChild(img);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

/**
 * Builds a DOM element for an interactive Todo row inside the contentEditable surface.
 */
function createTodoItemElement(initialText = "", isChecked = false) {
  const row = document.createElement("div");
  row.setAttribute("data-todo-item", "true");
  row.setAttribute("data-checked", isChecked ? "true" : "false");
  row.className = "flex items-start gap-2 my-0.5 leading-snug";

  const box = document.createElement("span");
  box.setAttribute("data-todo-box", "true");
  box.setAttribute("contenteditable", "false");
  box.className = isChecked
    ? "mt-[2px] w-4 h-4 rounded-[5px] border-[1.5px] border-neutral-900 bg-neutral-900 inline-flex items-center justify-center cursor-pointer shrink-0 select-none transition-all shadow-2xs"
    : "mt-[2px] w-4 h-4 rounded-[5px] border-[1.5px] border-neutral-800/65 bg-black/5 hover:bg-black/12 inline-flex items-center justify-center cursor-pointer shrink-0 select-none transition-all";
  box.innerHTML = isChecked ? CHECKBOX_SVG_CHECKED : "";

  const textSpan = document.createElement("span");
  textSpan.setAttribute("data-todo-text", "true");
  textSpan.className = isChecked
    ? "flex-1 min-w-[8px] outline-none line-through opacity-55 transition-opacity"
    : "flex-1 min-w-[8px] outline-none transition-opacity";
  textSpan.appendChild(document.createTextNode("\u200B" + initialText));

  row.appendChild(box);
  row.appendChild(textSpan);
  return { row, textSpan };
}

/**
 * Updates the visual classes of an existing Todo row when toggled.
 */
function setTodoItemCheckedState(row, isChecked) {
  row.setAttribute("data-checked", isChecked ? "true" : "false");
  const box = row.querySelector('[data-todo-box="true"]');
  const textSpan = row.querySelector('[data-todo-text="true"]');

  if (box) {
    box.className = isChecked
      ? "mt-[2px] w-4 h-4 rounded-[5px] border-[1.5px] border-neutral-900 bg-neutral-900 inline-flex items-center justify-center cursor-pointer shrink-0 select-none transition-all shadow-2xs"
      : "mt-[2px] w-4 h-4 rounded-[5px] border-[1.5px] border-neutral-800/65 bg-black/5 hover:bg-black/12 inline-flex items-center justify-center cursor-pointer shrink-0 select-none transition-all";
    box.innerHTML = isChecked ? CHECKBOX_SVG_CHECKED : "";
  }

  if (textSpan) {
    textSpan.className = isChecked
      ? "flex-1 min-w-[8px] outline-none line-through opacity-55 transition-opacity"
      : "flex-1 min-w-[8px] outline-none transition-opacity";
  }
}

/**
 * Converts initial stored text/HTML (including raw markdown like **bold**, *italic*, ~~strike~~, `code`, - [ ] todo)
 * into safe formatted HTML for the contentEditable surface.
 */
function formatInitialContent(raw) {
  if (!raw) return "";
  if (/<(strong|em|del|code|mark|div|br|span)\b/i.test(raw)) {
    return raw;
  }

  let html = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="font-extrabold">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic">$2</em>')
    .replace(/~~([^~]+)~~/g, '<del class="line-through opacity-75">$1</del>')
    .replace(
      /==([^=]+)==/g,
      '<mark class="bg-black/12 px-1 rounded text-inherit">$1</mark>'
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-black/10 px-1.5 py-0.5 rounded text-[12px] font-mono">$1</code>'
    )
    .replace(/\n/g, "<br>");

  return html;
}

/**
 * Places the caret right after a newly inserted node by inserting a zero-width text node
 * outside the inline formatting tag so subsequent typing continues in normal weight.
 */
function placeCaretAfterElement(el, trailingText = "") {
  const parent = el.parentNode;
  if (!parent) return;

  const afterText = document.createTextNode("\u200B" + trailingText);
  if (el.nextSibling) {
    parent.insertBefore(afterText, el.nextSibling);
  } else {
    parent.appendChild(afterText);
  }

  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(afterText, 1);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtStartOfSpan(span) {
  const sel = window.getSelection();
  if (!sel) return;
  let textNode = span.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = document.createTextNode("\u200B");
    span.insertBefore(textNode, span.firstChild);
  }
  const offset = textNode.nodeValue?.startsWith("\u200B") ? 1 : 0;
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Checks if the text right before the caret ends with a completed Markdown pattern
 * (e.g. **bold**, *italic*, ~~strike~~, ==highlight==, `code`, [] / [ ] todo, or line-start # / - )
 * and converts it live in the DOM.
 */
function tryApplyLiveMarkdown() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;

  const anchorNode = sel.anchorNode;
  if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return false;

  const caretOffset = sel.anchorOffset;
  const fullText = anchorNode.nodeValue || "";
  const beforeRaw = fullText.slice(0, caretOffset);
  const afterRaw = fullText.slice(caretOffset);

  // 1. **bold** or __bold__
  const boldMatch =
    beforeRaw.match(/\*\*([^*]+)\*\*$/) || beforeRaw.match(/__([^_]+)__$/);
  if (boldMatch && boldMatch[1].trim().length > 0) {
    const matchStr = boldMatch[0];
    const content = boldMatch[1];
    const startIdx = beforeRaw.length - matchStr.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const strong = document.createElement("strong");
    strong.className = "font-extrabold";
    strong.textContent = content;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(strong, anchorNode.nextSibling);
    } else {
      parent.appendChild(strong);
    }

    placeCaretAfterElement(strong, afterRaw);
    return true;
  }

  // 2. ~~strikethrough~~
  const strikeMatch = beforeRaw.match(/~~([^~]+)~~$/);
  if (strikeMatch && strikeMatch[1].trim().length > 0) {
    const matchStr = strikeMatch[0];
    const content = strikeMatch[1];
    const startIdx = beforeRaw.length - matchStr.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const del = document.createElement("del");
    del.className = "line-through opacity-75";
    del.textContent = content;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(del, anchorNode.nextSibling);
    } else {
      parent.appendChild(del);
    }

    placeCaretAfterElement(del, afterRaw);
    return true;
  }

  // 3. ==highlight==
  const markMatch = beforeRaw.match(/==([^=]+)==$/);
  if (markMatch && markMatch[1].trim().length > 0) {
    const matchStr = markMatch[0];
    const content = markMatch[1];
    const startIdx = beforeRaw.length - matchStr.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const mark = document.createElement("mark");
    mark.className = "bg-black/12 px-1 rounded text-inherit";
    mark.textContent = content;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(mark, anchorNode.nextSibling);
    } else {
      parent.appendChild(mark);
    }

    placeCaretAfterElement(mark, afterRaw);
    return true;
  }

  // 4. `inline code`
  const codeMatch = beforeRaw.match(/`([^`]+)`$/);
  if (codeMatch && codeMatch[1].trim().length > 0) {
    const matchStr = codeMatch[0];
    const content = codeMatch[1];
    const startIdx = beforeRaw.length - matchStr.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const code = document.createElement("code");
    code.className =
      "bg-black/10 px-1.5 py-0.5 rounded text-[12px] font-mono";
    code.textContent = content;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(code, anchorNode.nextSibling);
    } else {
      parent.appendChild(code);
    }

    placeCaretAfterElement(code, afterRaw);
    return true;
  }

  // 5. *italic* (single * only)
  const italicMatch = beforeRaw.match(/(^|[^*])\*([^*\s][^*]*)\*$/);
  if (italicMatch && italicMatch[2].trim().length > 0) {
    const leadingChar = italicMatch[1] || "";
    const content = italicMatch[2];
    const fullMatched = italicMatch[0];
    const startIdx = beforeRaw.length - fullMatched.length + leadingChar.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const em = document.createElement("em");
    em.className = "italic";
    em.textContent = content;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(em, anchorNode.nextSibling);
    } else {
      parent.appendChild(em);
    }

    placeCaretAfterElement(em, afterRaw);
    return true;
  }

  // 6. Timer / Alarm expression: "@25d ", "@15dk ", "@30s ", "@30sn ", "@19.20 ", "@19:20 "
  const timerMatch = beforeRaw.match(
    /(?:^|\s)@(\d{1,2}[.:]\d{2}|\d{1,3}\s*(?:dk|d|min|m|sn|s|sa|h))\s$/i
  );
  if (timerMatch) {
    const rawExpr = timerMatch[1].trim();
    const fullMatched = timerMatch[0];
    const leadingSpace = fullMatched.startsWith(" ") ? " " : "";
    const startIdx = beforeRaw.length - fullMatched.length + leadingSpace.length;
    const prefix = beforeRaw.slice(0, startIdx);

    anchorNode.nodeValue = prefix;
    const chip = document.createElement("span");
    chip.setAttribute("data-timer-chip", "true");
    chip.setAttribute("data-timer-expr", rawExpr);
    chip.setAttribute("contenteditable", "false");
    chip.className =
      "inline-flex items-center gap-1 px-2.5 py-0.5 mx-0.5 rounded-full bg-white/65 text-inherit font-extrabold text-[11.5px] border border-black/15 shadow-[0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-white/50 select-none align-middle transition-transform hover:scale-105";
    chip.innerHTML = `${TIMER_CHIP_ICON_SVG}<span class="tracking-tight">${rawExpr}</span>`;

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(chip, anchorNode.nextSibling);
    } else {
      parent.appendChild(chip);
    }

    placeCaretAfterElement(chip, afterRaw);
    return true;
  }

  // 7. Interactive Todo Checkbox shortcut: "[] ", "[ ] ", "- [] ", "- [ ] ", "[x] "
  const cleanBefore = beforeRaw.replace(/^\u200B+/, "");
  const todoMatch = cleanBefore.match(/^(?:-\s+|\*\s+|•\s+)?\[([ xX]?)\]\s$/);
  if (todoMatch && !anchorNode.parentElement?.closest('[data-todo-item="true"]')) {
    const isChecked = todoMatch[1].toLowerCase() === "x";
    const { row, textSpan } = createTodoItemElement(afterRaw, isChecked);

    const parent = anchorNode.parentNode;
    // If anchorNode is inside a block div created by contentEditable on Enter, replace that block
    if (
      parent &&
      parent.nodeName === "DIV" &&
      !parent.hasAttribute("contenteditable") &&
      parent.childNodes.length === 1
    ) {
      parent.parentNode.replaceChild(row, parent);
    } else {
      anchorNode.nodeValue = "";
      if (anchorNode.nextSibling) {
        parent.insertBefore(row, anchorNode.nextSibling);
      } else {
        parent.appendChild(row);
      }
      if (anchorNode.nodeValue === "") {
        parent.removeChild(anchorNode);
      }
    }

    placeCaretAtStartOfSpan(textSpan);
    return true;
  }

  // 7. Line-start shortcuts: "- " -> "• ", "# " -> Heading
  if (cleanBefore === "- " || cleanBefore === "* ") {
    const replacement = "• ";
    anchorNode.nodeValue = replacement + afterRaw;
    const range = document.createRange();
    range.setStart(anchorNode, replacement.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  if (cleanBefore === "# " || cleanBefore === "## ") {
    const isH1 = cleanBefore === "# ";
    anchorNode.nodeValue = "";
    const headingSpan = document.createElement("span");
    headingSpan.className = isH1
      ? "text-[16.5px] font-extrabold tracking-tight block leading-snug"
      : "text-[14.5px] font-bold tracking-tight block leading-snug";
    const innerText = document.createTextNode("\u200B" + afterRaw);
    headingSpan.appendChild(innerText);

    const parent = anchorNode.parentNode;
    if (anchorNode.nextSibling) {
      parent.insertBefore(headingSpan, anchorNode.nextSibling);
    } else {
      parent.appendChild(headingSpan);
    }

    const range = document.createRange();
    range.setStart(innerText, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  return false;
}

export default function MarkdownEditor({
  value,
  onChange,
  onFocus,
  placeholder,
  textClass = "",
  placeholderClass = "",
  resetKey,
}) {
  const editorRef = useRef(null);
  const lastEmittedRef = useRef(value);
  const [isEmpty, setIsEmpty] = useState(() => !value || !value.trim());

  const computeIsEditorEmpty = (el) => {
    if (!el) return true;
    const hasRichBlock = Boolean(
      el.querySelector(
        '[data-todo-item="true"], [data-screenshot-card="true"], [data-timer-chip="true"]'
      )
    );
    if (hasRichBlock) return false;
    const plain = el.innerText.replace(/\u200B/g, "").trim();
    return plain.length === 0;
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (value !== lastEmittedRef.current || el.innerHTML === "") {
      const formatted = formatInitialContent(value || "");
      el.innerHTML = formatted;
      lastEmittedRef.current = value || "";
      setIsEmpty(computeIsEditorEmpty(el));
    }
  }, [value, resetKey]);

  const emitCurrentHtml = () => {
    const el = editorRef.current;
    if (!el) return;
    const nextIsEmpty = computeIsEditorEmpty(el);
    setIsEmpty(nextIsEmpty);
    const nextHtml = nextIsEmpty ? "" : el.innerHTML;
    lastEmittedRef.current = nextHtml;
    onChange?.(nextHtml);
  };

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    tryApplyLiveMarkdown();
    emitCurrentHtml();
  };

  // Toggle interactive Todo checkbox OR remove pasted screenshot on click
  const handleEditorMouseDown = (e) => {
    const removeImgBtn = e.target.closest?.('[data-remove-screenshot="true"]');
    if (removeImgBtn) {
      e.preventDefault();
      e.stopPropagation();
      const card = removeImgBtn.closest('[data-screenshot-card="true"]');
      if (card) {
        card.remove();
        emitCurrentHtml();
      }
      return;
    }

    const box = e.target.closest?.('[data-todo-box="true"]');
    if (!box) return;

    e.preventDefault();
    e.stopPropagation();

    const row = box.closest('[data-todo-item="true"]');
    if (!row) return;

    const currentlyChecked = row.getAttribute("data-checked") === "true";
    setTodoItemCheckedState(row, !currentlyChecked);
    emitCurrentHtml();
  };

  const insertImageFileIntoEditor = async (file) => {
    const el = editorRef.current;
    if (!el || !file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const fig = createScreenshotFigureElement(dataUrl);

      const sel = window.getSelection();
      if (sel && sel.rangeCount && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(fig);
        placeCaretAfterElement(fig);
      } else {
        el.appendChild(fig);
        placeCaretAfterElement(fig);
      }
      emitCurrentHtml();
    } catch {
      // ignore invalid image
    }
  };

  // Support Ctrl+V pasting screenshots / images from clipboard directly onto the Post-it
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await insertImageFileIntoEditor(file);
        }
        return;
      }
    }
  };

  // Support dragging & dropping an image file onto the Post-it
  const handleDrop = async (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (file.type && file.type.startsWith("image/")) {
        e.preventDefault();
        e.stopPropagation();
        await insertImageFileIntoEditor(file);
        return;
      }
    }
  };

  const handleKeyDown = (e) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const anchorNode = sel.anchorNode;
    const currentElement =
      anchorNode?.nodeType === Node.ELEMENT_NODE
        ? anchorNode
        : anchorNode?.parentElement;
    const todoRow = currentElement?.closest?.('[data-todo-item="true"]');

    // Handle Enter inside a Todo item: continue with a new Todo, or exit Todo mode if current item is empty
    if (e.key === "Enter" && !e.shiftKey && todoRow) {
      e.preventDefault();
      const textSpan = todoRow.querySelector('[data-todo-text="true"]');
      const itemText = (textSpan?.textContent || "").replace(/\u200B/g, "").trim();

      const parent = todoRow.parentNode;
      if (!parent) return;

      if (itemText.length === 0) {
        // Empty todo item -> replace with normal text line
        const normalLine = document.createElement("div");
        const normalText = document.createTextNode("\u200B");
        normalLine.appendChild(normalText);
        parent.replaceChild(normalLine, todoRow);

        const range = document.createRange();
        range.setStart(normalText, 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Non-empty todo item -> insert a fresh unchecked todo item right below it
        const { row: nextRow, textSpan: nextSpan } = createTodoItemElement("", false);
        if (todoRow.nextSibling) {
          parent.insertBefore(nextRow, todoRow.nextSibling);
        } else {
          parent.appendChild(nextRow);
        }
        placeCaretAtStartOfSpan(nextSpan);
      }

      emitCurrentHtml();
      return;
    }

    // Handle Backspace at the start of an empty Todo item -> remove the checkbox
    if (e.key === "Backspace" && sel.isCollapsed && todoRow) {
      const textSpan = todoRow.querySelector('[data-todo-text="true"]');
      const rawText = (textSpan?.textContent || "").replace(/\u200B/g, "");
      if (rawText.length === 0 || sel.anchorOffset <= 1) {
        const beforeCursor = (anchorNode?.nodeValue || "")
          .slice(0, sel.anchorOffset)
          .replace(/\u200B/g, "");
        if (beforeCursor.length === 0) {
          e.preventDefault();
          const parent = todoRow.parentNode;
          if (!parent) return;
          const normalLine = document.createElement("div");
          const normalText = document.createTextNode("\u200B" + rawText);
          normalLine.appendChild(normalText);
          parent.replaceChild(normalLine, todoRow);

          const range = document.createRange();
          range.setStart(normalText, 1);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          emitCurrentHtml();
          return;
        }
      }
    }

    // Auto-clear empty bullet list on Enter
    if (e.key === "Enter" && !e.shiftKey && sel.isCollapsed) {
      if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) {
        const lineText = (anchorNode.nodeValue || "").replace(/^\u200B+/, "");
        if (lineText === "• " || lineText === "•") {
          e.preventDefault();
          anchorNode.nodeValue = "";
          handleInput();
        }
      }
    }
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden cursor-text">
      {isEmpty && (
        <div
          className={`pointer-events-none absolute inset-0 text-[13.5px] leading-relaxed font-medium select-none opacity-60 cursor-text ${textClass} ${placeholderClass}`}
        >
          {placeholder}
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onMouseDown={handleEditorMouseDown}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className={`w-full h-full overflow-y-auto bg-transparent border-0 outline-none cursor-text ${textClass} text-[13.5px] leading-relaxed font-medium postit-scroll select-text break-words whitespace-pre-wrap`}
      />
    </div>
  );
}
