/**
 * The data model. Everything the board knows lives here.
 *
 * The shape is deliberately flat and id-addressed so that a future cloud sync
 * layer can diff / merge records without understanding the graph.
 */

export type ID = string;

export type ThoughtType =
  | 'industry'
  | 'sub-industry'
  | 'technology'
  | 'problem'
  | 'company'
  | 'person'
  | 'idea'
  | 'question'
  | 'observation'
  | 'startup'
  | 'career'
  | 'resource';

export const THOUGHT_TYPES: ThoughtType[] = [
  'industry', 'sub-industry', 'technology', 'problem', 'company', 'person',
  'idea', 'question', 'observation', 'startup', 'career', 'resource',
];

export type Conviction = 'curious' | 'researching' | 'promising' | 'high' | 'rejected';

export const CONVICTIONS: { id: Conviction; label: string }[] = [
  { id: 'curious', label: 'Curious' },
  { id: 'researching', label: 'Researching' },
  { id: 'promising', label: 'Promising' },
  { id: 'high', label: 'High conviction' },
  { id: 'rejected', label: 'Rejected' },
];

/** Accents are named after pigments, never after UI states. `none` is not
 *  colourless — it lets the map pick a colour from the thought's own id. */
export type Accent =
  | 'none' | 'sage' | 'clay' | 'ember' | 'ochre'
  | 'avocado' | 'teal' | 'umber' | 'grape' | 'fuchsia';

export const ACCENTS: Accent[] = [
  'none', 'ember', 'ochre', 'avocado', 'sage', 'teal', 'grape', 'fuchsia', 'clay', 'umber',
];

export type Level = '' | 'low' | 'medium' | 'high';

export interface Attributes {
  /** 0–10 */
  interest?: number | null;
  /** 0–10 */
  founderFit?: number | null;
  marketSize?: string;
  knowledgeBarrier?: Level;
  capitalIntensity?: Level;
  conviction?: Conviction | null;
}

export interface Thought {
  id: ID;
  text: string;
  /** Long-form note. Hidden on the canvas; revealed on double click. */
  note: string;
  parentId: ID | null;
  /** World coordinates of the node's centre. */
  x: number;
  y: number;
  accent: Accent;
  type: ThoughtType | null;
  attrs: Attributes;
  /** Denormalised distance from a root; kept in the file for portability. */
  depth: number;
  /** True once the user has dragged it — auto layout then leaves it alone. */
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A non-hierarchical association between two thoughts. */
export interface Link {
  id: ID;
  source: ID;
  target: ID;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export interface Board {
  version: 1;
  id: string;
  title: string;
  /**
   * The row this map occupies in a signed-in account's library, once it has
   * been saved to one. Absent on a map that has only ever lived in this
   * browser, and deliberately stripped on import: a file someone sent you
   * must not try to overwrite the row it came from.
   */
  remoteId?: string | null;
  nodes: Record<ID, Thought>;
  links: Record<ID, Link>;
  createdAt: number;
  updatedAt: number;
}

export interface Camera {
  /** screen = world * z + (x, y) */
  x: number;
  y: number;
  z: number;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export const emptyAttrs = (): Attributes => ({
  interest: null,
  founderFit: null,
  marketSize: '',
  knowledgeBarrier: '',
  capitalIntensity: '',
  conviction: null,
});

export const hasAttrs = (a: Attributes | undefined): boolean =>
  !!a && (a.interest != null || a.founderFit != null || !!a.marketSize ||
    !!a.knowledgeBarrier || !!a.capitalIntensity || !!a.conviction);
