import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DemoCadAdapter } from '../cad/DemoCadAdapter';
import { buildDemoMesh } from '../cad/MeshBuilder';
import { CadDocument } from '../cad/CadDocument';
import { TransformGizmo, GizmoDelta, HandleId } from './TransformGizmo';
import type { TransformMode, TransformSpace } from '../app/cadStore';

export interface SceneCallbacks {
  onBodySelected:    (bodyId: string | null, position: [number, number, number]) => void;
  onFaceSelected:    (bodyId: string, faceIndex: number, normal: THREE.Vector3) => void;
  onTransformCommit: (bodyId: string, matrix: number[], pos: THREE.Vector3, rot: THREE.Euler) => void;
  onPositionChange:  (p: [number, number, number]) => void;
  onRotationChange:  (r: [number, number, number]) => void;
}

const MAT_DEFAULT  = () => new THREE.MeshStandardMaterial({ color: 0xb8c8d8, roughness: 0.45, metalness: 0.25 });
const MAT_SELECTED = () => new THREE.MeshStandardMaterial({ color: 0x6aaad4, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.92 });
const MAT_FACE_HL  = () => new THREE.MeshStandardMaterial({ color: 0x3a80cc, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.65, emissive: new THREE.Color(0x1a4488), emissiveIntensity: 0.3, side: THREE.DoubleSide, depthTest: true });
const MAT_EDGE     = () => new THREE.LineBasicMaterial({ color: 0x6080a0 });
const MAT_EDGE_SEL = () => new THREE.LineBasicMaterial({ color: 0xf0a040 });

interface BodyEntry {
  bodyId: string;
  mesh:   THREE.Mesh;
  edges:  THREE.LineSegments;
  matDef: THREE.MeshStandardMaterial;
  matSel: THREE.MeshStandardMaterial;
}

export class ViewerScene {
  private renderer:  THREE.WebGLRenderer;
  private scene:     THREE.Scene;
  private camera:    THREE.PerspectiveCamera;
  private orbit:     OrbitControls;
  private gizmo:     TransformGizmo;
  private rc       = new THREE.Raycaster();
  private ptr      = new THREE.Vector2();

  private bodyMap: Map<string, BodyEntry> = new Map();
  private cadDoc:  CadDocument;
  private cbs:     SceneCallbacks;

  private selBodyId: string | null = null;
  private faceHL:    THREE.Mesh | null = null;

  private dragging    = false;
  private dragHandle: HandleId | null = null;
  private bodyMat0    = new THREE.Matrix4();
  private gizmoPos0   = new THREE.Vector3();

  private frameId = 0;

  constructor(canvas: HTMLCanvasElement, cbs: SceneCallbacks) {
    this.cbs = cbs;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8edf3);
    this.scene.fog = new THREE.Fog(0xe8edf3, 50, 120);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.01, 500);
    this.camera.position.set(9, 7, 11);
    this.camera.lookAt(0, 1.5, 0);

    this._lights();
    this._grid();

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.07;
    this.orbit.minDistance = 0.5;
    this.orbit.maxDistance = 200;
    this.orbit.target.set(0, 1.5, 0);

    this.gizmo = new TransformGizmo();
    this.scene.add(this.gizmo.root);

    const adapter = new DemoCadAdapter();
    this.cadDoc = adapter.createDemoDocument();
    this._loadBodies();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointerup',   this._up);

    this._loop();
  }

  private _lights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.60));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(8, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 80;
    key.shadow.camera.left = key.shadow.camera.bottom = -14;
    key.shadow.camera.right = key.shadow.camera.top = 14;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d8e8, 0.45);
    fill.position.set(-6, 5, -4);
    this.scene.add(fill);
  }

  private _grid() {
    const grid = new THREE.GridHelper(30, 60, 0xa0a8b8, 0xc0c8d4);
    grid.position.y = -0.01;
    this.scene.add(grid);
    const ax = new THREE.AxesHelper(1.8);
    ax.position.set(-10, 0.02, -8);
    this.scene.add(ax);
  }

  private _loadBodies() {
    for (const body of this.cadDoc.bodies) {
      const mesh = buildDemoMesh(body);
      const matDef = MAT_DEFAULT();
      const matSel = MAT_SELECTED();
      mesh.material = matDef;
      mesh.castShadow = mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 15), MAT_EDGE());
      edges.position.copy(mesh.position);
      this.scene.add(mesh);
      this.scene.add(edges);
      this.bodyMap.set(body.id, { bodyId: body.id, mesh, edges, matDef, matSel });
    }
  }

  private _ndc(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width)  *  2 - 1,
      ((e.clientY - r.top)  / r.height) * -2 + 1,
    );
  }

  private _move = (e: PointerEvent) => {
    this.ptr.copy(this._ndc(e));
    this.rc.setFromCamera(this.ptr, this.camera);

    if (this.dragging && this.dragHandle) {
      e.preventDefault();
      const delta = this.gizmo.drag(this.rc.ray);
      this._previewDelta(delta);
      return;
    }

    if (this.gizmo.root.visible) {
      const h = this.gizmo.hitTest(this.rc);
      this.gizmo.setHovered(h);
    }
  };

  private _down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.ptr.copy(this._ndc(e));
    this.rc.setFromCamera(this.ptr, this.camera);

    // Gizmo hit?
    if (this.gizmo.root.visible) {
      const h = this.gizmo.hitTest(this.rc);
      if (h) {
        this.orbit.enabled = false;
        this.dragging      = true;
        this.dragHandle    = h;
        const entry = this.bodyMap.get(this.selBodyId ?? '');
        if (entry) this.bodyMat0.copy(entry.mesh.matrixWorld);
        this.gizmoPos0.copy(this.gizmo.root.position);
        this.gizmo.startDrag(h, this.rc.ray);
        this.renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Body / face hit?
    const meshes = [...this.bodyMap.values()].map(e => e.mesh);
    const hits   = this.rc.intersectObjects(meshes, false);
    if (hits.length) {
      const hit    = hits[0];
      const bodyId = hit.object.userData['bodyId'] as string;
      const fi     = hit.faceIndex ?? 0;
      const fn     = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);

      if (bodyId !== this.selBodyId) this._selectBody(bodyId);
      this._selectFace(bodyId, fi, fn);
    } else {
      this._deselect();
    }
  };

  private _up = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.orbit.enabled = true;
    this.gizmo.endDrag();
    this.renderer.domElement.releasePointerCapture(e.pointerId);

    if (this.dragHandle && this.selBodyId) {
      const entry = this.bodyMap.get(this.selBodyId);
      if (entry) {
        entry.mesh.matrixAutoUpdate = true;
        const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        entry.mesh.matrix.decompose(pos, q, sc);
        const rot = new THREE.Euler().setFromQuaternion(q);
        const delta = entry.mesh.matrixWorld.clone().multiply(this.bodyMat0.clone().invert());
        this.cbs.onTransformCommit(this.selBodyId, delta.toArray(), pos, rot);
        this._syncEdges(entry);
      }
    }
    this.dragHandle = null;
  };

  private _selectBody(bodyId: string) {
    if (this.selBodyId && this.selBodyId !== bodyId) {
      const prev = this.bodyMap.get(this.selBodyId);
      if (prev) { prev.mesh.material = prev.matDef; prev.edges.material = MAT_EDGE(); }
    }
    this.selBodyId = bodyId;
    const e = this.bodyMap.get(bodyId);
    if (!e) return;
    e.mesh.material = e.matSel;
    e.edges.material = MAT_EDGE_SEL();
    const box = new THREE.Box3().setFromObject(e.mesh);
    const c   = box.getCenter(new THREE.Vector3());
    this.gizmo.setPosition(c);
    this.gizmo.hidePull();
    const p = e.mesh.position;
    this.cbs.onBodySelected(bodyId, [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
  }

  private _selectFace(bodyId: string, fi: number, normal: THREE.Vector3) {
    this._clearFaceHL();
    const e = this.bodyMap.get(bodyId);
    if (!e) return;

    // Build coplanar face highlight
    const geo  = e.mesh.geometry;
    const posA = geo.attributes['position'] as THREE.BufferAttribute;
    const idx  = geo.index;
    if (!posA) return;

    const localN = normal.clone().transformDirection(e.mesh.matrixWorld.clone().invert());
    const verts: number[] = [];
    const count = idx ? idx.count : posA.count;

    for (let i = 0; i < count; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i+1) : i+1;
      const c = idx ? idx.getX(i+2) : i+2;
      const vA = new THREE.Vector3().fromBufferAttribute(posA, a);
      const vB = new THREE.Vector3().fromBufferAttribute(posA, b);
      const vC = new THREE.Vector3().fromBufferAttribute(posA, c);
      const fn = new THREE.Triangle(vA,vB,vC).getNormal(new THREE.Vector3());
      if (fn.dot(localN) > 0.99) {
        const wA = vA.applyMatrix4(e.mesh.matrixWorld);
        const wB = vB.applyMatrix4(e.mesh.matrixWorld);
        const wC = vC.applyMatrix4(e.mesh.matrixWorld);
        verts.push(wA.x,wA.y,wA.z, wB.x,wB.y,wB.z, wC.x,wC.y,wC.z);
      }
    }

    if (verts.length) {
      const fGeo = new THREE.BufferGeometry();
      fGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      fGeo.computeVertexNormals();
      this.faceHL = new THREE.Mesh(fGeo, MAT_FACE_HL());
      this.faceHL.renderOrder = 500;
      this.scene.add(this.faceHL);
    }

    // Gizmo at face centroid
    const triVerts = verts.slice(0, 9);
    if (triVerts.length >= 9) {
      const cx = (triVerts[0]+triVerts[3]+triVerts[6])/3;
      const cy = (triVerts[1]+triVerts[4]+triVerts[7])/3;
      const cz = (triVerts[2]+triVerts[5]+triVerts[8])/3;
      this.gizmo.setPosition(new THREE.Vector3(cx,cy,cz));
    }
    // Pull handle deaktiviert (Sprint 2: Face-Pull via OpenCascade)
    this.cbs.onFaceSelected(bodyId, fi, normal);
  }

  private _clearFaceHL() {
    if (this.faceHL) {
      this.scene.remove(this.faceHL);
      this.faceHL.geometry.dispose();
      this.faceHL = null;
    }
  }

  private _deselect() {
    if (this.selBodyId) {
      const e = this.bodyMap.get(this.selBodyId);
      if (e) { e.mesh.material = e.matDef; e.edges.material = MAT_EDGE(); }
    }
    this._clearFaceHL();
    this.selBodyId = null;
    this.gizmo.hide();
    this.gizmo.hidePull();
    this.cbs.onBodySelected(null, [0,0,0]);
  }

  private _previewDelta(delta: GizmoDelta) {
    if (!this.selBodyId) return;
    const e = this.bodyMap.get(this.selBodyId);
    if (!e) return;

    e.mesh.matrixAutoUpdate = false;
    const isRot = delta.rotation.x !== 0 || delta.rotation.y !== 0 || delta.rotation.z !== 0 || delta.rotation.w !== 1;

    if (isRot) {
      const pivot  = this.gizmoPos0;
      const rotMat = new THREE.Matrix4().makeRotationFromQuaternion(delta.rotation);
      const tp     = new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z);
      const tpBack = new THREE.Matrix4().makeTranslation( pivot.x, pivot.y, pivot.z);
      e.mesh.matrix.copy(this.bodyMat0).premultiply(tp).premultiply(rotMat).premultiply(tpBack);
    } else {
      const t = new THREE.Matrix4().makeTranslation(delta.translation.x, delta.translation.y, delta.translation.z);
      e.mesh.matrix.copy(this.bodyMat0).premultiply(t);
      this.gizmo.root.position.copy(this.gizmoPos0).add(delta.translation);
    }

    e.mesh.matrixWorldNeedsUpdate = true;
    this._syncEdges(e);

    const pos = new THREE.Vector3().setFromMatrixPosition(e.mesh.matrix);
    const q   = new THREE.Quaternion().setFromRotationMatrix(e.mesh.matrix);
    const rot = new THREE.Euler().setFromQuaternion(q);
    this.cbs.onPositionChange([+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)]);
    this.cbs.onRotationChange([
      +THREE.MathUtils.radToDeg(rot.x).toFixed(2),
      +THREE.MathUtils.radToDeg(rot.y).toFixed(2),
      +THREE.MathUtils.radToDeg(rot.z).toFixed(2),
    ]);
  }

  private _syncEdges(e: BodyEntry) {
    e.edges.matrix.copy(e.mesh.matrix);
    e.edges.matrixAutoUpdate = false;
    e.edges.matrixWorldNeedsUpdate = true;
  }

  setTransformMode(mode: TransformMode) { this.gizmo.setMode(mode); }
  setTransformSpace(s: TransformSpace)  { this.gizmo.setSpace(s); }
  setSnapEnabled(_v: boolean) { /* Sprint 1.6 */ }

  setBodyVisibility(id: string, v: boolean) {
    const e = this.bodyMap.get(id);
    if (e) { e.mesh.visible = v; e.edges.visible = v; }
  }

  focusSelection() {
    if (!this.selBodyId) return;
    const e = this.bodyMap.get(this.selBodyId);
    if (!e) return;
    const box = new THREE.Box3().setFromObject(e.mesh);
    const c   = box.getCenter(new THREE.Vector3());
    const sz  = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(c.clone().add(new THREE.Vector3(sz, sz*0.7, sz)));
    this.orbit.target.copy(c);
  }

  cancelDrag() {
    if (this.dragging) {
      const e = this.selBodyId ? this.bodyMap.get(this.selBodyId) : null;
      if (e) { e.mesh.matrix.copy(this.bodyMat0); e.mesh.matrixAutoUpdate = true; e.mesh.matrixWorldNeedsUpdate = true; this._syncEdges(e); }
      this.dragging = false;
      this.orbit.enabled = true;
      this.gizmo.endDrag();
    }
    this._deselect();
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

  getDocument() { return this.cadDoc; }

  dispose() {
    cancelAnimationFrame(this.frameId);
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerdown', this._down);
    el.removeEventListener('pointerup',   this._up);
    this.orbit.dispose();
    this.gizmo.dispose();
    this.renderer.dispose();
  }

  private _loop = () => {
    this.frameId = requestAnimationFrame(this._loop);
    this.orbit.update();
    if (this.gizmo.root.visible) this.gizmo.updateScale(this.camera);
    this.renderer.render(this.scene, this.camera);
  };
}
