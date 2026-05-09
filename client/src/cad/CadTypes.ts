export type CadId = string;

export interface CadDocument {
  id: string;
  name: string;
  units: 'mm';
  bodies: CadBody[];
  selection: CadSelection | null;
  operations: CadOperation[];
}

export interface CadBody {
  id: CadId;
  name: string;
  visible: boolean;
  meshObjectId?: string;
  faceIds: CadId[];
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export interface CadFace {
  id: CadId;
  bodyId: CadId;
  normalDirection?: [number, number, number];
  centroid?: [number, number, number];
}

export interface CadSelection {
  type: 'body' | 'face' | 'edge' | 'vertex';
  bodyId?: CadId;
  faceId?: CadId;
  edgeId?: CadId;
}

export interface CadOperation {
  id: CadId;
  type: 'TransformBody' | 'MoveFacePreview' | 'CloseHolePreview';
  targetId: CadId;
  matrix?: number[];
  distanceMm?: number;
  createdAt: string;
}

export interface CadMesh {
  bodyId: CadId;
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}
