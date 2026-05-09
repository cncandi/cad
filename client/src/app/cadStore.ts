import { create } from 'zustand';
import { CadOperation, CadSelection } from '../cad/CadTypes';

export type TransformMode = 'translate' | 'rotate';
export type TransformSpace = 'world' | 'local';

interface CadState {
  documentName: string;
  selectedBodyId: string | null;
  selection: CadSelection | null;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  snapEnabled: boolean;
  operations: CadOperation[];
  bodyVisibility: Record<string, boolean>;
  position: [number, number, number];
  rotation: [number, number, number];

  setSelection: (sel: CadSelection | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setTransformSpace: (space: TransformSpace) => void;
  setSnapEnabled: (v: boolean) => void;
  addOperation: (op: CadOperation) => void;
  toggleBodyVisibility: (id: string) => void;
  setPosition: (p: [number, number, number]) => void;
  setRotation: (r: [number, number, number]) => void;
  setDocumentName: (name: string) => void;
}

export const useCadStore = create<CadState>((set) => ({
  documentName: 'Demo Assembly',
  selectedBodyId: null,
  selection: null,
  transformMode: 'translate',
  transformSpace: 'world',
  snapEnabled: true,
  operations: [],
  bodyVisibility: {
    'body-base': true,
    'body-column': true,
    'body-cap': true,
  },
  position: [0, 0, 0],
  rotation: [0, 0, 0],

  setSelection: (sel) =>
    set({ selection: sel, selectedBodyId: sel?.bodyId ?? null }),

  setTransformMode: (mode) => set({ transformMode: mode }),
  setTransformSpace: (space) => set({ transformSpace: space }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),

  addOperation: (op) =>
    set((state) => ({ operations: [...state.operations, op] })),

  toggleBodyVisibility: (id) =>
    set((state) => ({
      bodyVisibility: {
        ...state.bodyVisibility,
        [id]: !state.bodyVisibility[id],
      },
    })),

  setPosition: (p) => set({ position: p }),
  setRotation: (r) => set({ rotation: r }),
  setDocumentName: (name) => set({ documentName: name }),
}));
