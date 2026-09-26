/**
 * Measures the candidate grammars in `candidates.mjs` against the parsed
 * `test-vault`, and prints the tables `docs/research/search-grammar` records.
 *
 *   node scripts/gen-backlink-hub.ts
 *   node docs/research/prototypes/search-grammar/bench.mjs
 *
 * Three questions, in order:
 *
 * 1. SELECTIVITY — how much of the corpus does each candidate admit, per family
 *    of query? "Nearly vacuous" is a claim about a number, and this is it.
 * 2. MARKABILITY — can a hit be highlighted legibly? A candidate that scatters
 *    single characters across a paragraph passes the predicate and fails the
 *    surface, and every surface here marks its matches.
 * 3. STRUCTURE — does an ancestor operator narrow anything a two-word query
 *    over the lineage does not already narrow?
 *
 * Queries are DERIVED from the corpus rather than chosen, so the figures are
 * not a picked set: mid-frequency words, evenly spaced through the vocabulary,
 * put through four shapes a reader actually types.
 */

import {
  CANDIDATES,
  TYPO_FLOOR,
  wordPrefix,
  wordPrefixTypoAt,
  wordPrefixTypoTokens,
  words,
} from './candidates.mjs';
import { loadCorpus, sample, timed } from './corpus.mjs';

/** `--tracked` measures the 29 tracked notes alone, without the generated hub. */
const tracked = process.argv.includes('--tracked');
/** `--scale N` repeats the corpus N times, for the cost of a vault that is not a fixture. */
const scaleAt = process.argv.indexOf('--scale');
const SCALE = scaleAt === -1 ? 30 : Number(process.argv[scaleAt + 1]);

const WORD = /[\p{L}\p{N}]+/gu;
const QUERY_COUNT = 40;
/** Document frequency band: common enough to be looked for, rare enough to mean something. */
const DF_MIN = 3;
const DF_MAX = 30;

const pct = (n, of) => `${((100 * n) / of).toFixed(1)}%`;
const fixed = (n, d = 1) => n.toFixed(d);

function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  console.log(line(header));
  console.log(`| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`);
  for (const row of rows) console.log(line(row));
  console.log();
}

const { files, nodes, bytes } = await loadCorpus(tracked ? { exclude: 'Backlinks/Hub' } : {});

// ---------------------------------------------------------------- vocabulary

/** word -> the indices of the nodes whose own text contains it. */
const df = new Map();
nodes.forEach((node, i) => {
  for (const w of new Set(node.text.toLowerCase().match(WORD) ?? [])) {
    if (w.length < 4) continue;
    const seen = df.get(w);
    if (seen) seen.push(i);
    else df.set(w, [i]);
  }
});

const band = [...df.entries()]
  .filter(([, where]) => where.length >= DF_MIN && where.length <= DF_MAX)
  .sort(([a], [b]) => (a < b ? -1 : 1));

const seeds = sample(band, QUERY_COUNT);

// ------------------------------------------------------------------ families

/** Swaps the second and third characters: the transposition a hand actually makes. */
const transpose = (w) => w.slice(0, 1) + w[2] + w[1] + w.slice(3);

const families = {
  /** The whole word, typed out. */
  word: seeds.map(([w, where]) => ({ query: w, seed: where[0] })),
  /** Three characters — the shortest query the in-note filter acts on at all. */
  short: seeds.filter(([w]) => w.length > 3).map(([w, where]) => ({ query: w.slice(0, 3), seed: where[0] })),
  /** Four characters of it — the state a box is in while it is still being typed. */
  prefix: seeds.filter(([w]) => w.length > 4).map(([w, where]) => ({ query: w.slice(0, 4), seed: where[0] })),
  /** The same word with two letters transposed. */
  typo: seeds
    .filter(([w]) => w.length >= 5 && w[1] !== w[2])
    .map(([w, where]) => ({ query: transpose(w), seed: where[0] })),
  /** A transposition inside a FOUR-letter word — the case the floor is chosen against. */
  typo4: seeds
    .filter(([w]) => w.length === 4 && w[1] !== w[2])
    .map(([w, where]) => ({ query: transpose(w), seed: where[0] })),
  /** Two words that occur together in at least one node, so a true hit exists. */
  pair: seeds
    .map(([w, where]) => {
      const other = (nodes[where[0]].text.toLowerCase().match(WORD) ?? []).find(
        (o) => o.length >= 4 && o !== w && df.has(o),
      );
      return other ? { query: `${w} ${other}`, seed: where[0] } : undefined;
    })
    .filter(Boolean),
};

// --------------------------------------------------------------------- corpus

const lengths = nodes.map((n) => n.text.length).sort((a, b) => a - b);
const at = (q) => lengths[Math.floor(q * (lengths.length - 1))];

console.log(`# search-grammar measurements\n`);
table(
  ['Corpus', 'Files', 'Nodes', 'KB', 'Node text: median', 'p90', 'max'],
  [[
    tracked ? 'test-vault, tracked notes only' : 'test-vault + generated hub',
    files.length,
    nodes.length,
    fixed(bytes / 1024, 0),
    at(0.5),
    at(0.9),
    lengths[lengths.length - 1],
  ]],
);

// --------------------------------------------------------------- selectivity

for (const [name, queries] of Object.entries(families)) {
  const rows = [];
  for (const c of CANDIDATES) {
    const counts = [];
    let recalled = 0;
    let ranges = 0;
    let hits = 0;
    let spread = 0;
    let zero = 0;
    for (const { query, seed } of queries) {
      let count = 0;
      for (let i = 0; i < nodes.length; i++) {
        const r = c.fn(nodes[i].text, query);
        if (r === null) continue;
        count++;
        if (i === seed) recalled++;
        if (r.length > 0) {
          hits++;
          ranges += r.length;
          const covered = r.reduce((s, x) => s + (x.to - x.from), 0);
          spread += (r[r.length - 1].to - r[0].from) / covered;
        }
      }
      counts.push(count);
      if (count === 0) zero++;
    }
    rows.push([
      `${c.key} ${c.name}`,
      median(counts),
      pct(median(counts), nodes.length),
      fixed(counts.reduce((a, b) => a + b, 0) / counts.length),
      pct(recalled, queries.length),
      `${zero}/${queries.length}`,
      hits > 0 ? fixed(ranges / hits) : '—',
      hits > 0 ? fixed(spread / hits) : '—',
    ]);
  }
  console.log(`## Family \`${name}\` — ${queries.length} queries\n`);
  table(
    ['Candidate', 'Median hits', 'of corpus', 'Mean hits', 'Seed found', 'Queries with 0 hits', 'Marks/hit', 'Spread'],
    rows,
  );
}

// ---------------------------------------------------------------------- cost

const costQuery = seeds[Math.floor(seeds.length / 2)][0];
const scaled = Array.from({ length: SCALE }, () => nodes).flat();
const tokens = scaled.map((n) => words(n.text));

console.log(`## Cost — one whole-corpus pass, ms\n`);
table(
  ['Candidate', `${nodes.length} nodes`, `${scaled.length} nodes (x${SCALE})`],
  CANDIDATES.map((c) => [
    `${c.key} ${c.name}`,
    fixed(timed(() => { for (const n of nodes) c.fn(n.text, costQuery); }, 20), 2),
    fixed(timed(() => { for (const n of scaled) c.fn(n.text, costQuery); }, 3), 1),
  ]),
);

table(
  ['F, where its words come from', `${scaled.length} nodes, ms`],
  [
    ['tokenized per pass', fixed(timed(() => { for (const n of scaled) CANDIDATES[5].fn(n.text, costQuery); }, 3), 1)],
    ['tokenized once, cached with the tree', fixed(timed(() => { for (const t of tokens) wordPrefixTypoTokens(t, costQuery); }, 3), 1)],
  ],
);

console.log(`## Typo floor — the shortest query word that gets one edit of tolerance\n`);
table(
  [
    'Floor',
    'short (3 chars): median hits',
    'prefix (4): median',
    'word: median',
    `typo in a 5+ word: seed found (${families.typo.length})`,
    `typo in a 4-letter word (${families.typo4.length})`,
  ],
  [3, TYPO_FLOOR, 5, 99].map((floor) => {
    const fn = wordPrefixTypoAt(floor);
    const run = (queries) => {
      const counts = [];
      let recalled = 0;
      for (const { query, seed } of queries) {
        let count = 0;
        for (let i = 0; i < nodes.length; i++) if (fn(nodes[i].text, query) !== null) { count++; if (i === seed) recalled++; }
        counts.push(count);
      }
      return { median: median(counts), recall: pct(recalled, queries.length) };
    };
    return [
      floor === 99 ? 'off (= D)' : floor,
      run(families.short).median,
      run(families.prefix).median,
      run(families.word).median,
      run(families.typo).recall,
      families.typo4.length > 0 ? run(families.typo4).recall : '—',
    ];
  }),
);

// ----------------------------------------------------------------- structure

/**
 * Pairs drawn from real lineages: A from an ancestor's first line, B from the
 * node's own text, so every pair has at least one true structural hit.
 */
const pairs = [];
for (const node of nodes) {
  if (node.depth === 0 || pairs.length >= QUERY_COUNT) continue;
  const fromAncestor = (node.lineage[node.lineage.length - 1].toLowerCase().match(WORD) ?? []).find(
    (w) => w.length >= 4 && df.has(w),
  );
  const fromOwn = (node.text.toLowerCase().match(WORD) ?? []).find(
    (w) => w.length >= 4 && df.has(w) && w !== fromAncestor,
  );
  if (fromAncestor && fromOwn && !pairs.some((p) => p.a === fromAncestor && p.b === fromOwn)) {
    pairs.push({ a: fromAncestor, b: fromOwn });
  }
}

const lineageText = (node) => [...node.lineage, node.text].join('\n');

const readings = {
  'B alone, own text': (node, { b }) => wordPrefix(node.text, b) !== null,
  'A and B, own text': (node, { a, b }) => wordPrefix(node.text, `${a} ${b}`) !== null,
  'A and B, own + lineage': (node, p) => wordPrefix(lineageText(node), `${p.a} ${p.b}`) !== null,
  'A > B (A in an ancestor, B in the node)': (node, { a, b }) =>
    wordPrefix(node.text, b) !== null && node.lineage.some((l) => wordPrefix(l, a) !== null),
};

const structural = Object.entries(readings).map(([name, fn]) => {
  const counts = pairs.map((p) => nodes.reduce((n, node) => n + (fn(node, p) ? 1 : 0), 0));
  return [
    name,
    median(counts),
    fixed(counts.reduce((a, b) => a + b, 0) / counts.length),
    `${counts.filter((c) => c === 0).length}/${counts.length}`,
  ];
});
console.log(`## Structure — ${pairs.length} (ancestor word, node word) pairs, matched with D\n`);
table(['Reading', 'Median hits', 'Mean hits', 'Pairs with 0 hits'], structural);

const probe = pairs[0];
table(
  ['Reading', `One pass over ${nodes.length} nodes, ms`],
  Object.entries(readings).map(([name, fn]) => [
    name,
    fixed(timed(() => { for (const n of nodes) fn(n, probe); }, 20), 2),
  ]),
);

// ------------------------------------------------------- lineage vocabulary

const deep = nodes.filter((n) => n.depth > 0).length;
const ancestorWords = new Set();
for (const n of nodes) for (const l of n.lineage) for (const w of l.toLowerCase().match(WORD) ?? []) if (w.length >= 4) ancestorWords.add(w);
table(
  ['Nodes with an ancestor', 'Distinct words in ancestor first lines', 'Max depth'],
  [[`${deep} (${pct(deep, nodes.length)})`, ancestorWords.size, Math.max(...nodes.map((n) => n.depth))]],
);
