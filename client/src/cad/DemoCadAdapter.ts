import { CadDocument } from './CadDocument';
import { CadMesh } from './CadTypes';
import { CadKernelAdapter } from './OccAdapter';
import { OperationHistory } from './OperationHistory';

/**
 * DemoCadAdapter – liefert Demo-Geometrie für Sprint 1.
 * Ersetzt in Sprint 2 durch OccAdapter mit echtem OpenCascade.js WASM.
 */
export class DemoCadAdapter implements CadKernelAdapter {
  createDemoDocument(): CadDocument {
    const history = new OperationHistory();
    return new CadDocument(
      'demo-doc-1',
      'Demo Assembly',
      [
        {
          id: 'body-base',
          name: 'Base Plate',
          visible: true,
          meshObjectId: 'mesh-base',
          faceIds: ['face-base-top', 'face-base-bottom'],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'body-column',
          name: 'Column',
          visible: true,
          meshObjectId: 'mesh-column',
          faceIds: ['face-col-top', 'face-col-side'],
          position: [0, 1.5, 0],
          rotation: [0, 0, 0],
        },
        {
          id: 'body-cap',
          name: 'Cap',
          visible: true,
          meshObjectId: 'mesh-cap',
          faceIds: ['face-cap-top'],
          position: [0, 3.2, 0],
          rotation: [0, 0, 0],
        },
      ],
      history
    );
  }

  async loadStep(_file: File): Promise<CadDocument> {
    // TODO Sprint 2: OpenCascade.js WASM STEP-Import
    console.warn('[OccAdapter] loadStep: WASM not yet integrated. Returning demo document.');
    return this.createDemoDocument();
  }

  async triangulate(_document: CadDocument): Promise<CadMesh[]> {
    // TODO Sprint 2: BRep-Triangulierung über OCC
    return [];
  }

  async transformBody(_bodyId: string, _matrix: number[]): Promise<CadDocument> {
    // TODO Sprint 2: B-Rep transform via OCC
    console.warn('[OccAdapter] transformBody: not yet connected to kernel.');
    return this.createDemoDocument();
  }

  async exportStep(_document: CadDocument): Promise<Blob> {
    // TODO Sprint 2: STEP export via OCC
    console.warn('[OccAdapter] exportStep: not yet connected to kernel.');
    return new Blob([''], { type: 'application/octet-stream' });
  }
}
