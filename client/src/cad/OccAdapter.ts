import { CadDocument } from './CadDocument';
import { CadMesh } from './CadTypes';

export interface CadKernelAdapter {
  loadStep(file: File): Promise<CadDocument>;
  triangulate(document: CadDocument): Promise<CadMesh[]>;
  transformBody(bodyId: string, matrix: number[]): Promise<CadDocument>;
  exportStep(document: CadDocument): Promise<Blob>;
}
