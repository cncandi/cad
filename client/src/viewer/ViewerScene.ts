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

// ─── Snap candidate ──────────────────────────────────────────────────────────
interface SnapPoint {
  point: THREE.Vector3;
  type:  'vertex' | 'midpoint' | 'center';
}

const SNAP_SCREEN_PX = 28; // pixels – max distance to activate snap

// ─── Snap indicator colors ────────────────────────────────────────────────────
const SNAP_COL: Record<SnapPoint['type'], number> = {
  vertex:   0xffdd00,   // yellow  – endpoint
  midpoint: 0x00ddff,   // cyan    – midpoint
  center:   0xff8800,   // orange  – face center
};

export class ViewerScene {
  private renderer:      THREE.WebGLRenderer;
  private scene:         THREE.Scene;
  private camera:        THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private tcTranslate:   TransformControls;
  private tcRotate:      TransformControls;
  private gizmoTarget:   THREE.Object3D;

  private meshMap = new Map<string, THREE.Mesh>();
  private edgeMap = new Map<string, THREE.LineSegments>();
  private cadDocument: CadDocument;
  private selectedBodyId: string | null = null;
  private animFrameId = 0;
  private callbacks: SceneCallbacks;
  private dragStartMatrix:     THREE.Matrix4 | null = null;
  private selectedStartMatrix: THREE.Matrix4 | null = null;

  // ── Pivot reposition ───────────────────────────────────────────────────────
  private pivotSphere:    THREE.Mesh;       // clickable center hub
  private pivotMode      = false;
  private snapCandidates: SnapPoint[] = [];
  private snapIndicator:  THREE.Mesh;       // shows nearest snap point
  private snapRing:       THREE.Mesh;       // ring around snap indicator
  private activeSnap:     SnapPoint | null = null;
  private pivotLabel:     HTMLDivElement;   // DOM label shown during pivot mode

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks) {
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8edf3);
    this.scene.fog = new THREE.Fog(0xe8edf3, 40, 100);

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

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 80;

    // ── Gizmo anchor ─────────────────────────────────────────────────────
    this.gizmoTarget = new THREE.Object3D();
    this.scene.add(this.gizmoTarget);

    // ── Translate + Rotate gizmos ─────────────────────────────────────────
    this.tcTranslate = new TransformControls(this.camera, this.renderer.domElement);
    this.tcTranslate.setMode('translate');
    this.tcTranslate.attach(this.gizmoTarget);
    this.tcTranslate.getHelper().visible = false;
    this.scene.add(this.tcTranslate.getHelper());

    this.tcRotate = new TransformControls(this.camera, this.renderer.domElement);
    this.tcRotate.setMode('rotate');
    this.tcRotate.attach(this.gizmoTarget);
    this.tcRotate.getHelper().visible = false;
    this.scene.add(this.tcRotate.getHelper());

    this.setupTransformEvents(this.tcTranslate, this.tcRotate);
    this.setupTransformEvents(this.tcRotate,    this.tcTranslate);

    // ── Pivot center sphere (clickable hub) ───────────────────────────────
    this.pivotSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.1, metalness: 0.6,
        depthTest: false, transparent: true, opacity: 0.0,
      }),
    );
    this.pivotSphere.renderOrder = 2000;
    this.pivotSphere.visible = false;
    this.scene.add(this.pivotSphere);

    // ── Snap indicator (shown during pivot mode) ──────────────────────────
    this.snapIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffdd00, roughness: 0.1, metalness: 0.3,
        depthTest: false, transparent: true, opacity: 0.0,
        emissive: new THREE.Color(0xffdd00), emissiveIntensity: 0.5,
      }),
    );
    this.snapIndicator.renderOrder = 2001;
    this.scene.add(this.snapIndicator);

    this.snapRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.10, 0.012, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0xffdd00, roughness: 0.1, metalness: 0.1,
        depthTest: false, transparent: true, opacity: 0.0,
      }),
    );
    this.snapRing.renderOrder = 2002;
    this.scene.add(this.snapRing);

    // ── DOM label for pivot mode ──────────────────────────────────────────
    this.pivotLabel = document.createElement('div');
    Object.assign(this.pivotLabel.style, {
      position: 'absolute', bottom: '42px', left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255,180,0,0.92)',
      color: '#2a1800', padding: '3px 14px',
      borderRadius: '5px', fontSize: '11px', fontFamily: 'sans-serif',
      fontWeight: '500', display: 'none', pointerEvents: 'none',
      zIndex: '10',
    });
    this.pivotLabel.textContent = 'Pivot-Modus: Fangpunkt anklicken · Esc = Abbrechen';
    canvas.parentElement?.appendChild(this.pivotLabel);

    // ── Events ────────────────────────────────────────────────────────────
    // Capture phase so we intercept BEFORE TransformControls
    canvas.addEventListener('pointerdown', this.onPointerDownCapture, true);
    canvas.addEventListener('pointermove', this.onPointerMoveCapture,  true);

    const adapter = new DemoCadAdapter();
    this.cadDocument = adapter.createDemoDocument();
    this.loadDemoGeometry();

    this.animate();
  }

  // ── Lights ────────────────────────────────────────────────────────────────
  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.width = key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 60;
    key.shadow.camera.left = key.shadow.camera.bottom = -12;
    key.shadow.camera.right = key.shadow.camera.top = 12;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ab4d4, 0.45);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);
  }

  private loadDemoGeometry(): void {
    for (const body of this.cadDocument.bodies) {
      const mesh  = buildDemoMesh(body);
      const edges = buildEdgeLines(mesh);
      this.scene.add(mesh); this.scene.add(edges);
      this.meshMap.set(body.id, mesh);
      this.edgeMap.set(body.id, edges);
    }
  }

  // ── Transform events ──────────────────────────────────────────────────────
  private setupTransformEvents(tc: TransformControls, sibling: TransformControls): void {
    tc.addEventListener('dragging-changed', (event) => {
      const dragging = (event as unknown as { value: boolean }).value;
      this.orbitControls.enabled = !dragging;
      sibling.enabled = !dragging;
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
      this.callbacks.onPositionChange([+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)]);
      this.callbacks.onRotationChange([
        +THREE.MathUtils.radToDeg(rot.x).toFixed(2),
        +THREE.MathUtils.radToDeg(rot.y).toFixed(2),
        +THREE.MathUtils.radToDeg(rot.z).toFixed(2),
      ]);

      // Keep pivot sphere in sync
      this.pivotSphere.position.copy(this.gizmoTarget.position);
    });

    tc.addEventListener('mouseUp', () => {
      if (!this.selectedBodyId || !this.dragStartMatrix) return;
      const delta = this.gizmoTarget.matrixWorld.clone()
        .multiply(this.dragStartMatrix.clone().invert());
      const mesh = this.meshMap.get(this.selectedBodyId);
      const pos  = mesh ? new THREE.Vector3().setFromMatrixPosition(mesh.matrix) : new THREE.Vector3();
      const rot  = mesh ? new THREE.Euler().setFromRotationMatrix(mesh.matrix)   : new THREE.Euler();
      this.callbacks.onTransformCommit(this.selectedBodyId, delta.toArray(), pos, rot);
      this.dragStartMatrix = this.selectedStartMatrix = null;
    });
  }

  // ── Pivot sphere scale (constant screen size) ─────────────────────────────
  private updatePivotSphereScale(): void {
    if (!this.pivotSphere.visible) return;
    const dist = this.camera.position.distanceTo(this.pivotSphere.position);
    const s    = Math.max(0.01, dist * 0.055);
    this.pivotSphere.scale.setScalar(s);
    this.snapRing.scale.setScalar(s * 1.1);
  }

  // ── Snap candidates ───────────────────────────────────────────────────────
  private buildSnapCandidates(mesh: THREE.Mesh): SnapPoint[] {
    const result: SnapPoint[] = [];
    const geo   = mesh.geometry;
    const posA  = geo.attributes['position'] as THREE.BufferAttribute;
    const idx   = geo.index;
    const mat   = mesh.matrixWorld;

    if (!posA) return result;

    // 1) Unique vertices (endpoints)
    const seen = new Set<string>();
    const worldVerts: THREE.Vector3[] = [];
    const count = idx ? idx.count : posA.count;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      const v  = new THREE.Vector3().fromBufferAttribute(posA, vi).applyMatrix4(mat);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!seen.has(key)) { seen.add(key); worldVerts.push(v); result.push({ point: v, type: 'vertex' }); }
    }

    // 2) Edge midpoints (every triangle edge)
    for (let i = 0; i < count; i += 3) {
      for (let e = 0; e < 3; e++) {
        const ai = idx ? idx.getX(i + e)       : i + e;
        const bi = idx ? idx.getX(i + (e+1)%3) : i + (e+1)%3;
        const a  = new THREE.Vector3().fromBufferAttribute(posA, ai).applyMatrix4(mat);
        const b  = new THREE.Vector3().fromBufferAttribute(posA, bi).applyMatrix4(mat);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const key = `${mid.x.toFixed(3)},${mid.y.toFixed(3)},${mid.z.toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); result.push({ point: mid, type: 'midpoint' }); }
      }
    }

    // 3) Face centroids
    for (let i = 0; i < count; i += 3) {
      const ai = idx ? idx.getX(i)   : i;
      const bi = idx ? idx.getX(i+1) : i+1;
      const ci = idx ? idx.getX(i+2) : i+2;
      const a  = new THREE.Vector3().fromBufferAttribute(posA, ai).applyMatrix4(mat);
      const b  = new THREE.Vector3().fromBufferAttribute(posA, bi).applyMatrix4(mat);
      const c  = new THREE.Vector3().fromBufferAttribute(posA, ci).applyMatrix4(mat);
      const cen = a.clone().add(b).add(c).divideScalar(3);
      const key = `${cen.x.toFixed(3)},${cen.y.toFixed(3)},${cen.z.toFixed(3)}`;
      if (!seen.has(key)) { seen.add(key); result.push({ point: cen, type: 'center' }); }
    }

    return result;
  }

  // ── Project world point to screen ─────────────────────────────────────────
  private toScreen(world: THREE.Vector3): THREE.Vector2 {
    const v   = world.clone().project(this.camera);
    const el  = this.renderer.domElement;
    return new THREE.Vector2(
      (v.x + 1) / 2 * el.clientWidth,
      (1 - v.y) / 2 * el.clientHeight,
    );
  }

  private findNearestSnap(screenX: number, screenY: number): SnapPoint | null {
    let best: SnapPoint | null = null;
    let bestDist = SNAP_SCREEN_PX;
    for (const sp of this.snapCandidates) {
      const s    = this.toScreen(sp.point);
      const dist = Math.hypot(s.x - screenX, s.y - screenY);
      if (dist < bestDist) { bestDist = dist; best = sp; }
    }
    return best;
  }

  // ── Pivot mode enter / exit ───────────────────────────────────────────────
  private enterPivotMode(): void {
    this.pivotMode = true;
    this.orbitControls.enabled = false;
    this.tcTranslate.enabled   = false;
    this.tcRotate.enabled      = false;
    this.pivotLabel.style.display = 'block';
    this.renderer.domElement.style.cursor = 'crosshair';

    const mesh = this.selectedBodyId ? this.meshMap.get(this.selectedBodyId) : null;
    this.snapCandidates = mesh ? this.buildSnapCandidates(mesh) : [];

    // Show snap indicator
    const mat = this.snapIndicator.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.0;
  }

  private exitPivotMode(): void {
    this.pivotMode = false;
    this.orbitControls.enabled = true;
    this.tcTranslate.enabled   = true;
    this.tcRotate.enabled      = true;
    this.pivotLabel.style.display = 'none';
    this.renderer.domElement.style.cursor = '';
    this.activeSnap = null;

    // Hide snap indicator
    (this.snapIndicator.material as THREE.MeshStandardMaterial).opacity = 0.0;
    (this.snapRing.material as THREE.MeshStandardMaterial).opacity = 0.0;
  }

  // ── Pointer capture handlers ───────────────────────────────────────────────
  private onPointerMoveCapture = (e: PointerEvent): void => {
    // Pivot sphere hover cursor
    if (!this.pivotMode && this.pivotSphere.visible) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc  = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        -((e.clientY - rect.top)  / rect.height) *  2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, this.camera);
      const hits = rc.intersectObject(this.pivotSphere, false);
      this.renderer.domElement.style.cursor = hits.length ? 'grab' : '';
    }

    // Snap search during pivot mode
    if (!this.pivotMode) return;

    const rect  = this.renderer.domElement.getBoundingClientRect();
    const sx    = e.clientX - rect.left;
    const sy    = e.clientY - rect.top;
    const snap  = this.findNearestSnap(sx, sy);
    this.activeSnap = snap;

    const iMat = this.snapIndicator.material as THREE.MeshStandardMaterial;
    const rMat = this.snapRing.material      as THREE.MeshStandardMaterial;

    if (snap) {
      const col = new THREE.Color(SNAP_COL[snap.type]);
      this.snapIndicator.position.copy(snap.point);
      this.snapRing.position.copy(snap.point);
      // Orient ring to face camera
      this.snapRing.quaternion.copy(this.camera.quaternion);
      iMat.color.copy(col);
      iMat.emissive.copy(col);
      iMat.opacity = 0.9;
      rMat.color.copy(col);
      rMat.opacity = 0.8;

      // Scale constant screen-size
      const d = this.camera.position.distanceTo(snap.point);
      const s = Math.max(0.01, d * 0.045);
      this.snapIndicator.scale.setScalar(s);
      this.snapRing.scale.setScalar(s * 1.4);
    } else {
      iMat.opacity = 0.0;
      rMat.opacity = 0.0;
    }
  };

  private onPointerDownCapture = (e: PointerEvent): void => {
    if (e.button !== 0) return;

    // ── In pivot mode: place gimbal on snap point ─────────────────────────
    if (this.pivotMode) {
      e.stopPropagation();
      if (this.activeSnap) {
        // Move gizmoTarget WITHOUT moving the body
        this.gizmoTarget.position.copy(this.activeSnap.point);
        this.gizmoTarget.updateMatrixWorld(true);
        this.pivotSphere.position.copy(this.activeSnap.point);
      }
      this.exitPivotMode();
      return;
    }

    // ── Check pivot sphere hit → enter pivot mode ─────────────────────────
    if (this.pivotSphere.visible) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc  = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        -((e.clientY - rect.top)  / rect.height) *  2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.params.Points.threshold = 0.1;
      rc.setFromCamera(ndc, this.camera);
      const hits = rc.intersectObject(this.pivotSphere, false);
      if (hits.length) {
        e.stopPropagation(); // block TransformControls from seeing this click
        this.enterPivotMode();
        return;
      }
    }

    // ── Normal body selection ─────────────────────────────────────────────
    if (this.tcTranslate.dragging || this.tcRotate.dragging) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    );
    const rc   = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hits = rc.intersectObjects(Array.from(this.meshMap.values()), false);
    if (hits.length) {
      const bodyId = hits[0].object.userData['bodyId'] as string | undefined;
      if (bodyId) { this.selectBody(bodyId); return; }
    }
    this.selectBody(null);
  };

  // ── Body selection ────────────────────────────────────────────────────────
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
        this.pivotSphere.position.copy(center);
        this.pivotSphere.visible = true;

        const pos = mesh.position;
        this.callbacks.onBodySelected(bodyId, [+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)]);
      }
    } else {
      this.tcTranslate.getHelper().visible = false;
      this.tcRotate.getHelper().visible    = false;
      this.pivotSphere.visible = false;
      if (this.pivotMode) this.exitPivotMode();
      this.callbacks.onBodySelected(null, [0, 0, 0]);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  setTransformMode(_mode: string): void { /* both always visible */ }

  setTransformSpace(space: TransformSpace): void {
    this.tcTranslate.setSpace(space);
    this.tcRotate.setSpace(space);
  }

  setSnapEnabled(enabled: boolean): void {
    const t = enabled ? 0.5 : null;
    const r = enabled ? THREE.MathUtils.degToRad(15) : null;
    this.tcTranslate.setTranslationSnap(t);
    this.tcTranslate.setRotationSnap(r);
    this.tcRotate.setTranslationSnap(t);
    this.tcRotate.setRotationSnap(r);
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
    if (this.pivotMode) { this.exitPivotMode(); return; }
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
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDownCapture, true);
    el.removeEventListener('pointermove', this.onPointerMoveCapture,  true);
    this.pivotLabel.remove();
    this.orbitControls.dispose();
    this.tcTranslate.dispose();
    this.tcRotate.dispose();
    this.renderer.dispose();
    this.meshMap.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.updatePivotSphereScale();
    this.renderer.render(this.scene, this.camera);
  };
}
