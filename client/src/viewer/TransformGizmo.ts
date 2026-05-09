/**
 * TransformGizmo – SpaceClaim / DesignSpark style direct-edit gimbal.
 *
 * Visual elements:
 *   · Translate arrows  (shaft + cone, X=red Y=green Z=blue)
 *   · Plane handles     (transparent squares between axes)
 *   · Rotation rings    (thin torus per axis)
 *   · Pull handle       (orange arrow along face normal, face-select only)
 *   · Central hub       (white sphere)
 *
 * Drag mechanics per handle type:
 *   TX/TY/TZ  → project delta onto axis line (camera-facing drag plane)
 *   PXY/PXZ/PYZ → project delta onto the two-axis plane
 *   RX/RY/RZ  → atan2 angle around axis from drag-start vector
 *   PULL      → project delta onto face normal
 *
 * Size: constant screen-space (rescaled each frame by camera distance).
 */

import * as THREE from 'three';

// ─── Geometry constants ───────────────────────────────────────────────────────
const SCALE_FACTOR  = 0.22;   // gizmo size relative to camera distance
const SHAFT_LEN     = 0.82;
const SHAFT_R       = 0.030;
const CONE_H        = 0.26;
const CONE_R        = 0.072;
const RING_R        = 0.78;
const RING_TUBE     = 0.028;
const PLANE_SIZE    = 0.22;
const PLANE_OFF     = 0.32;
const HUB_R         = 0.068;
const PULL_OFFSET   = 0.30;   // extra distance beyond arrow tip for pull handle

// ─── Colors ──────────────────────────────────────────────────────────────────
const COL = {
  X:     new THREE.Color(0xd93535),
  Y:     new THREE.Color(0x28a828),
  Z:     new THREE.Color(0x2272e8),
  PULL:  new THREE.Color(0xf5a020),
  HUB:   new THREE.Color(0xe8eef5),
  PLANE_ALPHA: 0.28,
};

function hov(c: THREE.Color) { return c.clone().lerp(new THREE.Color(0xffffff), 0.45); }

// ─── Types ───────────────────────────────────────────────────────────────────
export type GizmoMode   = 'translate' | 'rotate';
export type GizmoSpace  = 'world'     | 'local';
export type HandleId    = 'TX'|'TY'|'TZ'|'PXY'|'PXZ'|'PYZ'|'RX'|'RY'|'RZ'|'PULL';

export interface GizmoDelta {
  translation: THREE.Vector3;
  rotation:    THREE.Quaternion;
  axis:        THREE.Vector3 | null;
}

interface HandleEntry {
  id:         HandleId;
  meshes:     THREE.Mesh[];
  base:       THREE.Color;
  isPlane:    boolean;
}

// ─── Class ───────────────────────────────────────────────────────────────────
export class TransformGizmo {
  readonly root = new THREE.Group();
  private entries: HandleEntry[] = [];
  private hitMeshes: THREE.Mesh[] = [];

  private _mode:  GizmoMode  = 'translate';
  private _space: GizmoSpace = 'world';
  private _hovered: HandleId | null = null;
  private _active:  HandleId | null = null;
  private _pullNormal = new THREE.Vector3(0, 1, 0);

  // drag state
  private _dragPlane  = new THREE.Plane();
  private _dragAxis   = new THREE.Vector3();
  private _dragStart  = new THREE.Vector3();
  private _dragRot    = new THREE.Vector3(); // for rotation: start tangent

  // ── Build ──────────────────────────────────────────────────────────────────
  constructor() {
    this.root.name = 'TransformGizmo';
    this.root.visible = false;
    this._build();
  }

  private _mat(color: THREE.Color, opacity = 1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color:       color.clone(),
      roughness:   0.25,
      metalness:   0.15,
      transparent: opacity < 1,
      opacity,
      depthTest:   false,
      depthWrite:  false,
    });
  }

  private _register(id: HandleId, meshes: THREE.Mesh[], base: THREE.Color, isPlane = false) {
    meshes.forEach(m => {
      m.userData['hid'] = id;
      m.renderOrder = 1000;
      this.root.add(m);
      this.hitMeshes.push(m);
    });
    this.entries.push({ id, meshes, base, isPlane });
  }

  private _arrow(dir: THREE.Vector3, col: THREE.Color, id: HandleId) {
    const up = new THREE.Vector3(0, 1, 0);
    const q  = new THREE.Quaternion().setFromUnitVectors(up, dir);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_LEN, 12),
      this._mat(col),
    );
    shaft.position.copy(dir.clone().multiplyScalar(SHAFT_LEN / 2 + 0.04));
    shaft.quaternion.copy(q);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(CONE_R, CONE_H, 16),
      this._mat(col),
    );
    cone.position.copy(dir.clone().multiplyScalar(SHAFT_LEN + CONE_H / 2 + 0.04));
    cone.quaternion.copy(q);

    this._register(id, [shaft, cone], col);
  }

  private _ring(axis: THREE.Vector3, col: THREE.Color, id: HandleId) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_R, RING_TUBE, 8, 72),
      this._mat(col, 0.82),
    );
    if (axis.x > 0.5)      { torus.rotation.y = Math.PI / 2; }
    else if (axis.z > 0.5) { torus.rotation.x = Math.PI / 2; }
    this._register(id, [torus], col);
  }

  private _plane(u: THREE.Vector3, v: THREE.Vector3, col: THREE.Color, id: HandleId) {
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    const mat = this._mat(col, COL.PLANE_ALPHA);
    (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(u.clone().add(v).multiplyScalar(PLANE_OFF));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      u.clone().cross(v).normalize(),
    );
    this._register(id, [mesh], col, true);
  }

  private _build() {
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);

    this._arrow(X, COL.X, 'TX');
    this._arrow(Y, COL.Y, 'TY');
    this._arrow(Z, COL.Z, 'TZ');

    this._ring(X, COL.X, 'RX');
    this._ring(Y, COL.Y, 'RY');
    this._ring(Z, COL.Z, 'RZ');

    // Plane handles: colored by the perpendicular axis (SpaceClaim convention)
    this._plane(X, Y, COL.Z,  'PXY');
    this._plane(X, Z, COL.Y,  'PXZ');
    this._plane(Y, Z, COL.X,  'PYZ');

    // Hub
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(HUB_R, 16, 16),
      new THREE.MeshStandardMaterial({ color: COL.HUB, roughness: 0.2, metalness: 0.5, depthTest: false, depthWrite: false }),
    );
    hub.renderOrder = 1001;
    this.root.add(hub);
  }

  // ── Pull handle (face selection) ──────────────────────────────────────────
  showPull(normal: THREE.Vector3) {
    this._removePull();
    this._pullNormal.copy(normal).normalize();
    const dir = this._pullNormal;
    const q   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const tip = SHAFT_LEN + CONE_H + PULL_OFFSET;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SHAFT_R * 1.25, SHAFT_R * 1.25, SHAFT_LEN * 0.8, 12),
      this._mat(COL.PULL),
    );
    shaft.position.copy(dir.clone().multiplyScalar(tip - SHAFT_LEN * 0.4));
    shaft.quaternion.copy(q);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(CONE_R * 1.15, CONE_H * 1.15, 16),
      this._mat(COL.PULL),
    );
    cone.position.copy(dir.clone().multiplyScalar(tip + CONE_H * 0.575));
    cone.quaternion.copy(q);

    this._register('PULL', [shaft, cone], COL.PULL);
    this._applyMode();
  }

  private _removePull() {
    const pullEntries = this.entries.filter(e => e.id === 'PULL');
    pullEntries.forEach(e => {
      e.meshes.forEach(m => { this.root.remove(m); m.geometry.dispose(); });
    });
    this.entries    = this.entries.filter(e => e.id !== 'PULL');
    this.hitMeshes  = this.hitMeshes.filter(m => m.userData['hid'] !== 'PULL');
  }

  hidePull() { this._removePull(); }

  // ── Public API ────────────────────────────────────────────────────────────
  setMode(mode: GizmoMode) {
    this._mode = mode;
    this._applyMode();
  }

  setSpace(space: GizmoSpace) {
    this._space = space;
    if (space === 'world') this.root.quaternion.identity();
  }

  setPosition(pos: THREE.Vector3) {
    this.root.position.copy(pos);
    this.root.visible = true;
  }

  setOrientation(q: THREE.Quaternion) {
    if (this._space === 'local') this.root.quaternion.copy(q);
    else this.root.quaternion.identity();
  }

  hide() { this.root.visible = false; }

  updateScale(camera: THREE.Camera) {
    const dist  = camera.position.distanceTo(this.root.position);
    const scale = Math.max(0.01, dist * SCALE_FACTOR);
    this.root.scale.setScalar(scale);
  }

  hitTest(rc: THREE.Raycaster): HandleId | null {
    const hits = rc.intersectObjects(this.hitMeshes, false);
    if (!hits.length) return null;
    return (hits[0].object.userData['hid'] as HandleId) ?? null;
  }

  setHovered(id: HandleId | null) {
    if (id === this._hovered) return;
    this._hovered = id;
    this._updateColors();
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  startDrag(id: HandleId, ray: THREE.Ray): boolean {
    this._active = id;
    const origin = this.root.position;

    if (id === 'TX' || id === 'TY' || id === 'TZ' || id === 'PULL') {
      this._dragAxis.copy(this._worldAxis(id));
      // drag plane: perpendicular to axis, facing camera
      const camDir  = ray.direction.clone().normalize();
      const side    = this._dragAxis.clone().cross(camDir);
      const planeN  = side.cross(this._dragAxis).normalize();
      this._dragPlane.setFromNormalAndCoplanarPoint(planeN, origin);
      ray.intersectPlane(this._dragPlane, this._dragStart);

    } else if (id === 'PXY' || id === 'PXZ' || id === 'PYZ') {
      const n = this._planeNormal(id);
      if (this._space === 'local') n.applyQuaternion(this.root.quaternion);
      this._dragPlane.setFromNormalAndCoplanarPoint(n, origin);
      ray.intersectPlane(this._dragPlane, this._dragStart);

    } else if (id === 'RX' || id === 'RY' || id === 'RZ') {
      this._dragAxis.copy(this._worldAxis(id));
      this._dragPlane.setFromNormalAndCoplanarPoint(this._dragAxis, origin);
      const hit = new THREE.Vector3();
      ray.intersectPlane(this._dragPlane, hit);
      this._dragStart.copy(hit.sub(origin).normalize());
    }

    this._updateColors();
    return true;
  }

  drag(ray: THREE.Ray): GizmoDelta {
    const id  = this._active;
    const out: GizmoDelta = {
      translation: new THREE.Vector3(),
      rotation:    new THREE.Quaternion(),
      axis:        this._dragAxis.clone(),
    };
    if (!id) return out;

    if (id === 'TX' || id === 'TY' || id === 'TZ' || id === 'PULL') {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dragPlane, cur)) return out;
      const raw  = cur.clone().sub(this._dragStart);
      const proj = raw.dot(this._dragAxis);
      out.translation.copy(this._dragAxis).multiplyScalar(proj);

    } else if (id === 'PXY' || id === 'PXZ' || id === 'PYZ') {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dragPlane, cur)) return out;
      out.translation.copy(cur.sub(this._dragStart));

    } else if (id === 'RX' || id === 'RY' || id === 'RZ') {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dragPlane, cur)) return out;
      const toCur = cur.clone().sub(this.root.position).normalize();
      const angle = Math.atan2(
        this._dragAxis.clone().dot(this._dragStart.clone().cross(toCur)),
        this._dragStart.dot(toCur),
      );
      out.rotation.setFromAxisAngle(this._dragAxis, angle);
    }

    return out;
  }

  endDrag(): HandleId | null {
    const id = this._active;
    this._active = null;
    this._updateColors();
    return id;
  }

  getHitMeshes() { return this.hitMeshes; }

  // ── Internal ──────────────────────────────────────────────────────────────
  private _applyMode() {
    const isTranslate = this._mode === 'translate';
    this.entries.forEach(e => {
      const isArrow  = ['TX','TY','TZ'].includes(e.id);
      const isPlane  = ['PXY','PXZ','PYZ'].includes(e.id);
      const isRing   = ['RX','RY','RZ'].includes(e.id);
      const isPull   = e.id === 'PULL';
      let vis = false;
      if (isTranslate) vis = isArrow || isPlane || isPull;
      else             vis = isRing;
      e.meshes.forEach(m => { m.visible = vis; });
    });
  }

  private _updateColors() {
    this.entries.forEach(e => {
      const isHov  = e.id === this._hovered;
      const isAct  = e.id === this._active;
      const c      = (isHov || isAct) ? hov(e.base) : e.base;
      const op     = e.isPlane ? (isHov || isAct ? 0.7 : COL.PLANE_ALPHA) : ((isHov || isAct) ? 1.0 : 0.90);
      e.meshes.forEach(m => {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.color.copy(c);
        mat.opacity = op;
        mat.emissive.copy(c).multiplyScalar(isHov || isAct ? 0.25 : 0);
      });
    });
  }

  private _worldAxis(id: HandleId): THREE.Vector3 {
    let local: THREE.Vector3;
    if (id === 'TX' || id === 'RX') local = new THREE.Vector3(1, 0, 0);
    else if (id === 'TY' || id === 'RY') local = new THREE.Vector3(0, 1, 0);
    else if (id === 'TZ' || id === 'RZ') local = new THREE.Vector3(0, 0, 1);
    else if (id === 'PULL') local = this._pullNormal.clone();
    else local = new THREE.Vector3(0, 1, 0);

    if (this._space === 'local') local.applyQuaternion(this.root.quaternion);
    return local;
  }

  private _planeNormal(id: HandleId): THREE.Vector3 {
    if (id === 'PXY') return new THREE.Vector3(0, 0, 1);
    if (id === 'PXZ') return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(1, 0, 0); // PYZ
  }

  dispose() {
    this.entries.forEach(e => e.meshes.forEach(m => m.geometry.dispose()));
  }
}
