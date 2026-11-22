import React, { useRef, useEffect, useState } from "react";

/**
 * Converts initial stored text/HTML (including raw markdown like **bold**, *italic*, ~~strike~~, `code`)
 * into safe formatted HTML for the contentEditable surface.
 */
function formatInitialContent(raw) {
  if (!raw) return "";
  // If it already contains formatted HTML tags from our editor, return as-is
  if (/<(strong|em|del|code|mark|div|br|span)\b/i.test(raw)) {
    return raw;
  }

  // Otherwise escape basic HTML entities and convert markdown syntax
  let html = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="font-extrabold">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic">$2</em>')
    .replace(/~~([^~]+)~~/g, '<del class="line-through opacity-75">$1</del>')
    .replace(/==([^=]+)==/g, '<mark class="bg-black/12 px-1 rounded text-inherit">$1</mark>')
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

/**
 * Checks if the text right before the caret ends with a completed Markdown pattern
 * (e.g. **bold**, *italic*, ~~strike~~, ==highlight==, `code`, or line-start # / - )
 * and converts it live in the DOM.
 */
function tryApplyLiveMarkdown() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;

  const anchorNode = sel.anchorNode;
  if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return false;

  const caretOffset = sel.anchorOffset;
  const fullText = anchorNode.nodeValue || "";
  // Strip zero-width spaces when matching patterns
  const beforeRaw = fullText.slice(0, caretOffset);
  const afterRaw = fullText.slice(caretOffset);

  // 1. **bold** or __bold__ (triggers the instant the second closing * or _ is typed)
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

  // 2. ~~strikethrough~~ (triggers on the second closing ~)
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

  // 3. ==highlight== (triggers on the second closing =)
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

  // 4. `inline code` (triggers on closing `)
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

  // 5. *italic* (single * only — ignores ** so it never blocks typing **bold**)
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

  // 6. Line-start shortcuts: "- " -> "• ", "# " -> Heading
  const cleanBefore = beforeRaw.replace(/^\u200B+/, "");
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

  // Sync initial content or external resets (e.g. when a sheet is torn off the stack)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    if (value !== lastEmittedRef.current || el.innerHTML === "") {
      const formatted = formatInitialContent(value || "");
      el.innerHTML = formatted;
      lastEmittedRef.current = value || "";
      const plain = el.innerText.replace(/\u200B/g, "").trim();
      setIsEmpty(plain.length === 0);
    }
  }, [value, resetKey]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;

    tryApplyLiveMarkdown();

    const plain = el.innerText.replace(/\u200B/g, "").trim();
    const nextIsEmpty = plain.length === 0;
    setIsEmpty(nextIsEmpty);

    const nextHtml = nextIsEmpty ? "" : el.innerHTML;
    lastEmittedRef.current = nextHtml;
    onChange?.(nextHtml);
  };

  const handleKeyDown = (e) => {
    // Auto-continue bullet lists on Enter
    if (e.key === "Enter" && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && sel.isCollapsed) {
        const node = sel.anchorNode;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const lineText = (node.nodeValue || "").replace(/^\u200B+/, "");
          if (lineText === "• " || lineText === "•") {
            // Empty bullet line -> clear bullet on Enter
            e.preventDefault();
            node.nodeValue = "";
            handleInput();
            return;
          }
        }
      }
    }
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden">
      {isEmpty && (
        <div
          className={`pointer-events-none absolute inset-0 text-[13.5px] leading-relaxed font-medium select-none opacity-60 ${textClass} ${placeholderClass}`}
        >
          {placeholder}
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        className={`w-full h-full overflow-y-auto bg-transparent border-0 outline-none ${textClass} text-[13.5px] leading-relaxed font-medium postit-scroll select-text break-words whitespace-pre-wrap`}
      />
    </div>
  );
}
