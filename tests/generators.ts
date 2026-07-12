import fc from 'fast-check';
import type { OutlineDoc, OutlineNode } from '../src/model';
import { makeNode } from '../src/model';

/** Adversarial markdown text: fragments that stress the segmenter. */
export const arbMarkdownText: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom('plain text', 'with | pipe', 'trailing spaces  ', '\ttab lead') },
      fc.constantFrom('# H1', '## H2', '###### H6', '#nospace', '####### seven'),
      fc.constantFrom('- item', '* item', '+ item', '1. one', '12) twelve', '-', '- [ ] task', '- [x] done'),
      fc.constantFrom('  - nested', '    - deeper', '   half indent', '  continuation'),
      fc.constantFrom('```', '```js', '~~~', 'code inside', '    indented'),
      fc.constantFrom('> quote', '> [!note] callout', '> > nested'),
      fc.constantFrom('---', '***', '___', '- - -', '===', '=='),
      fc.constantFrom('| a | b |', '|---|---|', '| 1 | 2 |'),
      fc.constantFrom('<div>', '</div>', '<!-- comment -->'),
      fc.constantFrom('', '', '', ' ', '\t'),
    ),
    { maxLength: 40 },
  )
  .map((lines) => lines.join('\n'));

const arbGap: fc.Arbitrary<string[]> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<string[]>(['']) },
  fc.constant<string[]>([]),
  fc.constant<string[]>(['', '']),
  fc.constant<string[]>([' ']),
);

// Node text must not itself read as a block marker (a paragraph of "-" would
// re-parse as an empty list item), so require an alphanumeric first char and
// exclude ordered-marker prefixes like "1.".
const arbText: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9 .,!?'-]{0,29}$/)
  .filter((s) => s.trim().length > 0 && !/^\d+[.)]([ \t]|$)/.test(s.trim()));

/**
 * Generates trees that are *valid by construction* for the encode→parse
 * direction: every node's lines are well-formed for its kind and depth
 * context, gaps separate paragraph runs, etc.
 */
export function arbTree(): fc.Arbitrary<OutlineDoc> {
  // List subtree at a given indentation column.
  const listItem = (indent: number, depth: number): fc.Arbitrary<OutlineNode> =>
    fc
      .tuple(
        arbText,
        depth > 0
          ? fc.array(fc.oneof(
              { weight: 3, arbitrary: listItem(indent + 2, depth - 1) },
              codeAtom(indent + 2),
            ), { maxLength: 3 })
          : fc.constant([] as OutlineNode[]),
        arbGap,
      )
      .map(([text, children, gap]) =>
        makeNode({
          kind: 'list-item',
          listStyle: { type: 'bullet', marker: '-' },
          lines: [`${' '.repeat(indent)}- ${text}`],
          trailingGap: children.length > 0 ? [] : gap.filter((g) => g === ''),
          children,
        }),
      );

  const codeAtom = (indent: number): fc.Arbitrary<OutlineNode> =>
    arbText.map((text) =>
      makeNode({
        kind: 'code',
        lines: [`${' '.repeat(indent)}\`\`\``, `${' '.repeat(indent)}${text}`, `${' '.repeat(indent)}\`\`\``],
        trailingGap: [''],
      }),
    );

  const paragraph: fc.Arbitrary<OutlineNode> = fc
    .tuple(arbText, fc.array(listItem(0, 2), { maxLength: 3 }))
    .map(([text, items]) =>
      makeNode({
        kind: 'paragraph',
        lines: [text],
        trailingGap: [''],
        children: items,
      }),
    );

  const sectionContent: fc.Arbitrary<OutlineNode[]> = fc
    .array(fc.oneof({ weight: 3, arbitrary: paragraph }, listItem(0, 2), codeAtom(0)), {
      maxLength: 4,
    })
    .map(foldListsIntoParagraphs)
    .map(normalizeSectionGaps);

  const heading = (level: number, depth: number): fc.Arbitrary<OutlineNode> =>
    fc
      .tuple(
        arbText,
        sectionContent,
        depth > 0
          ? fc.array(heading(Math.min(level + 1, 6), depth - 1), { maxLength: 2 })
          : fc.constant([] as OutlineNode[]),
      )
      .map(([text, content, subs]) =>
        makeNode({
          kind: 'heading',
          level,
          lines: [`${'#'.repeat(level)} ${text}`],
          trailingGap: [''],
          children: [...content, ...subs],
        }),
      );

  return fc
    .tuple(sectionContent, fc.array(heading(2, 2), { maxLength: 3 }))
    .map(([content, sections]) => ({
      preamble: [],
      children: [...content, ...sections],
    }));
}

/**
 * The attachment rule makes \"list item sibling right after a paragraph\"
 * unrepresentable — parse always claims it as the paragraph's child. Valid
 * trees must respect that, so the generator folds such items in.
 */
function foldListsIntoParagraphs(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.kind === 'list-item' && prev?.kind === 'paragraph') {
      out[out.length - 1] = { ...prev, children: [...prev.children, node] };
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Adjacent paragraphs (and a paragraph directly followed by a sibling list)
 * must be separated by a blank line or the parser would merge/attach them —
 * generated trees enforce the same separation invariants the ops maintain.
 */
function normalizeSectionGaps(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.map((node, i) => {
    const lastLeafGapEmpty = trailingGapOfSubtree(node).length === 0;
    if (i < nodes.length - 1 && lastLeafGapEmpty) {
      return withLastLeafGap(node, ['']);
    }
    return node;
  });
}

function trailingGapOfSubtree(node: OutlineNode): readonly string[] {
  const last = node.children[node.children.length - 1];
  return last ? trailingGapOfSubtree(last) : node.trailingGap;
}

function withLastLeafGap(node: OutlineNode, gap: string[]): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: gap };
  return {
    ...node,
    children: [...node.children.slice(0, -1), withLastLeafGap(last, gap)],
  };
}
