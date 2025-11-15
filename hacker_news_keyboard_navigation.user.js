// ==UserScript==
// @name         HN Keyboard Comments (tree nav + fold/expand)
// @namespace    https://github.com/jlmcgraw
// @version      1.1.4
// @description  Keyboard navigation for Hacker News comments: arrows, Enter, Space, Home/End, PageUp/PageDown, and recursive expand/collapse.
// @author       Jesse McGraw
// @match        https://news.ycombinator.com/item*
// @run-at       document-end
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jlmcgraw/hacker_news_tampermonkey/main/hacker_news_keyboard_navigation.user.js
// @updateURL    https://raw.githubusercontent.com/jlmcgraw/hacker_news_tampermonkey/main/hacker_news_keyboard_navigation.user.js
// @homepageURL  https://github.com/jlmcgraw/hacker_news_tampermonkey/
// @supportURL   https://github.com/jlmcgraw/hacker_news_tampermonkey/issues
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Styles ----------
  const style = document.createElement('style');
  style.textContent = `
    .hnkb-active {
      outline: 2px solid rgba(255,165,0,0.28);
      background: rgba(255,225,150,0.18);
      transition: background 80ms ease-in-out, outline-color 80ms ease-in-out;
    }
    .hnkb-collapsed-indicator::before { content: "▸ "; font-weight: 600; }
    .hnkb-expanded-indicator::before { content: "▾ "; font-weight: 600; }
    .hnkb-indicator { color: #828282; margin-right: 4px; user-select: none; }
  `;
  document.head.appendChild(style);

  // ---------- Build nodes ----------
  const rows = Array.from(document.querySelectorAll('tr.athing.comtr'));
  if (rows.length === 0) return;

  /**
   * Determine the nesting depth for a comment row based on the indentation image width.
   */
  function getIndent(tr) {
    const img = tr.querySelector('td.ind img');
    const w = Number(img?.getAttribute('width') || img?.width || 0);
    return Math.floor(w / 40);
  }

  const nodes = rows.map((tr, idx) => ({
    el: tr,
    idx,
    indent: getIndent(tr),
  }));

  // Add a tiny indicator before the commhead
  nodes.forEach(({ el }) => {
    const commhead = el.querySelector('.commhead');
    if (commhead && !commhead.querySelector('.hnkb-indicator')) {
      const span = document.createElement('span');
      span.className = 'hnkb-indicator hnkb-expanded-indicator';
      commhead.prepend(span);
    }
  });

  const collapsed = new Set();

  /**
   * Update each cached row's display state and indicator icons based on collapsed set.
   */
  function recomputeVisibility() {
    const stack = [];
    nodes.forEach((n) => {
      stack.length = n.indent;
      const hiddenByAncestor = stack.some(Boolean);
      n.el.style.display = hiddenByAncestor ? 'none' : '';
      const ind = n.el.querySelector('.hnkb-indicator');
      if (ind) {
        ind.classList.toggle('hnkb-collapsed-indicator', collapsed.has(n.idx));
        ind.classList.toggle('hnkb-expanded-indicator', !collapsed.has(n.idx));
      }
      stack[n.indent] = collapsed.has(n.idx);
    });
  }

  /**
   * Walk backwards to find the index of the closest ancestor comment.
   */
  function findParentIdx(idx) {
    const me = nodes[idx];
    if (!me || me.indent === 0) return -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (nodes[i].indent === me.indent - 1) return i;
    }
    return -1;
  }

  /**
   * Locate the first direct child comment index for a node.
   */
  function findFirstChildIdx(idx) {
    const base = nodes[idx];
    if (!base) return -1;
    for (let i = idx + 1; i < nodes.length; i++) {
      if (nodes[i].indent === base.indent + 1) return i;
      if (nodes[i].indent <= base.indent) break;
    }
    return -1;
  }

  /**
   * True when the comment has at least one child node in the linearized tree.
   */
  function hasChild(idx) {
    return findFirstChildIdx(idx) >= 0;
  }

  /**
   * Test whether the indexed comment is currently displayed.
   */
  function isVisibleIdx(idx) {
    const n = nodes[idx];
    return n && n.el.style.display !== 'none';
    // (recomputeVisibility keeps display up to date)
  }

  /**
   * Detect if a comment row is folded by either our state or HN's native toggle.
   */
  function isFoldedIdx(idx) {
    const row = nodes[idx]?.el;
    if (!row) return false;
    if (row.classList.contains('collapsed')) return true;
    const togg = row.querySelector('.togg');
    if (!togg) return false;
    const text = togg.textContent?.trim();
    return typeof text === 'string' && text.startsWith('[+]');
  }

  /**
   * Step forward/backward through the list to find the next visible comment.
   */
  function nextVisibleIdx(idx, dir) {
    let i = idx + dir;
    while (i >= 0 && i < nodes.length) {
      if (isVisibleIdx(i)) return i;
      i += dir;
    }
    return -1;
  }

  /**
   * Return the index of the first visible comment row.
   */
  function firstVisibleIdx() {
    for (let i = 0; i < nodes.length; i++) if (isVisibleIdx(i)) return i;
    return -1;
  }

  /**
   * Return the index of the last visible comment row.
   */
  function lastVisibleIdx() {
    for (let i = nodes.length - 1; i >= 0; i--) if (isVisibleIdx(i)) return i;
    return -1;
  }

  /**
   * Expand ancestors so the target comment is scrolled into view.
   */
  function ensureVisibleIdx(idx) {
    let cur = idx;
    while (true) {
      const p = findParentIdx(cur);
      if (p < 0) break;
      if (collapsed.has(p)) collapsed.delete(p);
      cur = p;
    }
    recomputeVisibility();
  }

  /**
   * Collapse a single comment node and hide its descendants.
   */
  function collapseIdx(idx) {
    collapsed.add(idx);
    recomputeVisibility();
  }

  /**
   * Expand a collapsed comment node if needed.
   */
  function expandIdx(idx) {
    if (collapsed.has(idx)) {
      collapsed.delete(idx);
      recomputeVisibility();
    }
  }

  /**
   * Check whether a comment index is collapsed in our state set.
   */
  function isCollapsed(idx) {
    return collapsed.has(idx);
  }

  /**
   * Find the exclusive end index of the subtree rooted at the given comment.
   */
  function subtreeEndExclusive(idx) {
    const base = nodes[idx];
    let j = idx + 1;
    while (j < nodes.length && nodes[j].indent > base.indent) j++;
    return j; // exclusive
  }

  /**
   * Collapse all descendants of a comment, marking them in the collapsed set.
   */
  function collapseSubtree(idx) {
    const end = subtreeEndExclusive(idx);
    // Mark every descendant as collapsed so later expands reveal as collapsed nodes stay closed
    for (let i = idx; i < end; i++) collapsed.add(i);
    recomputeVisibility();
  }

  /**
   * Expand an entire subtree by clearing collapsed state for each node.
   */
  function expandSubtree(idx) {
    const end = subtreeEndExclusive(idx);
    for (let i = idx; i < end; i++) collapsed.delete(i);
    recomputeVisibility();
  }

  /**
   * Compute the absolute Y position for a comment row relative to the page.
   */
  function getRowTopAbs(el) {
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY;
  }

  /**
   * Jump roughly a page up/down while keeping navigation within visible comments.
   */
  function pageJump(dir) {
    // dir = +1 (PageDown) or -1 (PageUp)
    const curTop = getRowTopAbs(nodes[activeIdx].el);
    const targetY = curTop + dir * (window.innerHeight - 60);
    let bestIdx = activeIdx;

    if (dir > 0) {
      for (let i = activeIdx + 1; i < nodes.length; i++) {
        if (!isVisibleIdx(i)) continue;
        const y = getRowTopAbs(nodes[i].el);
        if (y >= targetY) { bestIdx = i; break; }
      }
      if (bestIdx === activeIdx) bestIdx = lastVisibleIdx();
    } else {
      for (let i = activeIdx - 1; i >= 0; i--) {
        if (!isVisibleIdx(i)) continue;
        const y = getRowTopAbs(nodes[i].el);
        if (y <= targetY) { bestIdx = i; break; }
      }
      if (bestIdx === activeIdx) bestIdx = firstVisibleIdx();
    }
    if (bestIdx >= 0) setActive(bestIdx);
  }

  // ---------- Active handling ----------
  let activeIdx = 0;

  /**
   * Move the keyboard focus marker to the specified comment row.
   */
  function setActive(idx, { ensureVisible = true } = {}) {
    if (idx < 0 || idx >= nodes.length) return;
    if (ensureVisible) ensureVisibleIdx(idx);
    nodes[activeIdx]?.el.classList.remove('hnkb-active');
    activeIdx = idx;
    const el = nodes[activeIdx].el;
    el.classList.add('hnkb-active');
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  // Initialize
  recomputeVisibility();
  const firstVis = firstVisibleIdx();
  setActive(firstVis >= 0 ? firstVis : 0);

  // ---------- Key handling ----------
  /**
   * Determine if the event target is an input where keystrokes should be ignored.
   */
  function isTypingTarget(t) {
    const tag = t?.tagName?.toLowerCase();
    return t?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;

    // Recursive expand/collapse (Power moves)
    if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault();
      expandSubtree(activeIdx);
      return;
    }
    if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault();
      collapseSubtree(activeIdx);
      return;
    }

    // Core navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = nextVisibleIdx(activeIdx, -1);
      if (prev >= 0) setActive(prev);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let next = nextVisibleIdx(activeIdx, +1);
      while (next >= 0 && isFoldedIdx(next)) next = nextVisibleIdx(next, +1);
      if (next >= 0) setActive(next);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const me = activeIdx;
      if (hasChild(me) && !isCollapsed(me)) collapseIdx(me);
      else {
        const parent = findParentIdx(me);
        if (parent >= 0) setActive(parent);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const me = activeIdx;
      const child = findFirstChildIdx(me);
      if (isCollapsed(me)) expandIdx(me);
      else if (child >= 0) setActive(child);
      return;
    }

    // Space — toggle collapse/expand (no movement)
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar') {
      e.preventDefault();
      const me = activeIdx;
      if (isCollapsed(me)) expandIdx(me);
      else if (hasChild(me)) collapseIdx(me);
      return;
    }

    // Enter — open/activate (open comment permalink)
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = nodes[activeIdx].el;
      const link =
        row.querySelector('.commhead .age a') ||
        row.querySelector('.commhead a[href*="item?id="]') ||
        row.querySelector('a');
      if (link) link.click(); // normal click (Cmd/Ctrl modifiers honored if user holds them)
      return;
    }

    // Home / End
    if (e.key === 'Home') {
      e.preventDefault();
      const first = firstVisibleIdx();
      if (first >= 0) setActive(first);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      const last = lastVisibleIdx();
      if (last >= 0) setActive(last);
      return;
    }

    // PageUp / PageDown
    if (e.key === 'PageDown') {
      e.preventDefault();
      pageJump(+1);
      return;
    }
    if (e.key === 'PageUp') {
      e.preventDefault();
      pageJump(-1);
      return;
    }
  });

  // Click to activate (nice synergy)
  nodes.forEach((n) => {
    n.el.addEventListener('click', () => setActive(n.idx, { ensureVisible: false }));
  });
})();
