// ==UserScript==
// @name         HN Click-To-Toggle Comments
// @namespace    https://github.com/jlmcgraw
// @version      1.0.1
// @description  Click anywhere on a Hacker News comment to collapse/expand it (forwards click to the built-in [-]/[+] control).
// @author       Jesse McGraw
// @match        https://news.ycombinator.com/item?id=*
// @match        https://news.ycombinator.com/threads*
// @match        https://news.ycombinator.com/from*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jlmcgraw/hacker_news_tampermonkey/main/hacker_news-click-toggle.user.js
// @updateURL    https://raw.githubusercontent.com/jlmcgraw/hacker_news_tampermonkey/main/hacker_news-click-toggle.user.js
// @homepageURL  https://github.com/jlmcgraw/hacker_news_tampermonkey/
// @supportURL   https://github.com/jlmcgraw/hacker_news_tampermonkey/issues
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Find the toggle anchor inside a comment row.
   * HN typically uses <a class="togg">[-]</a> and switches to "[+]".
   * We try class first, then fallback to text match to be robust.
   */
  function findToggleAnchor(commentRow) {
    // Prefer the official toggler if present
    let a = commentRow.querySelector("a.togg");
    if (a) return a;

    // Fallback: find an <a> whose trimmed text is [-], [–], or [+]
    const anchors = commentRow.querySelectorAll("a");
    for (const el of anchors) {
      const t = (el.textContent || "").trim();
      if (t === "[-]" || t === "[–]" || t === "[+]") {
        return el;
      }
    }
    return null;
  }

  /**
   * True if the click should be ignored (on links, inputs, etc.)
   */
  function isInteractiveTarget(target) {
    return Boolean(
      target.closest(
        "a, button, input, textarea, select, summary, details, code a, pre a"
      )
    );
  }

  /**
   * Attach a click handler to a single HN comment <tr>.
   */
  function enhanceCommentRow(tr) {
    if (!tr || tr.dataset.hnClickToggle === "1") return;
    tr.dataset.hnClickToggle = "1";

    // Make the main content area show a pointer cursor (optional but nice)
    const defaultCell = tr.querySelector("td.default");
    if (defaultCell) {
      defaultCell.style.cursor = "pointer";
      defaultCell.title = "Click to collapse/expand";
    }

    tr.addEventListener("click", (ev) => {
      // If user is selecting text, don't toggle.
      if (window.getSelection && window.getSelection().toString().length > 0) {
        return;
      }
      // Don't interfere with normal interactive elements.
      if (isInteractiveTarget(ev.target)) return;

      const toggler = findToggleAnchor(tr);
      if (toggler) {
        // Prevent table-level handlers on HN from double-handling
        ev.stopPropagation();
        // Forward the click to the native toggler
        toggler.click();
      }
    });
  }

  /**
   * Find all current comment rows and enhance them.
   */
  function enhanceAll() {
    const rows = document.querySelectorAll("tr.athing.comtr");
    rows.forEach(enhanceCommentRow);
  }

  // Initial pass
  enhanceAll();

  // In case HN or browser loads fragments later (rare), watch for new rows.
  const mo = new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches && node.matches("tr.athing.comtr")) {
          enhanceCommentRow(node);
        } else {
          // Check descendants
          node
            .querySelectorAll?.("tr.athing.comtr")
            .forEach((tr) => enhanceCommentRow(tr));
        }
      }
    }
  });

  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
