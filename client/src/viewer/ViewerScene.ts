import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DemoCadAdapter } from '../cad/DemoCadAdapter';
import { buildDemoMesh, buildEdgeLines, getMaterial } from '../cad/MeshBuilder';
import { CadDocument } from '../cad/CadDocument';
import type { TransformSpace } from '../app/cadStore';

export interface SceneCallbacks {
  onBodySelected:    (bodyId: string | null, position: [number, number, number]) => void;
  onFaceSelected?:   (bodyId: string, faceIndex: number, normal: THREE.Vector3) => void;
  onTransformCommit: (bodyId: string, matrix: number[], position: THREE.Vector3, rotation: THREE.Euler) => void;
  onPositionChange:  (p: [number, number, number]) => void;
  onRotationChange:  (r: [number, number, number]) => void;
}

export class ViewerScene {
  private renderer:      THREE.WebGLRenderer;
  private scene:         THREE.Scene;
  private camera:        THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;

  // Two simultaneous gizmos – translate arrows + rotate rings always visible
  private tcTranslate:   TransformControls;
  private tcRotate:      TransformControls;
  private gizmoTarget:   THREE.Object3D;

  private meshMap  = new Map<string, THREE.Mesh>();
  private edgeMap  = new Map<string, THREE.LineSegments>();
  private cadDocument: CadDocument;
  private selectedBodyId: string | null = null;
  private animFrameId = 0;
  private callbacks: SceneCallbacks;

  // Drag state (shared across both controls)
  private dragStartMatrix:    THREE.Matrix4 | null = null;
  private selectedStartMatrix: THREE.Matrix4 | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks) {
    this.callbacks = callbacks;

    // ── Renderer ──────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ── Scene ─────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8edf3);
    this.scene.fog = new THREE.Fog(0xe8edf3, 40, 100);

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(8, 6, 10);
    this.camera.lookAt(0, 0, 0);

    this.setupLights();

    const grid = new THREE.GridHelper(20, 40, 0xa0a8b8, 0xc0c8d4);
    grid.position.y = -0.21;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(2);
    axes.position.set(-8, 0, -6);
    this.scene.add(axes);

    // ── Orbit ─────────────────────────────────────────────────────────────
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 80;

    // ── Shared gizmo anchor ───────────────────────────────────────────────
    this.gizmoTarget = new THREE.Object3D();
    this.scene.add(this.gizmoTarget);

    // ── Translate gizmo ───────────────────────────────────────────────────
    this.tcTranslate = new TransformControls(this.camera, this.renderer.domElement);
    this.tcTranslate.setMode('translate');
    this.tcTranslate.attach(this.gizmoTarget);
    this.tcTranslate.getHelper().visible = false;
    this.scene.add(this.tcTranslate.getHelper());

    // ── Rotate gizmo ──────────────────────────────────────────────────────
    this.tcRotate = new TransformControls(this.camera, this.renderer.domElement);
    this.tcRotate.setMode('rotate');
    this.tcRotate.attach(this.gizmoTarget);
    this.tcRotate.getHelper().visible = false;
    this.scene.add(this.tcRotate.getHelper());

    this.setupTransformEvents(this.tcTranslate, this.tcRotate);
    this.setupTransformEvents(this.tcRotate,    this.tcTranslate);

    // ── Demo geometry ─────────────────────────────────────────────────────
    const adapter = new DemoCadAdapter();
    this.cadDocument = adapter.createDemoDocument();
    this.loadDemoGeometry();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.animate();
  }

  // ── Lights ───────────────────────────────────────────────────────────────
  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.width = key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far  = 60;
    key.shadow.camera.left = key.shadow.camera.bottom = -12;
    key.shadow.camera.right = key.shadow.camera.top   =  12;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8ab4d4, 0.45);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);
  }

  // ── Geometry ─────────────────────────────────────────────────────────────
  private loadDemoGeometry(): void {
    for (const body of this.cadDocument.bodies) {
      const mesh  = buildDemoMesh(body);
      const edges = buildEdgeLines(mesh);
      this.scene.add(mesh);
      this.scene.add(edges);
      this.meshMap.set(body.id, mesh);
      this.edgeMap.set(body.id, edges);
    }
  }

  // ── Transform events (called for each TC, passing the other as sibling) ──
  private setupTransformEvents(tc: TransformControls, sibling: TransformControls): void {
    tc.addEventListener('dragging-changed', (event) => {
      const dragging = (event as unknown as { value: boolean }).value;
      this.orbitControls.enabled = !dragging;
      // While this one drags, disable the sibling so it doesn't interfere
      if (dragging) {
        sibling.enabled = false;
      } else {
        sibling.enabled = true;
      }
    });

    tc.addEventListener('mouseDown', () => {
      this.dragStartMatrix     = this.gizmoTarget.matrixWorld.clone();
      const mesh               = this.selectedBodyId ? this.meshMap.get(this.selectedBodyId) : null;
      this.selectedStartMatrix = mesh ? mesh.matrixWorld.clone() : null;
    });

    tc.addEventListener('objectChange', () => {
      if (!this.dragStartMatrix || !this.selectedStartMatrix || !this.selectedBodyId) return;
      const mesh  = this.meshMap.get(this.selectedBodyId);
      const edges = this.edgeMap.get(this.selectedBodyId);
      if (!mesh) return;

      const delta = this.gizmoTarget.matrixWorld.clone()
        .multiply(this.dragStartMatrix.clone().invert());

      mesh.matrix.copy(delta.clone().multiply(this.selectedStartMatrix));
      mesh.matrixAutoUpdate = false;
      mesh.updateWorldMatrix(false, false);

      if (edges) {
        edges.position.setFromMatrixPosition(mesh.matrix);
        edges.rotation.setFromRotationMatrix(mesh.matrix);
      }

      const pos = new THREE.Vector3().setFromMatrixPosition(mesh.matrix);
      const rot = new THREE.Euler().setFromRotationMatrix(mesh.matrix);

      this.callbacks.onPositionChange([
        parseFloat(pos.x.toFixed(3)),
        parseFloat(pos.y.toFixed(3)),
        parseFloat(pos.z.toFixed(3)),
      ]);
      this.callbacks.onRotationChange([
        parseFloat(THREE.MathUtils.radToDeg(rot.x).toFixed(2)),
        parseFloat(THREE.MathUtils.radToDeg(rot.y).toFixed(2)),
        parseFloat(THREE.MathUtils.radToDeg(rot.z).toFixed(2)),
      ]);
    });

    tc.addEventListener('mouseUp', () => {
      if (!this.selectedBodyId || !this.dragStartMatrix) return;

      const delta = this.gizmoTarget.matrixWorld.clone()
        .multiply(this.dragStartMatrix.clone().invert());

      const mesh = this.meshMap.get(this.selectedBodyId);
      const pos  = mesh ? new THREE.Vector3().setFromMatrixPosition(mesh.matrix) : new THREE.Vector3();
      const rot  = mesh ? new THREE.Euler().setFromRotationMatrix(mesh.matrix)   : new THREE.Euler();

      this.callbacks.onTransformCommit(this.selectedBodyId, delta.toArray(), pos, rot);
      this.dragStartMatrix     = null;
      this.selectedStartMatrix = null;
    });
  }

  // ── Body selection ───────────────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.tcTranslate.dragging || this.tcRotate.dragging) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    );

    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);

    const hits = rc.intersectObjects(Array.from(this.meshMap.values()), false);
    if (hits.length > 0) {
      const bodyId = hits[0].object.userData['bodyId'] as string | undefined;
      if (bodyId) { this.selectBody(bodyId); return; }
    }
    this.selectBody(null);
  };

  selectBody(bodyId: string | null): void {
    if (this.selectedBodyId) {
      const prev = this.meshMap.get(this.selectedBodyId);
      if (prev) (prev.material as THREE.MeshStandardMaterial).copy(getMaterial(false));
    }

    this.selectedBodyId = bodyId;

    if (bodyId) {
      const mesh = this.meshMap.get(bodyId);
      if (mesh) {
        (mesh.material as THREE.MeshStandardMaterial).copy(getMaterial(true));

        const box    = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        this.gizmoTarget.position.copy(center);
        this.gizmoTarget.updateMatrixWorld(true);

        this.tcTranslate.getHelper().visible = true;
        this.tcRotate.getHelper().visible    = true;

        const pos = mesh.position;
        this.callbacks.onBodySelected(bodyId, [
          parseFloat(pos.x.toFixed(3)),
          parseFloat(pos.y.toFixed(3)),
          parseFloat(pos.z.toFixed(3)),
        ]);
      }
    } else {
      this.tcTranslate.getHelper().visible = false;
      this.tcRotate.getHelper().visible    = false;
      this.callbacks.onBodySelected(null, [0, 0, 0]);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────
  // Mode switch is no longer needed (both always visible) – kept for kbd compat
  setTransformMode(_mode: string): void { /* both always shown */ }

  setTransformSpace(space: TransformSpace): void {
    this.tcTranslate.setSpace(space);
    this.tcRotate.setSpace(space);
  }

  setSnapEnabled(enabled: boolean): void {
    const tSnap = enabled ? 0.5 : null;
    const rSnap = enabled ? THREE.MathUtils.degToRad(15) : null;
    this.tcTranslate.setTranslationSnap(tSnap);
    this.tcTranslate.setRotationSnap(rSnap);
    this.tcRotate.setTranslationSnap(tSnap);
    this.tcRotate.setRotationSnap(rSnap);
  }

  setBodyVisibility(bodyId: string, visible: boolean): void {
    const mesh  = this.meshMap.get(bodyId);
    const edges = this.edgeMap.get(bodyId);
    if (mesh)  mesh.visible  = visible;
    if (edges) edges.visible = visible;
  }

  focusSelection(): void {
    if (!this.selectedBodyId) return;
    const mesh = this.meshMap.get(this.selectedBodyId);
    if (!mesh) return;
    const box    = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(center.clone().add(new THREE.Vector3(size, size * 0.7, size)));
    this.orbitControls.target.copy(center);
  }

  cancelDrag(): void {
    if (this.tcTranslate.dragging) this.tcTranslate.reset();
    if (this.tcRotate.dragging)    this.tcRotate.reset();
    this.selectBody(null);
  }

  setTheme(theme: 'light' | 'dark'): void {
    const bg = theme === 'light' ? 0xe8edf3 : 0x0d1117;
    this.scene.background = new THREE.Color(bg);
    (this.scene.fog as THREE.Fog).color.set(bg);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  getDocument(): CadDocument { return this.cadDocument; }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.orbitControls.dispose();
    this.tcTranslate.dispose();
    this.tcRotate.dispose();
    this.renderer.dispose();
    this.meshMap.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
