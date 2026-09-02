import type { Board, ID } from './types';
import { emptyBoard, newThought, linkThoughts, tidy } from '../commands/board';
import { recomputeDepths } from './graph';

/**
 * A sparse starting map. Enough structure to make the idea legible in three
 * seconds, little enough that the page still feels empty.
 */

interface Seed {
  text: string;
  note?: string;
  accent?: Board['nodes'][string]['accent'];
  type?: Board['nodes'][string]['type'];
  attrs?: Partial<Board['nodes'][string]['attrs']>;
  children?: Seed[];
}

const SOLAR_NOTE = [
  'Why I am interested',
  '',
  'Enormous market, and the demand curve just bent: AI and data-center load',
  'growth is the first real electricity demand shock in twenty years.',
  'Most of the software around development and dispatch is still spreadsheets.',
  '',
  'Reasons not to enter',
  '',
  'Substantial domain knowledge required. Entrenched relationships between',
  'developers, EPCs and utilities. Sales cycles measured in quarters.',
  '',
  'Questions',
  '',
  'Where does the value actually accrue: origination, interconnection, or O&M?',
  'Who pays for software today, and out of which budget?',
  '',
  'https://www.eia.gov/electricity/',
].join('\n');

const SEED: Seed[] = [
  {
    text: 'Future Opportunities',
    type: 'observation',
    children: [
      {
        text: 'Energy',
        accent: 'ochre',
        type: 'industry',
        children: [
          {
            text: 'Solar Energy',
            accent: 'ochre',
            type: 'sub-industry',
            note: SOLAR_NOTE,
            attrs: {
              interest: 9,
              founderFit: 6,
              marketSize: 'Huge',
              knowledgeBarrier: 'high',
              capitalIntensity: 'medium',
              conviction: 'researching',
            },
            children: [
              {
                text: 'Why interesting',
                children: [{ text: 'Data-center electricity demand', type: 'observation' }],
              },
              {
                text: 'Reasons against',
                children: [
                  {
                    text: 'Industry knowledge is a large barrier to entry',
                    type: 'problem',
                    attrs: { conviction: 'curious' },
                  },
                ],
              },
              {
                text: 'Utility-scale solar',
                children: [
                  {
                    text: 'Interconnection',
                    type: 'problem',
                    attrs: { conviction: 'promising' },
                    children: [
                      { text: 'EPC software', type: 'idea' },
                      { text: 'Utilities have extremely long study queues', type: 'observation' },
                    ],
                  },
                ],
              },
            ],
          },
          { text: 'Nuclear', type: 'technology' },
          { text: 'Battery Storage', accent: 'sage', type: 'technology' },
        ],
      },
      {
        text: 'Housing',
        accent: 'clay',
        type: 'industry',
        children: [
          { text: 'Construction' },
          { text: 'Permitting', type: 'problem' },
          { text: 'Home Search' },
        ],
      },
      {
        text: 'Artificial Intelligence',
        accent: 'teal',
        type: 'industry',
        children: [
          { text: 'Vertical AI', type: 'idea' },
          { text: 'AI Infrastructure', type: 'technology' },
          { text: 'Robotics', type: 'technology' },
        ],
      },
    ],
  },
];

export function demoBoard(): Board {
  const board = emptyBoard('Field');
  const byText = new Map<string, ID>();

  const add = (seed: Seed, parentId: ID | null, depth: number): ID => {
    const node = newThought({
      text: seed.text,
      note: seed.note ?? '',
      parentId,
      depth,
      accent: seed.accent ?? 'none',
      type: seed.type ?? null,
      x: 0,
      y: 0,
    });
    if (seed.attrs) node.attrs = { ...node.attrs, ...seed.attrs };
    board.nodes[node.id] = node;
    byText.set(seed.text, node.id);
    for (const child of seed.children ?? []) add(child, node.id, depth + 1);
    return node.id;
  };

  const rootId = add(SEED[0], null, 0);
  recomputeDepths(board);

  let laid = tidy(board, rootId);

  const link = (a: string, b: string, label: string) => {
    const s = byText.get(a);
    const t = byText.get(b);
    if (!s || !t) return;
    laid = linkThoughts(laid, s, t, label).board;
  };
  link('Data-center electricity demand', 'AI Infrastructure', 'customer overlap');
  link('Solar Energy', 'Battery Storage', 'enables');
  link('Permitting', 'Interconnection', 'similar problem');

  return laid;
}
