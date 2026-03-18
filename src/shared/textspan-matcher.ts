export interface TextSpanMatch {
  start: number;
  end: number;
  matchedText: string;
  matchType: "exact" | "fuzzy";
  score: number;
}

export interface MatchTextSpanOptions {
  offsetHint?: number;
}

interface NormalizedText {
  text: string;
  indexMap: number[];
}

export function matchTextSpan(
  documentText: string,
  textSpan: string,
  options: MatchTextSpanOptions = {},
): TextSpanMatch | null {
  if (!documentText || !textSpan) {
    return null;
  }

  const exactMatch = findExactMatch(documentText, textSpan, options.offsetHint);
  if (exactMatch) {
    return exactMatch;
  }

  if (textSpan.length < 20) {
    return null;
  }

  const normalizedMatch = findNormalizedMatch(
    documentText,
    textSpan,
    options.offsetHint,
  );

  if (normalizedMatch) {
    return normalizedMatch;
  }

  return findApproximateMatch(documentText, textSpan, options.offsetHint);
}

function findExactMatch(
  documentText: string,
  textSpan: string,
  offsetHint?: number,
): TextSpanMatch | null {
  const starts = findAllOccurrences(documentText, textSpan);
  if (starts.length === 0) {
    return null;
  }

  const start = chooseClosestStart(starts, offsetHint);
  return {
    start,
    end: start + textSpan.length,
    matchedText: textSpan,
    matchType: "exact",
    score: 1,
  };
}

function findNormalizedMatch(
  documentText: string,
  textSpan: string,
  offsetHint?: number,
): TextSpanMatch | null {
  const normalizedDocument = normalizeWhitespace(documentText);
  const normalizedSpan = normalizeWhitespace(textSpan);
  const normalizedStarts = findAllOccurrences(
    normalizedDocument.text,
    normalizedSpan.text,
  );

  if (normalizedStarts.length === 0) {
    return null;
  }

  const rawStarts = normalizedStarts
    .map((start) => normalizedDocument.indexMap[start])
    .filter((start): start is number => start !== undefined);

  if (rawStarts.length === 0) {
    return null;
  }

  const start = chooseClosestStart(rawStarts, offsetHint);
  const endAnchor = normalizedStarts
    .map((value, index) => {
      const normalizedStart = value;
      const normalizedEnd = normalizedStart + normalizedSpan.text.length - 1;
      const rawStart = rawStarts[index];
      const rawEnd = normalizedDocument.indexMap[normalizedEnd];
      return rawStart !== undefined && rawEnd !== undefined
        ? { rawStart, rawEnd }
        : null;
    })
    .filter((value): value is { rawStart: number; rawEnd: number } => value !== null)
    .sort(
      (left, right) =>
        Math.abs(left.rawStart - (offsetHint ?? left.rawStart)) -
        Math.abs(right.rawStart - (offsetHint ?? right.rawStart)),
    )[0];

  if (!endAnchor) {
    return null;
  }

  return {
    start,
    end: endAnchor.rawEnd + 1,
    matchedText: documentText.slice(start, endAnchor.rawEnd + 1),
    matchType: "fuzzy",
    score: 0.97,
  };
}

function findApproximateMatch(
  documentText: string,
  textSpan: string,
  offsetHint?: number,
): TextSpanMatch | null {
  const normalizedDocument = normalizeWhitespace(documentText);
  const normalizedSpan = normalizeWhitespace(textSpan);
  const searchRadius = Math.max(400, normalizedSpan.text.length * 3);
  const hintedStart = offsetHint
    ? findClosestNormalizedIndex(normalizedDocument.indexMap, offsetHint)
    : 0;
  const searchStart = Math.max(0, hintedStart - searchRadius);
  const searchEnd = Math.min(
    normalizedDocument.text.length,
    (offsetHint ? hintedStart + searchRadius : normalizedDocument.text.length),
  );

  let bestMatch:
    | { start: number; end: number; distance: number; score: number }
    | null = null;

  const minLength = Math.max(20, Math.floor(normalizedSpan.text.length * 0.9));
  const maxLength = Math.min(
    normalizedDocument.text.length - searchStart,
    Math.ceil(normalizedSpan.text.length * 1.1),
  );

  for (let start = searchStart; start < searchEnd - minLength; start += 1) {
    for (let length = minLength; length <= maxLength; length += 1) {
      const end = start + length;
      if (end > searchEnd) {
        break;
      }

      const candidate = normalizedDocument.text.slice(start, end);
      const distance = levenshteinDistance(candidate, normalizedSpan.text);
      const maxDistance = Math.floor(normalizedSpan.text.length * 0.1);

      if (distance > maxDistance) {
        continue;
      }

      const score = 1 - distance / Math.max(candidate.length, normalizedSpan.text.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { start, end, distance, score };
      }
    }
  }

  if (!bestMatch) {
    return null;
  }

  const rawStart = normalizedDocument.indexMap[bestMatch.start];
  const rawEnd = normalizedDocument.indexMap[bestMatch.end - 1];
  if (rawStart === undefined || rawEnd === undefined) {
    return null;
  }

  return {
    start: rawStart,
    end: rawEnd + 1,
    matchedText: documentText.slice(rawStart, rawEnd + 1),
    matchType: "fuzzy",
    score: Number(bestMatch.score.toFixed(3)),
  };
}

function findAllOccurrences(haystack: string, needle: string) {
  const starts: number[] = [];
  let cursor = haystack.indexOf(needle);

  while (cursor !== -1) {
    starts.push(cursor);
    cursor = haystack.indexOf(needle, cursor + 1);
  }

  return starts;
}

function chooseClosestStart(starts: number[], offsetHint?: number) {
  if (offsetHint === undefined) {
    return starts[0];
  }

  return starts.reduce((closest, current) => {
    return Math.abs(current - offsetHint) < Math.abs(closest - offsetHint)
      ? current
      : closest;
  });
}

function normalizeWhitespace(value: string): NormalizedText {
  let normalized = "";
  const indexMap: number[] = [];
  let previousWasWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const isWhitespace = /\s/.test(character);

    if (isWhitespace) {
      if (!previousWasWhitespace && normalized.length > 0) {
        normalized += " ";
        indexMap.push(index);
      }
      previousWasWhitespace = true;
      continue;
    }

    normalized += character;
    indexMap.push(index);
    previousWasWhitespace = false;
  }

  return {
    text: normalized.trim(),
    indexMap,
  };
}

function findClosestNormalizedIndex(indexMap: number[], rawOffset: number) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < indexMap.length; index += 1) {
    const distance = Math.abs(indexMap[index] - rawOffset);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}
