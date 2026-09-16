/**
 * The candidate matching semantics, as pure functions, for the measurement in
 * `docs/research/search-grammar`.
 *
 * Each candidate has the same shape as the thing it would become in
 * `src/search.ts`: given a text and a query it returns the ranges to mark, or
 * `null` for no match. Returning the RANGES rather than a boolean is what lets
 * one pass measure both selectivity and whether the result can be highlighted
 * legibly — the two halves that decide a grammar, and the pair
 * `matchesText`/`matchRanges` already has to agree on.
 *
 * `prepareFuzzySearch`, Obsidian's own matcher, is absent here for a reason:
 * the `obsidian` npm package ships types and no runtime, so it cannot be
 * called outside the application. B below is the same idea (a whole-text
 * subsequence) written out, and is measured as the stand-in it is.
 */

/** A half-open range over the text, as `src/search.ts` defines it. */
const range = (from, to) => ({ from, to });

/** Merges touching or overlapping ranges, left to right. */
function merge(ranges) {
  const out = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The text's words, lowercased, with their offsets. */
export function words(text) {
  const out = [];
  for (const m of text.matchAll(WORD)) out.push({ text: m[0].toLowerCase(), at: m.index });
  return out;
}

/** The query's words, lowercased. An empty query has none. */
export function queryWords(query) {
  return query.trim().toLowerCase().match(WORD) ?? [];
}

/** Whether two strings differ by at most one edit, transposition included. */
function withinOneEdit(a, b) {
  if (a === b) return true;
  const d = a.length - b.length;
  if (d > 1 || d < -1) return false;
  if (d === 0) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (i === a.length) return true;
    // One substitution, or one transposition of adjacent characters.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = d === 1 ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  return long.slice(i + 1) === short.slice(i);
}

/** Every occurrence of `term` in `lower`, non-overlapping. */
function occurrences(lower, term) {
  const out = [];
  for (let at = lower.indexOf(term); at >= 0; at = lower.indexOf(term, at + term.length)) {
    out.push(range(at, at + term.length));
  }
  return out;
}

/**
 * A. Literal substring, ignoring case. The grammar as shipped in `src/search.ts`.
 */
export function literal(text, query) {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [];
  const found = occurrences(text.toLowerCase(), term);
  return found.length > 0 ? found : null;
}

/**
 * B. Subsequence over the whole text: the query's characters, whitespace
 * dropped, appear in order anywhere. The naive fuzziness — what a matcher
 * built for titles and command names does when it is pointed at a paragraph.
 */
export function subsequenceWhole(text, query) {
  const term = query.trim().toLowerCase().replace(/\s+/g, '');
  if (term.length === 0) return [];
  const lower = text.toLowerCase();
  const hits = [];
  let q = 0;
  for (let i = 0; i < lower.length && q < term.length; i++) {
    if (lower[i] === term[q]) {
      hits.push(range(i, i + 1));
      q++;
    }
  }
  return q === term.length ? merge(hits) : null;
}

/**
 * C. Every query word occurs as a substring, anywhere, in any order.
 */
export function wordSubstring(text, query) {
  const terms = queryWords(query);
  if (terms.length === 0) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const term of terms) {
    const found = occurrences(lower, term);
    if (found.length === 0) return null;
    hits.push(...found);
  }
  return merge(hits.sort((a, b) => a.from - b.from));
}

/**
 * D. Every query word is the PREFIX of some word in the text, in any order.
 * RemNote's rule, and what typing into a box wants: a half-typed word still
 * finds the whole one.
 */
export function wordPrefix(text, query) {
  const terms = queryWords(query);
  if (terms.length === 0) return [];
  const ws = words(text);
  const hits = [];
  for (const term of terms) {
    let any = false;
    for (const w of ws) {
      if (w.text.startsWith(term)) {
        hits.push(range(w.at, w.at + term.length));
        any = true;
      }
    }
    if (!any) return null;
  }
  return merge(hits.sort((a, b) => a.from - b.from));
}

/**
 * E. Every query word is a SUBSEQUENCE of some single word in the text.
 * Fuzziness confined to a word, rather than let loose over a paragraph.
 */
export function wordSubsequence(text, query) {
  const terms = queryWords(query);
  if (terms.length === 0) return [];
  const ws = words(text);
  const hits = [];
  for (const term of terms) {
    let any = false;
    for (const w of ws) {
      let q = 0;
      const inWord = [];
      for (let i = 0; i < w.text.length && q < term.length; i++) {
        if (w.text[i] === term[q]) {
          inWord.push(range(w.at + i, w.at + i + 1));
          q++;
        }
      }
      if (q === term.length) {
        hits.push(...inWord);
        any = true;
      }
    }
    if (!any) return null;
  }
  return merge(hits.sort((a, b) => a.from - b.from));
}

/**
 * F. D, with one edit of tolerance for query words of four characters or more:
 * a query word matches a text word when it prefixes it, or when it is within
 * one edit of that word's opening run of the same length. Short words are held
 * to the exact prefix, because one edit in three characters is no constraint
 * at all.
 */
export const TYPO_FLOOR = 4;

export function wordPrefixTypo(text, query) {
  return wordPrefixTypoTokens(words(text), query);
}

/** Whether `term` matches the already-tokenized word `w`, and over what span. */
function typoSpan(w, term) {
  if (w.text.startsWith(term)) return term.length;
  if (term.length < TYPO_FLOOR) return 0;
  const head = w.text.slice(0, Math.min(w.text.length, term.length + 1));
  return withinOneEdit(term, head) ? head.length : 0;
}

/**
 * F over words computed once. The trees a surface searches are already cached
 * per mtime, so their words can be too; this is what the matching costs when
 * tokenizing is not paid per keystroke.
 */
export function wordPrefixTypoTokens(ws, query) {
  const terms = queryWords(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (const term of terms) {
    let any = false;
    for (const w of ws) {
      const span = typoSpan(w, term);
      if (span > 0) {
        hits.push(range(w.at, w.at + span));
        any = true;
      }
    }
    if (!any) return null;
  }
  return merge(hits.sort((a, b) => a.from - b.from));
}

export const CANDIDATES = [
  { key: 'A', name: 'literal', fn: literal, note: 'substring, ignoring case (shipped)' },
  { key: 'B', name: 'subsequence-whole', fn: subsequenceWhole, note: 'query chars in order, anywhere' },
  { key: 'C', name: 'word-substring', fn: wordSubstring, note: 'every word a substring' },
  { key: 'D', name: 'word-prefix', fn: wordPrefix, note: 'every word prefixes a word' },
  { key: 'E', name: 'word-subsequence', fn: wordSubsequence, note: 'every word a subsequence of a word' },
  { key: 'F', name: 'word-prefix-typo', fn: wordPrefixTypo, note: 'D, plus one edit at 4+ chars' },
];

/** F with the typo floor as a parameter, for the sweep that chooses it. */
export function wordPrefixTypoAt(floor) {
  return (text, query) => {
    const terms = queryWords(query);
    if (terms.length === 0) return [];
    const ws = words(text);
    const hits = [];
    for (const term of terms) {
      let any = false;
      for (const w of ws) {
        let span = 0;
        if (w.text.startsWith(term)) span = term.length;
        else if (term.length >= floor) {
          const head = w.text.slice(0, Math.min(w.text.length, term.length + 1));
          if (withinOneEdit(term, head)) span = head.length;
        }
        if (span > 0) {
          hits.push(range(w.at, w.at + span));
          any = true;
        }
      }
      if (!any) return null;
    }
    return merge(hits.sort((a, b) => a.from - b.from));
  };
}
