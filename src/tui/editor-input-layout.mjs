import { visibleWidth } from "./render-utils.mjs";

const graphemeSegmenter = typeof Intl?.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function buildEditorInputLayout(text, width) {
  const value = String(text ?? "");
  const maxWidth = Math.max(1, Number(width) || 1);
  const rows = [""];
  const positions = Array.from({ length: value.length + 1 });
  let row = 0;
  let col = 0;
  let pendingWhitespace = null;
  let paragraphHasText = false;
  positions[0] = { row, col };

  const beginRow = (sourceIndex) => {
    rows.push("");
    row += 1;
    col = 0;
    positions[sourceIndex] = { row, col };
  };

  const appendVisibleRange = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (col >= maxWidth) beginRow(index);
      positions[index] = { row, col };
      const character = value[index];
      rows[row] += character;
      col += Math.max(1, visibleWidth(character));
      positions[index + 1] = { row, col };
    }
  };

  const hideWhitespaceAtWrap = (start, end) => {
    for (let index = start; index < end; index += 1) {
      positions[index] = { row, col };
      positions[index + 1] = { row, col };
    }
    beginRow(end);
  };

  const flushTrailingWhitespace = () => {
    if (!pendingWhitespace) return;
    appendVisibleRange(pendingWhitespace.start, pendingWhitespace.end);
    pendingWhitespace = null;
  };

  const tokens = value.matchAll(/\r\n|[\r\n]|[^\S\r\n]+|[^\s]+/g);
  for (const match of tokens) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;

    if (/^(?:\r\n|\r|\n)$/.test(token)) {
      flushTrailingWhitespace();
      for (let index = start; index < end; index += 1) {
        positions[index] = { row, col };
        positions[index + 1] = { row, col };
      }
      beginRow(end);
      paragraphHasText = false;
      continue;
    }

    if (/^[^\S\r\n]+$/.test(token)) {
      pendingWhitespace = { start, end };
      continue;
    }

    const wordWidth = visibleWidth(token);
    if (pendingWhitespace) {
      const whitespaceWidth = visibleWidth(value.slice(pendingWhitespace.start, pendingWhitespace.end));
      const available = maxWidth - col;
      if (paragraphHasText && col > 0 && whitespaceWidth + wordWidth > available) {
        hideWhitespaceAtWrap(pendingWhitespace.start, pendingWhitespace.end);
      } else {
        appendVisibleRange(pendingWhitespace.start, pendingWhitespace.end);
      }
      pendingWhitespace = null;
    }

    if (wordWidth <= maxWidth && col > 0 && wordWidth > maxWidth - col) beginRow(start);
    appendVisibleRange(start, end);
    paragraphHasText = true;
  }

  flushTrailingWhitespace();
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] ??= positions[index - 1] ?? { row: 0, col: 0 };
  }

  return { text: value, width: maxWidth, rows, positions };
}

export function cursorIndexAtVisualPosition(layout, targetRow, targetCol, options = {}) {
  const row = Math.max(0, Math.min(layout.rows.length - 1, Number(targetRow) || 0));
  const col = Math.max(0, Number(targetCol) || 0);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < layout.positions.length; index += 1) {
    const position = layout.positions[index];
    if (!position || position.row !== row) continue;
    const distance = Math.abs(position.col - col);
    const winsTie = distance === bestDistance && (
      options.edge === "end" ? index > bestIndex : options.edge === "start" ? index < bestIndex : index > bestIndex
    );
    if (distance < bestDistance || winsTie) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function previousGraphemeBoundary(text, cursorIndex) {
  const boundaries = graphemeBoundaries(text);
  const index = clampCursorIndex(text, cursorIndex);
  for (let position = boundaries.length - 1; position >= 0; position -= 1) {
    if (boundaries[position] < index) return boundaries[position];
  }
  return 0;
}

export function nextGraphemeBoundary(text, cursorIndex) {
  const boundaries = graphemeBoundaries(text);
  const index = clampCursorIndex(text, cursorIndex);
  return boundaries.find((boundary) => boundary > index) ?? String(text ?? "").length;
}

export function previousWordBoundary(text, cursorIndex) {
  const value = String(text ?? "");
  let index = clampCursorIndex(value, cursorIndex);
  while (index > 0 && /\s/.test(value[index - 1])) index = previousGraphemeBoundary(value, index);
  while (index > 0 && !/\s/.test(value[index - 1])) index = previousGraphemeBoundary(value, index);
  return index;
}

export function nextWordBoundary(text, cursorIndex) {
  const value = String(text ?? "");
  let index = clampCursorIndex(value, cursorIndex);
  while (index < value.length && /\s/.test(value[index])) index = nextGraphemeBoundary(value, index);
  while (index < value.length && !/\s/.test(value[index])) index = nextGraphemeBoundary(value, index);
  return index;
}

function graphemeBoundaries(text) {
  const value = String(text ?? "");
  if (!graphemeSegmenter) {
    const boundaries = [0];
    let index = 0;
    for (const character of value) {
      index += character.length;
      boundaries.push(index);
    }
    return boundaries;
  }
  return [
    ...Array.from(graphemeSegmenter.segment(value), (entry) => entry.index),
    value.length,
  ].filter((value, index, values) => index === 0 || value !== values[index - 1]);
}

function clampCursorIndex(text, cursorIndex) {
  return Math.max(0, Math.min(String(text ?? "").length, Number(cursorIndex) || 0));
}
