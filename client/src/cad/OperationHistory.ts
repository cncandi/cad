import { CadOperation, CadId } from './CadTypes';

export class OperationHistory {
  private operations: CadOperation[] = [];

  add(op: Omit<CadOperation, 'id' | 'createdAt'>): CadOperation {
    const operation: CadOperation = {
      ...op,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.operations.push(operation);
    console.info('[OperationHistory] +', operation.type, operation.targetId, operation);
    return operation;
  }

  getAll(): CadOperation[] {
    return [...this.operations];
  }

  getLast(): CadOperation | null {
    return this.operations[this.operations.length - 1] ?? null;
  }

  forBody(bodyId: CadId): CadOperation[] {
    return this.operations.filter((op) => op.targetId === bodyId);
  }

  toJSON(): string {
    return JSON.stringify(this.operations, null, 2);
  }
}
