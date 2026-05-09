import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DemoCadAdapter } from '../cad/DemoCadAdapter';
import { buildDemoMesh, buildEdgeLines, getMaterial } from '../cad/MeshBuilder';
import { CadDocument } from '../cad/CadDocument';
import type { TransformSpace } from '../app/cadStore';

export interface SceneCallbacks {
  onBodySelected:    (bodyId: string | null, pos: [number, number, number]) => void;
  onFaceSelected?:   (bodyId: string, fi: number, n: THREE.Vector3) => void;
  onTransformCommit: (bodyId: string, mat: number[], pos: THREE.Vector3, rot: THREE.Euler) => void;
  onPositionChange:  (p: [number, number, number]) => void;
  onRotationChange:  (r: [number, number, number]) => void;
}

// ─── Snap ─────────────────────────────────────────────────────────────────────
type SnapType = 'vertex' | 'midpoint' | 'center';
interface SnapPt { p: THREE.Vector3; t: SnapType; }
const SNAP_COL: Record<SnapType, number> = { vertex: 0xffcc00, midpoint: 0x00ccff, center: 0xff8800 };
const SNAP_PX = 30; // screen pixels threshold

function buildSnaps(mesh: THREE.Mesh): SnapPt[] {
  const out: SnapPt[] = [];
  const geo  = mesh.geometry;
  const pos  = geo.attributes['position'] as THREE.BufferAttribute;
  const idx  = geo.index;
  if (!pos) return out;

  const seen = new Set<string>();
  const key  = (v: THREE.Vector3) => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const add  = (v: THREE.Vector3, t: SnapType) => {
    const k = key(v);
    if (!seen.has(k)) { seen.add(k); out.push({ p: v.clone(), t }); }
  };

  const count = idx ? idx.count : pos.count;
  const wv: THREE.Vector3[] = [];

  // Vertices
  for (let i = 0; i < count; i++) {
    const vi = idx ? idx.getX(i) : i;
    const v  = new THREE.Vector3().fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
    add(v, 'vertex');
    wv.push(v);
  }

  // Edge midpoints + face centers
  for (let i = 0; i < count; i += 3) {
    const a = wv[i], b = wv[i + 1], c = wv[i + 2];
    if (!a || !b || !c) continue;
    add(a.clone().add(b).multiplyScalar(0.5), 'midpoint');
    add(b.clone().add(c).multiplyScalar(0.5), 'midpoint');
    add(c.clone().add(a).multiplyScalar(0.5), 'midpoint');
    add(a.clone().add(b).add(c).divideScalar(3), 'center');
  }

  return out;
}

// ─── Class ────────────────────────────────────────────────────────────────────
export class ViewerScene {
  private renderer: THREE.WebGLRenderer;
  private scene:    THREE.Scene;
  private camera:   THREE.PerspectiveCamera;
  private orbit:    OrbitControls;
  private tcT:      TransformControls; // translate
  private tcR:      TransformControls; // rotate
  private anchor:   THREE.Object3D;   // gizmo pivot

  private meshMap = new Map<string, THREE.Mesh>();
  private edgeMap = new Map<string, THREE.LineSegments>();
  private doc:     CadDocument;
  private cbs:     SceneCallbacks;
  private selId:   string | null = null;
  private frameId  = 0;

  // drag state
  private mat0: THREE.Matrix4 | null = null;
  private sel0: THREE.Matrix4 | null = null;

  // snap
  private snaps:      SnapPt[] = [];
  private snapDot:    THREE.Mesh;
  private snapRing:   THREE.Mesh;
  private snapActive: SnapPt | null = null;
  private pivotMode   = false;
  private pivotBanner: HTMLDivElement;

  // ── Constructor ─────────────────────────────────────────────────────────────
  constructor(canvas: HTMLCanvasElement, cbs: SceneCallbacks) {
    this.cbs = cbs;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8edf3);
    this.scene.fog = new THREE.Fog(0xe8edf3, 40, 100);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(8, 6, 10);
    this.camera.lookAt(0, 0, 0);

    // Lights
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

    // Grid + axes
    const grid = new THREE.GridHelper(20, 40, 0xa0a8b8, 0xc0c8d4);
    grid.position.y = -0.21;
    this.scene.add(grid);
    const ax = new THREE.AxesHelper(2);
    ax.position.set(-8, 0, -6);
    this.scene.add(ax);

    // Orbit
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 1;
    this.orbit.maxDistance = 80;

    // Anchor
    this.anchor = new THREE.Object3D();
    this.scene.add(this.anchor);

    // Translate gizmo
    this.tcT = new TransformControls(this.camera, canvas);
    this.tcT.setMode('translate');
    this.tcT.attach(this.anchor);
    this.tcT.getHelper().visible = false;
    this.scene.add(this.tcT.getHelper());

    // Rotate gizmo
    this.tcR = new TransformControls(this.camera, canvas);
    this.tcR.setMode('rotate');
    this.tcR.attach(this.anchor);
    this.tcR.getHelper().visible = false;
    this.scene.add(this.tcR.getHelper());

    this._bindTC(this.tcT, this.tcR);
    this._bindTC(this.tcR, this.tcT);

    // Snap dot
    this.snapDot = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false, transparent: true, opacity: 0 }),
    );
    this.snapDot.renderOrder = 999;
    this.scene.add(this.snapDot);

    // Snap ring
    this.snapRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.25, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, depthTest: false, transparent: true, opacity: 0 }),
    );
    this.snapRing.renderOrder = 998;
    this.scene.add(this.snapRing);

    // Pivot banner
    this.pivotBanner = document.createElement('div');
    Object.assign(this.pivotBanner.style, {
      position: 'absolute', bottom: '44px', left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(240,160,0,0.95)', color: '#1a0e00',
      padding: '4px 16px', borderRadius: '5px',
      fontSize: '11px', fontFamily: 'system-ui,sans-serif',
      fontWeight: '600', display: 'none', pointerEvents: 'none',
      zIndex: '20', whiteSpace: 'nowrap',
    });
    this.pivotBanner.textContent = 'Pivot-Modus — Fangpunkt anklicken  ·  Esc = Abbrechen';
    canvas.parentElement?.appendChild(this.pivotBanner);

    // Events
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerdown', this._onDown, true); // capture to beat TC

    // Demo scene
    const adapter = new DemoCadAdapter();
    this.doc = adapter.createDemoDocument();
    for (const body of this.doc.bodies) {
      const mesh  = buildDemoMesh(body);
      const edges = buildEdgeLines(mesh);
      this.scene.add(mesh); this.scene.add(edges);
      this.meshMap.set(body.id, mesh);
      this.edgeMap.set(body.id, edges);
    }

    this._loop();
  }

  // ── TransformControls event binding ─────────────────────────────────────────
  private _bindTC(tc: TransformControls, other: TransformControls) {
    tc.addEventListener('dragging-changed', (e) => {
      const on = (e as unknown as { value: boolean }).value;
      this.orbit.enabled = !on;
      other.enabled = !on;
    });

    tc.addEventListener('mouseDown', () => {
      this.mat0 = this.anchor.matrixWorld.clone();
      const m   = this.selId ? this.meshMap.get(this.selId) : null;
      this.sel0 = m ? m.matrixWorld.clone() : null;
    });

    tc.addEventListener('objectChange', () => {
      if (!this.mat0 || !this.sel0 || !this.selId) return;
      const mesh  = this.meshMap.get(this.selId);
      const edges = this.edgeMap.get(this.selId);
      if (!mesh) return;

      const delta = this.anchor.matrixWorld.clone().multiply(this.mat0.clone().invert());
      mesh.matrix.copy(delta.multiply(this.sel0));
      mesh.matrixAutoUpdate = false;
      mesh.updateWorldMatrix(false, false);
      if (edges) {
        edges.position.setFromMatrixPosition(mesh.matrix);
        edges.rotation.setFromRotationMatrix(mesh.matrix);
      }

      const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrix);
      const r = new THREE.Euler().setFromRotationMatrix(mesh.matrix);
      this.cbs.onPositionChange([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
      this.cbs.onRotationChange([
        +THREE.MathUtils.radToDeg(r.x).toFixed(2),
        +THREE.MathUtils.radToDeg(r.y).toFixed(2),
        +THREE.MathUtils.radToDeg(r.z).toFixed(2),
      ]);
    });

    tc.addEventListener('mouseUp', () => {
      if (!this.selId || !this.mat0) return;
      const delta = this.anchor.matrixWorld.clone().multiply(this.mat0.clone().invert());
      const mesh  = this.meshMap.get(this.selId);
      const p = mesh ? new THREE.Vector3().setFromMatrixPosition(mesh.matrix) : new THREE.Vector3();
      const r = mesh ? new THREE.Euler().setFromRotationMatrix(mesh.matrix)   : new THREE.Euler();
      this.cbs.onTransformCommit(this.selId, delta.toArray(), p, r);
      this.mat0 = this.sel0 = null;
    });
  }

  // ── Pointer events ───────────────────────────────────────────────────────────
  private _ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width)  *  2 - 1,
      ((e.clientY - r.top)  / r.height) * -2 + 1,
    );
  }

  private _screenXY(e: PointerEvent): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private _onMove = (e: PointerEvent) => {
    if (!this.selId) return;
    const [sx, sy] = this._screenXY(e);
    this._updateSnap(sx, sy);
  };

  private _onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;

    // Pivot mode: place anchor at snap point
    if (this.pivotMode) {
      e.stopPropagation();
      if (this.snapActive) {
        this.anchor.position.copy(this.snapActive.p);
        this.anchor.updateMatrixWorld(true);
      }
      this._exitPivot();
      return;
    }

    // Don't intercept if TC is already active
    if (this.tcT.dragging || this.tcR.dragging) return;

    // Body selection
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this._ndc(e), this.camera);
    const hits = rc.intersectObjects([...this.meshMap.values()], false);
    if (hits.length) {
      const id = hits[0].object.userData['bodyId'] as string | undefined;
      if (id) { this._select(id); return; }
    }
    this._select(null);
  };

  // ── Selection ────────────────────────────────────────────────────────────────
  private _select(id: string | null) {
    if (this.selId) {
      const m = this.meshMap.get(this.selId);
      if (m) (m.material as THREE.MeshStandardMaterial).copy(getMaterial(false));
    }
    this.selId = id;
    this.snaps = [];
    this._hideSnap();

    if (id) {
      const mesh = this.meshMap.get(id);
      if (!mesh) return;
      (mesh.material as THREE.MeshStandardMaterial).copy(getMaterial(true));
      const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      this.anchor.position.copy(center);
      this.anchor.updateMatrixWorld(true);
      this.tcT.getHelper().visible = true;
      this.tcR.getHelper().visible = true;
      const p = mesh.position;
      this.cbs.onBodySelected(id, [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
    } else {
      this.tcT.getHelper().visible = false;
      this.tcR.getHelper().visible = false;
      if (this.pivotMode) this._exitPivot();
      this.cbs.onBodySelected(null, [0, 0, 0]);
    }
  }

  // ── Snap ─────────────────────────────────────────────────────────────────────
  private _buildSnaps() {
    if (this.snaps.length || !this.selId) return;
    const mesh = this.meshMap.get(this.selId);
    if (mesh) this.snaps = buildSnaps(mesh);
  }

  private _toScreen(world: THREE.Vector3): [number, number] {
    const v  = world.clone().project(this.camera);
    const el = this.renderer.domElement;
    return [(v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight];
  }

  private _updateSnap(sx: number, sy: number) {
    this._buildSnaps();
    let best: SnapPt | null = null;
    let bestD = SNAP_PX;
    for (const sp of this.snaps) {
      const [px, py] = this._toScreen(sp.p);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestD) { bestD = d; best = sp; }
    }
    this.snapActive = best;

    const dotMat  = this.snapDot.material  as THREE.MeshBasicMaterial;
    const ringMat = this.snapRing.material as THREE.MeshBasicMaterial;

    if (best) {
      const col = new THREE.Color(SNAP_COL[best.t]);
      dotMat.color.copy(col);   dotMat.opacity  = 0.95;
      ringMat.color.copy(col);  ringMat.opacity = 0.70;
      this.snapDot.position.copy(best.p);
      this.snapRing.position.copy(best.p);
      this.snapRing.quaternion.copy(this.camera.quaternion);
      const s = this.camera.position.distanceTo(best.p) * 0.04;
      this.snapDot.scale.setScalar(s);
      this.snapRing.scale.setScalar(s);
    } else {
      this._hideSnap();
    }
  }

  private _hideSnap() {
    (this.snapDot.material  as THREE.MeshBasicMaterial).opacity = 0;
    (this.snapRing.material as THREE.MeshBasicMaterial).opacity = 0;
    this.snapActive = null;
  }

  // ── Pivot mode ───────────────────────────────────────────────────────────────
  startPivotMode() {
    if (!this.selId) return;
    this.pivotMode = true;
    this.orbit.enabled = false;
    this.tcT.enabled   = false;
    this.tcR.enabled   = false;
    this.pivotBanner.style.display = 'block';
    this.renderer.domElement.style.cursor = 'crosshair';
    this._buildSnaps();
  }

  private _exitPivot() {
    this.pivotMode = false;
    this.orbit.enabled = true;
    this.tcT.enabled   = true;
    this.tcR.enabled   = true;
    this.pivotBanner.style.display = 'none';
    this.renderer.domElement.style.cursor = '';
    this._hideSnap();
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  setTransformMode(_m: string) { /* both always visible */ }

  setTransformSpace(s: TransformSpace) {
    this.tcT.setSpace(s);
    this.tcR.setSpace(s);
  }

  setSnapEnabled(on: boolean) {
    const t = on ? 0.5 : null;
    const r = on ? THREE.MathUtils.degToRad(15) : null;
    this.tcT.setTranslationSnap(t); this.tcT.setRotationSnap(r);
    this.tcR.setTranslationSnap(t); this.tcR.setRotationSnap(r);
  }

  setBodyVisibility(id: string, v: boolean) {
    const m = this.meshMap.get(id); if (m) m.visible = v;
    const e = this.edgeMap.get(id); if (e) e.visible = v;
  }

  focusSelection() {
    if (!this.selId) return;
    const mesh = this.meshMap.get(this.selId); if (!mesh) return;
    const box  = new THREE.Box3().setFromObject(mesh);
    const c    = box.getCenter(new THREE.Vector3());
    const sz   = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(c.clone().add(new THREE.Vector3(sz, sz * 0.7, sz)));
    this.orbit.target.copy(c);
  }

  cancelDrag() {
    if (this.pivotMode) { this._exitPivot(); return; }
    this._select(null);
  }

  setTheme(theme: 'light' | 'dark') {
    const bg = theme === 'light' ? 0xe8edf3 : 0x0d1117;
    this.scene.background = new THREE.Color(bg);
    (this.scene.fog as THREE.Fog).color.set(bg);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getDocument() { return this.doc; }

  dispose() {
    cancelAnimationFrame(this.frameId);
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerdown', this._onDown, true);
    this.pivotBanner.remove();
    this.orbit.dispose();
    this.tcT.dispose();
    this.tcR.dispose();
    this.renderer.dispose();
    this.meshMap.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
  }

  private _loop = () => {
    this.frameId = requestAnimationFrame(this._loop);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };
}
