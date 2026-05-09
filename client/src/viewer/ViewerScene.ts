import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DemoCadAdapter } from '../cad/DemoCadAdapter';
import { buildDemoMesh, buildEdgeLines, getMaterial } from '../cad/MeshBuilder';
import { CadDocument } from '../cad/CadDocument';
import type { TransformSpace } from '../app/cadStore';

export interface SceneCallbacks {
  onBodySelected:    (id: string | null, pos: [number, number, number]) => void;
  onFaceSelected?:   (id: string, fi: number, n: THREE.Vector3) => void;
  onTransformCommit: (id: string, mat: number[], pos: THREE.Vector3, rot: THREE.Euler) => void;
  onPositionChange:  (p: [number, number, number]) => void;
  onRotationChange:  (r: [number, number, number]) => void;
}

// ─── Snap ─────────────────────────────────────────────────────────────────────
type SnapType = 'vertex' | 'midpoint' | 'center';
interface SnapPt { p: THREE.Vector3; t: SnapType; }
const SNAP_COL: Record<SnapType, number> = { vertex: 0xffcc00, midpoint: 0x00ccff, center: 0xff8800 };
const SNAP_PX = 24;

function buildSnaps(mesh: THREE.Mesh): SnapPt[] {
  const out: SnapPt[] = [];
  const seen = new Set<string>();
  const geo  = mesh.geometry;
  const posA = geo.attributes['position'] as THREE.BufferAttribute;
  const idx  = geo.index;
  if (!posA) return out;

  const key = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const add  = (v: THREE.Vector3, t: SnapType) => {
    const k = key(v); if (!seen.has(k)) { seen.add(k); out.push({ p: v.clone(), t }); }
  };
  const count = idx ? idx.count : posA.count;
  const wv: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const vi = idx ? idx.getX(i) : i;
    const v  = new THREE.Vector3().fromBufferAttribute(posA, vi).applyMatrix4(mesh.matrixWorld);
    add(v, 'vertex'); wv.push(v);
  }
  for (let i = 0; i < count; i += 3) {
    const a = wv[i], b = wv[i+1], c = wv[i+2];
    if (!a || !b || !c) continue;
    add(a.clone().add(b).multiplyScalar(0.5), 'midpoint');
    add(b.clone().add(c).multiplyScalar(0.5), 'midpoint');
    add(c.clone().add(a).multiplyScalar(0.5), 'midpoint');
    add(a.clone().add(b).add(c).divideScalar(3), 'center');
  }
  return out;
}

export class ViewerScene {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private orbit:    OrbitControls;
  private tcT:      TransformControls;
  private tcR:      TransformControls;
  private anchor:   THREE.Object3D;

  private meshMap = new Map<string, THREE.Mesh>();
  private edgeMap = new Map<string, THREE.LineSegments>();
  private doc:     CadDocument;
  private cbs:     SceneCallbacks;
  private selId:   string | null = null;
  private frameId  = 0;
  private tcHandled = false;

  // ── Translate drag state ────────────────────────────────────────────────────
  private tAnchorStart = new THREE.Vector3();
  private tMeshStart   = new THREE.Vector3();

  // ── Rotate drag state ───────────────────────────────────────────────────────
  private rAnchorQStart = new THREE.Quaternion();
  private rMeshPosStart = new THREE.Vector3();
  private rMeshQStart   = new THREE.Quaternion();
  private rPivot        = new THREE.Vector3();

  // ── Snap ────────────────────────────────────────────────────────────────────
  private allSnaps:   SnapPt[] = [];
  private snapActive: SnapPt | null = null;
  private snapDot:    THREE.Mesh;
  private snapRing:   THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, cbs: SceneCallbacks) {
    this.cbs = cbs;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 60;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
    sun.shadow.camera.right = sun.shadow.camera.top   =  12;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8ab4d4, 0.4);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);

    const grid = new THREE.GridHelper(20, 40, 0xa0a8b8, 0xc0c8d4);
    grid.position.y = -0.21;
    this.scene.add(grid);
    const ax = new THREE.AxesHelper(2);
    ax.position.set(-8, 0, -6);
    this.scene.add(ax);

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance   = 1;
    this.orbit.maxDistance   = 80;

    this.anchor = new THREE.Object3D();
    this.scene.add(this.anchor);

    // Translate gizmo
    this.tcT = new TransformControls(this.camera, canvas);
    this.tcT.setMode('translate');
    this.tcT.attach(this.anchor);
    this.tcT.getHelper().visible = false;
    this.scene.add(this.tcT.getHelper());

    // Rotate gizmo (smaller)
    this.tcR = new TransformControls(this.camera, canvas);
    this.tcR.setMode('rotate');
    this.tcR.size = 0.55;
    this.tcR.attach(this.anchor);
    this.tcR.getHelper().visible = false;
    this.scene.add(this.tcR.getHelper());

    this._simplifyTranslateGizmo();
    this._bindTranslate();
    this._bindRotate();

    // Snap visuals
    this.snapDot = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0, color: 0xffcc00 }),
    );
    this.snapDot.renderOrder = 999;
    this.scene.add(this.snapDot);

    this.snapRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.28, 6, 24),
      new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, opacity: 0, color: 0xffcc00 }),
    );
    this.snapRing.renderOrder = 998;
    this.scene.add(this.snapRing);

    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerdown', this._onDown);

    const adapter = new DemoCadAdapter();
    this.doc = adapter.createDemoDocument();
    for (const body of this.doc.bodies) {
      const mesh  = buildDemoMesh(body);
      const edges = buildEdgeLines(mesh);
      this.scene.add(mesh); this.scene.add(edges);
      this.meshMap.set(body.id, mesh);
      this.edgeMap.set(body.id, edges);
    }
    this._rebuildSnaps();

    this._loop();
  }

  // ── Gizmo simplification (plane handles + negative arrows) ───────────────────
  private _simplifyTranslateGizmo(): void {
    const helper = this.tcT.getHelper();
    const HIDE   = new Set(['XY', 'XZ', 'YZ', 'XYZ', 'XYZE']);
    const orig   = helper.updateMatrixWorld.bind(helper);

    const applyHide = () => {
      helper.traverse((obj) => {
        if (HIDE.has(obj.name)) { obj.visible = false; return; }
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry && (obj.name === 'X' || obj.name === 'Y' || obj.name === 'Z')) {
            mesh.geometry.computeBoundingBox();
            const bb = mesh.geometry.boundingBox;
            if (bb) {
              const cx = (bb.min.x + bb.max.x) / 2;
              const cy = (bb.min.y + bb.max.y) / 2;
              const cz = (bb.min.z + bb.max.z) / 2;
              if ((obj.name === 'X' && cx < -0.05) ||
                  (obj.name === 'Y' && cy < -0.05) ||
                  (obj.name === 'Z' && cz < -0.05)) {
                obj.visible = false;
              }
            }
          }
        }
      });
    };

    helper.updateMatrixWorld = (force?: boolean) => { orig(force); applyHide(); };
  }

  // ── Translate binding ─────────────────────────────────────────────────────────
  private _bindTranslate(): void {
    this.tcT.addEventListener('dragging-changed', (e) => {
      const on = (e as unknown as { value: boolean }).value;
      this.orbit.enabled = !on;
      this.tcR.enabled   = !on;
    });

    this.tcT.addEventListener('mouseDown', () => {
      this.tcHandled = true;
      const mesh = this.selId ? this.meshMap.get(this.selId) : null;
      if (!mesh) return;
      this.tAnchorStart.copy(this.anchor.position);
      this.tMeshStart.copy(mesh.position);
    });

    this.tcT.addEventListener('objectChange', () => {
      const mesh = this.selId ? this.meshMap.get(this.selId) : null;
      if (!mesh) return;

      // delta = how much anchor moved
      const delta = this.anchor.position.clone().sub(this.tAnchorStart);
      mesh.position.copy(this.tMeshStart.clone().add(delta));

      const edges = this.edgeMap.get(this.selId!);
      if (edges) edges.position.copy(mesh.position);

      const p = mesh.position;
      this.cbs.onPositionChange([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    });

    this.tcT.addEventListener('mouseUp', () => this._commit());
  }

  // ── Rotate binding ────────────────────────────────────────────────────────────
  private _bindRotate(): void {
    this.tcR.addEventListener('dragging-changed', (e) => {
      const on = (e as unknown as { value: boolean }).value;
      this.orbit.enabled = !on;
      this.tcT.enabled   = !on;
    });

    this.tcR.addEventListener('mouseDown', () => {
      this.tcHandled = true;
      const mesh = this.selId ? this.meshMap.get(this.selId) : null;
      if (!mesh) return;
      this.rAnchorQStart.copy(this.anchor.quaternion);
      this.rMeshPosStart.copy(mesh.position);
      this.rMeshQStart.copy(mesh.quaternion);
      this.rPivot.copy(this.anchor.position);
    });

    this.tcR.addEventListener('objectChange', () => {
      const mesh = this.selId ? this.meshMap.get(this.selId) : null;
      if (!mesh) return;

      // rotation delta = current_anchor_quat * start_anchor_quat^-1
      const rotDelta = this.anchor.quaternion.clone()
        .multiply(this.rAnchorQStart.clone().invert());

      // rotate mesh position around pivot
      const offset = this.rMeshPosStart.clone().sub(this.rPivot);
      offset.applyQuaternion(rotDelta);
      mesh.position.copy(this.rPivot.clone().add(offset));

      // apply rotation to mesh orientation
      mesh.quaternion.copy(this.rMeshQStart.clone().premultiply(rotDelta));

      const edges = this.edgeMap.get(this.selId!);
      if (edges) { edges.position.copy(mesh.position); edges.quaternion.copy(mesh.quaternion); }

      const p = mesh.position;
      const r = new THREE.Euler().setFromQuaternion(mesh.quaternion);
      this.cbs.onPositionChange([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
      this.cbs.onRotationChange([
        +THREE.MathUtils.radToDeg(r.x).toFixed(2),
        +THREE.MathUtils.radToDeg(r.y).toFixed(2),
        +THREE.MathUtils.radToDeg(r.z).toFixed(2),
      ]);
    });

    this.tcR.addEventListener('mouseUp', () => this._commit());
  }

  private _commit(): void {
    if (!this.selId) return;
    const mesh = this.meshMap.get(this.selId);
    if (!mesh) return;
    const mat = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale);
    const r   = new THREE.Euler().setFromQuaternion(mesh.quaternion);
    this.cbs.onTransformCommit(this.selId, mat.toArray(), mesh.position.clone(), r);
    this.allSnaps = []; // rebuild at new position on next hover
  }

  // ── Snap ──────────────────────────────────────────────────────────────────────
  private _rebuildSnaps(): void {
    this.allSnaps = [];
    this.meshMap.forEach(mesh => { if (mesh.visible) this.allSnaps.push(...buildSnaps(mesh)); });
  }

  private _toScreen(w: THREE.Vector3): [number, number] {
    const v  = w.clone().project(this.camera);
    const el = this.renderer.domElement;
    return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight];
  }

  private _nearestSnap(sx: number, sy: number): SnapPt | null {
    if (!this.selId) return null;
    let best: SnapPt | null = null, bestD = SNAP_PX;
    for (const sp of this.allSnaps) {
      const [px, py] = this._toScreen(sp.p);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestD) { bestD = d; best = sp; }
    }
    return best;
  }

  private _showSnap(sp: SnapPt): void {
    const col = new THREE.Color(SNAP_COL[sp.t]);
    const dm  = this.snapDot.material  as THREE.MeshBasicMaterial;
    const rm  = this.snapRing.material as THREE.MeshBasicMaterial;
    dm.color.copy(col); dm.opacity = 0.55;
    rm.color.copy(col); rm.opacity = 0.30;
    this.snapDot.position.copy(sp.p);
    this.snapRing.position.copy(sp.p);
    this.snapRing.quaternion.copy(this.camera.quaternion);
    const s = this.camera.position.distanceTo(sp.p) * 0.018;
    this.snapDot.scale.setScalar(s);
    this.snapRing.scale.setScalar(s);
  }

  private _hideSnap(): void {
    (this.snapDot.material  as THREE.MeshBasicMaterial).opacity = 0;
    (this.snapRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.snapActive = null;
  }

  // ── Pointer events ────────────────────────────────────────────────────────────
  private _onMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const snap = this._nearestSnap(sx, sy);
    this.snapActive = snap;
    if (snap) this._showSnap(snap); else this._hideSnap();
  };

  private _onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.tcHandled) { this.tcHandled = false; return; }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx   = e.clientX - rect.left;
    const sy   = e.clientY - rect.top;

    // Click on snap point → reposition gimbal pivot
    if (this.snapActive && this.selId) {
      const [px, py] = this._toScreen(this.snapActive.p);
      if (Math.hypot(sx - px, sy - py) < SNAP_PX) {
        this.anchor.position.copy(this.snapActive.p);
        this.anchor.quaternion.set(0, 0, 0, 1);
        this.anchor.updateMatrixWorld(true);
        return;
      }
    }

    // Body selection
    const ndc = new THREE.Vector2(
      (sx / this.renderer.domElement.clientWidth)  *  2 - 1,
      (sy / this.renderer.domElement.clientHeight) * -2 + 1,
    );
    const rc   = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hits = rc.intersectObjects([...this.meshMap.values()], false);
    if (hits.length) {
      const id = hits[0].object.userData['bodyId'] as string | undefined;
      if (id) { this._select(id); return; }
    }
    this._select(null);
  };

  // ── Selection ─────────────────────────────────────────────────────────────────
  private _select(id: string | null): void {
    if (this.selId) {
      const m = this.meshMap.get(this.selId);
      if (m) (m.material as THREE.MeshStandardMaterial).copy(getMaterial(false));
    }
    this.selId = id;

    if (id) {
      const mesh = this.meshMap.get(id);
      if (!mesh) return;
      (mesh.material as THREE.MeshStandardMaterial).copy(getMaterial(true));
      const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      this.anchor.position.copy(c);
      this.anchor.quaternion.set(0, 0, 0, 1);
      this.anchor.updateMatrixWorld(true);
      this.tcT.getHelper().visible = true;
      this.tcR.getHelper().visible = true;
      const p = mesh.position;
      this.cbs.onBodySelected(id, [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    } else {
      this.tcT.getHelper().visible = false;
      this.tcR.getHelper().visible = false;
      this._hideSnap();
      this.cbs.onBodySelected(null, [0, 0, 0]);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  setTransformMode(_m: string): void { /* both always visible */ }

  setTransformSpace(s: TransformSpace): void {
    this.tcT.setSpace(s); this.tcR.setSpace(s);
  }

  setSnapEnabled(on: boolean): void {
    const t = on ? 0.5 : null;
    const r = on ? THREE.MathUtils.degToRad(15) : null;
    this.tcT.setTranslationSnap(t); this.tcT.setRotationSnap(r);
    this.tcR.setTranslationSnap(t); this.tcR.setRotationSnap(r);
  }

  setBodyVisibility(id: string, v: boolean): void {
    const m = this.meshMap.get(id); if (m) m.visible = v;
    const e = this.edgeMap.get(id); if (e) e.visible = v;
    this._rebuildSnaps();
  }

  focusSelection(): void {
    if (!this.selId) return;
    const mesh = this.meshMap.get(this.selId); if (!mesh) return;
    const box  = new THREE.Box3().setFromObject(mesh);
    const c    = box.getCenter(new THREE.Vector3());
    const sz   = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(c.clone().add(new THREE.Vector3(sz, sz * 0.7, sz)));
    this.orbit.target.copy(c);
  }

  cancelDrag(): void { this._select(null); }

  setTheme(theme: 'light' | 'dark'): void {
    const bg = theme === 'light' ? 0xe8edf3 : 0x0d1117;
    this.scene.background = new THREE.Color(bg);
    (this.scene.fog as THREE.Fog).color.set(bg);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getDocument(): CadDocument { return this.doc; }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerdown', this._onDown);
    this.orbit.dispose();
    this.tcT.dispose();
    this.tcR.dispose();
    this.renderer.dispose();
    this.meshMap.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
  }

  private _loop = (): void => {
    this.frameId = requestAnimationFrame(this._loop);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };
}
