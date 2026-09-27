/**
 * What the footer answers for while zoomed (`zoom-scoped-backlinks` design D2–D4).
 *
 * The anchors are the live document's (`src/anchors.ts`), not the metadata
 * cache's: the cache follows the file on disk, about two seconds behind the
 * editor, and a zoomed view is where the reader is typing. Where a subpath
 * lands is still Obsidian's to say — its `resolveSubpath` is handed a
 * `CachedMetadata` holding only those anchors, so case, punctuation, nested
 * heading paths and duplicate headings resolve as Obsidian's own links do.
 */

import type { EditorState } from '@codemirror/state';
import {
  resolveSubpath,
  type BlockCache,
  type CachedMetadata,
  type HeadingCache,
  type Loc,
  type Pos,
} from 'obsidian';
import { anchorsOf, classifyZoom, type Anchor, type Membership } from '../anchors';
import type { OutlineDoc } from '../model';
import { parsedDoc } from './parsed-doc';
import { zoomScope } from './zoom-scope';

export interface ZoomAnswer {
  /**
   * The zoom's root and every anchor's identity with its membership, in the
   * order written. Two answers with the same key classify every subpath
   * alike; line numbers are left out, so an edit that only shifts lines does
   * not repaint the footer (D4).
   */
  readonly key: string;
  /** This node is available: an anchor belongs to the zoom root. */
  readonly node: boolean;
  /** This branch is available: an anchor belongs to the root or below it. */
  readonly branch: boolean;
  classify(subpath: string): Membership;
}

const anchorCache = new WeakMap<OutlineDoc, Anchor[]>();

function anchorsFor(doc: OutlineDoc): Anchor[] {
  let anchors = anchorCache.get(doc);
  if (!anchors) {
    anchors = anchorsOf(doc);
    anchorCache.set(doc, anchors);
  }
  return anchors;
}

/** The anchors as the part of a `CachedMetadata` the resolver reads. */
function metadataOf(anchors: readonly Anchor[], state: EditorState): CachedMetadata {
  const pos = (line: number): Pos => {
    const at = state.doc.line(Math.min(line + 1, state.doc.lines));
    const start: Loc = { line, col: 0, offset: at.from };
    const end: Loc = { line, col: at.length, offset: at.to };
    return { start, end };
  };
  const headings: HeadingCache[] = [];
  const blocks: Record<string, BlockCache> = {};
  for (const anchor of anchors) {
    if (anchor.kind === 'heading') {
      headings.push({ heading: anchor.text, level: anchor.level, position: pos(anchor.line) });
    } else if (!(anchor.key in blocks)) {
      blocks[anchor.key] = { id: anchor.id, position: pos(anchor.line) };
    }
  }
  return { headings, blocks };
}

function computeAnswer(state: EditorState): ZoomAnswer | null {
  const scope = zoomScope(state);
  if (!scope) return null;
  const anchors = anchorsFor(parsedDoc(state.doc).doc);
  const metadata = metadataOf(anchors, state);
  const zoom = classifyZoom(anchors, scope.root.id, scope.cover, (subpath) => {
    const landing = resolveSubpath(metadata, subpath);
    return landing ? landing.start.line : null;
  });
  const identity = (anchor: Anchor): string =>
    anchor.kind === 'heading' ? `#${anchor.level}:${anchor.text}` : `^${anchor.key}`;
  const key = JSON.stringify([
    scope.path,
    zoom.anchors.map(({ anchor, membership }) => [identity(anchor), membership]),
  ]);
  const classified = new Map<string, Membership>();
  return {
    key,
    node: zoom.node,
    branch: zoom.branch,
    classify(subpath) {
      let membership = classified.get(subpath);
      if (membership === undefined) {
        membership = zoom.classify(subpath);
        classified.set(subpath, membership);
      }
      return membership;
    },
  };
}

const answerCache = new WeakMap<EditorState, { answer: ZoomAnswer | null }>();

/** The zoom answer for this state, or null with no zoom. One derivation per
 * `EditorState`, like `zoomScope` and `parsedDoc`. */
export function zoomAnswerFor(state: EditorState): ZoomAnswer | null {
  const cached = answerCache.get(state);
  if (cached) return cached.answer;
  const answer = computeAnswer(state);
  answerCache.set(state, { answer });
  return answer;
}
