import * as THREE from 'three';
import { CadBody, CadDocument as ICadDocument, CadId, CadOperation, CadSelection } from './CadTypes';
import { OperationHistory } from './OperationHistory';

export class CadDocument implements ICadDocument {
  id: string;
  name: string;
  units: 'mm' = 'mm';
  bodies: CadBody[];
  selection: CadSelection | null = null;
  operations: CadOperation[] = [];

  private history: OperationHistory;

  constructor(id: string, name: string, bodies: CadBody[], history: OperationHistory) {
    this.id = id;
    this.name = name;
    this.bodies = bodies;
    this.history = history;
  }

  select(selection: CadSelection | null): void {
    this.selection = selection;
  }

  getBody(id: CadId): CadBody | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  commitTransform(bodyId: CadId, delta: THREE.Matrix4): CadOperation {
    const op = this.history.add({
      type: 'TransformBody',
      targetId: bodyId,
      matrix: delta.toArray(),
    });
    this.operations = this.history.getAll();
    return op;
  }

  getHistory(): OperationHistory {
    return this.history;
  }
}
