/**
 * TransformGizmo – SpaceClaim / DesignSpark style.
 *
 * Visuals (matching reference images):
 *   · Translate arrows  – cylinder shaft + cone, X=red Y=green Z=blue
 *   · Rotation arcs     – 3/4-circle tube (TorusGeometry with arc < 2π)
 *   · Plane handles     – small transparent squares near hub
 *   · Pull handle       – orange arrow along face normal
 *   · Hub               – gold sphere (like SpaceClaim yellow hub)
 */

import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCALE  = 0.20;       // screen-space size factor
const SL     = 0.76;       // shaft length
const SR     = 0.032;      // shaft radius
const CH     = 0.24;       // cone height
const CR     = 0.078;      // cone radius
const RING_R = 0.72;       // rotation ring radius
const RING_T = 0.032;      // ring tube radius
const RING_ARC = Math.PI * 1.55; // ~270° arc
const PL_SZ  = 0.19;       // plane handle size
const PL_OFF = 0.27;       // plane handle offset from center
const HUB_R  = 0.072;      // hub sphere radius
const PULL_EXTRA = 0.28;   // pull handle offset beyond tip

// ─── Colors ──────────────────────────────────────────────────────────────────
const CX   = new THREE.Color(0xd92020); // red   X
const CY   = new THREE.Color(0x18a018); // green Y
const CZ   = new THREE.Color(0x1a60e0); // blue  Z
const CPULL= new THREE.Color(0xf09010); // orange pull
const CHUB = new THREE.Color(0xe8b830); // gold hub (SpaceClaim yellow)
const PLANE_A = 0.30;

function bright(c: THREE.Color, f = 1.55): THREE.Color {
  return c.clone().multiplyScalar(f).addScalar(0.15);
}

// ─── Types ───────────────────────────────────────────────────────────────────
export type GizmoMode  = 'translate' | 'rotate';
export type GizmoSpace = 'world'     | 'local';
export type HandleId   = 'TX'|'TY'|'TZ'|'PXY'|'PXZ'|'PYZ'|'RX'|'RY'|'RZ'|'PULL';

export interface GizmoDelta {
  translation: THREE.Vector3;
  rotation:    THREE.Quaternion;
  axis:        THREE.Vector3 | null;
}

interface HEntry {
  id:      HandleId;
  meshes:  THREE.Mesh[];
  base:    THREE.Color;
  isPlane: boolean;
}

// ─── Class ───────────────────────────────────────────────────────────────────
export class TransformGizmo {
  readonly root = new THREE.Group();
  private entries:  HEntry[]       = [];
  private hitMesh:  THREE.Mesh[]   = [];

  private _mode:    GizmoMode      = 'translate';
  private _space:   GizmoSpace     = 'world';
  private _hovered: HandleId|null  = null;
  private _active:  HandleId|null  = null;
  private _pullN    = new THREE.Vector3(0,1,0);

  private _dPlane   = new THREE.Plane();
  private _dAxis    = new THREE.Vector3();
  private _dStart   = new THREE.Vector3();

  constructor() {
    this.root.name    = 'TransformGizmo';
    this.root.visible = false;
    this._build();
  }

  // ── Materials ─────────────────────────────────────────────────────────────
  private _mat(col: THREE.Color, opacity = 1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: col.clone(), roughness: 0.22, metalness: 0.18,
      transparent: opacity < 1, opacity,
      depthTest: false, depthWrite: false,
    });
  }

  private _reg(id: HandleId, meshes: THREE.Mesh[], base: THREE.Color, isPlane = false) {
    meshes.forEach(m => {
      m.userData['hid'] = id;
      m.renderOrder     = 1000;
      this.root.add(m);
      this.hitMesh.push(m);
    });
    this.entries.push({ id, meshes, base, isPlane });
  }

  // ── Geometry builders ─────────────────────────────────────────────────────
  private _arrow(dir: THREE.Vector3, col: THREE.Color, id: HandleId) {
    const up = new THREE.Vector3(0,1,0);
    const q  = new THREE.Quaternion().setFromUnitVectors(up, dir);

    // shaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SR, SR * 0.85, SL, 14),
      this._mat(col),
    );
    shaft.position.copy(dir.clone().multiplyScalar(SL/2 + 0.035));
    shaft.quaternion.copy(q);

    // cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(CR, CH, 18),
      this._mat(col),
    );
    cone.position.copy(dir.clone().multiplyScalar(SL + CH/2 + 0.035));
    cone.quaternion.copy(q);

    // invisible hit volume (larger cylinder for easier clicking)
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(SR * 2.8, SR * 2.8, SL + CH, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.copy(dir.clone().multiplyScalar((SL + CH)/2 + 0.035));
    hit.quaternion.copy(q);
    hit.userData['hid'] = id;
    hit.renderOrder     = 1000;
    this.root.add(hit);
    this.hitMesh.push(hit);

    this._reg(id, [shaft, cone], col);
  }

  private _arc(axis: THREE.Vector3, col: THREE.Color, id: HandleId) {
    // 3/4 circle (270°) torus – oriented to face the right plane
    const geo  = new THREE.TorusGeometry(RING_R, RING_T, 10, 56, RING_ARC);
    const torus = new THREE.Mesh(geo, this._mat(col, 0.80));

    // Default torus is in XY plane. Rotate to face correct axis.
    if (Math.abs(axis.x) > 0.5) {
      torus.rotation.y = Math.PI / 2;
      torus.rotation.z = Math.PI / 4; // offset arc start so it looks good
    } else if (Math.abs(axis.z) > 0.5) {
      torus.rotation.x = Math.PI / 2;
      torus.rotation.y = Math.PI / 4;
    } else {
      torus.rotation.z = Math.PI / 4;
    }

    // Larger invisible hit tube
    const hitGeo  = new THREE.TorusGeometry(RING_R, RING_T * 3.5, 6, 56, RING_ARC);
    const hitMesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hitMesh.rotation.copy(torus.rotation);
    hitMesh.userData['hid'] = id;
    hitMesh.renderOrder     = 1000;
    this.root.add(hitMesh);
    this.hitMesh.push(hitMesh);

    this._reg(id, [torus], col);
  }

  private _plane(u: THREE.Vector3, v: THREE.Vector3, col: THREE.Color, id: HandleId) {
    const geo = new THREE.PlaneGeometry(PL_SZ, PL_SZ);
    const mat = this._mat(col, PLANE_A);
    (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(u.clone().add(v).multiplyScalar(PL_OFF));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0,0,1),
      u.clone().cross(v).normalize(),
    );
    // Larger hit plane
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(PL_SZ * 1.6, PL_SZ * 1.6),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    hit.position.copy(mesh.position);
    hit.quaternion.copy(mesh.quaternion);
    hit.userData['hid'] = id;
    hit.renderOrder = 1000;
    this.root.add(hit);
    this.hitMesh.push(hit);

    this._reg(id, [mesh], col, true);
  }

  private _hub() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(HUB_R, 18, 18),
      new THREE.MeshStandardMaterial({
        color: CHUB, roughness: 0.18, metalness: 0.55,
        depthTest: false, depthWrite: false,
        emissive: CHUB.clone().multiplyScalar(0.12),
      }),
    );
    mesh.renderOrder = 1002;
    this.root.add(mesh);
  }

  private _build() {
    const X = new THREE.Vector3(1,0,0);
    const Y = new THREE.Vector3(0,1,0);
    const Z = new THREE.Vector3(0,0,1);

    this._arrow(X, CX, 'TX');
    this._arrow(Y, CY, 'TY');
    this._arrow(Z, CZ, 'TZ');

    this._arc(X, CX, 'RX');
    this._arc(Y, CY, 'RY');
    this._arc(Z, CZ, 'RZ');

    // Plane handles – colored by perpendicular axis (SpaceClaim convention)
    this._plane(X, Y, CZ, 'PXY');
    this._plane(X, Z, CY, 'PXZ');
    this._plane(Y, Z, CX, 'PYZ');

    this._hub();
  }

  // ── Pull handle ───────────────────────────────────────────────────────────
  showPull(normal: THREE.Vector3) {
    this._dropPull();
    this._pullN.copy(normal).normalize();
    const d   = this._pullN;
    const q   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), d);
    const tip = SL + CH + PULL_EXTRA;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(SR*1.3, SR*1.15, SL*0.9, 12),
      this._mat(CPULL),
    );
    shaft.position.copy(d.clone().multiplyScalar(tip - SL*0.45));
    shaft.quaternion.copy(q);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(CR*1.15, CH*1.15, 16),
      this._mat(CPULL),
    );
    cone.position.copy(d.clone().multiplyScalar(tip + CH*0.575));
    cone.quaternion.copy(q);

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(SR*3, SR*3, SL+CH, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.copy(d.clone().multiplyScalar(tip - SL*0.1));
    hit.quaternion.copy(q);
    hit.userData['hid'] = 'PULL';
    hit.renderOrder = 1000;
    this.root.add(hit);
    this.hitMesh.push(hit);

    this._reg('PULL', [shaft, cone], CPULL);
    this._applyMode();
  }

  private _dropPull() {
    this.entries.filter(e => e.id === 'PULL').forEach(e => {
      e.meshes.forEach(m => { this.root.remove(m); m.geometry.dispose(); });
    });
    this.entries  = this.entries.filter(e => e.id !== 'PULL');
    this.hitMesh  = this.hitMesh.filter(m => m.userData['hid'] !== 'PULL');
  }

  hidePull() { this._dropPull(); }

  // ── API ───────────────────────────────────────────────────────────────────
  setMode(mode: GizmoMode)   { this._mode = mode; this._applyMode(); }
  setSpace(sp: GizmoSpace)   { this._space = sp; if (sp==='world') this.root.quaternion.identity(); }
  setPosition(p: THREE.Vector3) { this.root.position.copy(p); this.root.visible = true; }
  setOrientation(q: THREE.Quaternion) { if (this._space==='local') this.root.quaternion.copy(q); }
  hide() { this.root.visible = false; }

  updateScale(cam: THREE.Camera) {
    const d = cam.position.distanceTo(this.root.position);
    this.root.scale.setScalar(Math.max(0.01, d * SCALE));
  }

  hitTest(rc: THREE.Raycaster): HandleId|null {
    const hits = rc.intersectObjects(this.hitMesh, false);
    return hits.length ? (hits[0].object.userData['hid'] as HandleId ?? null) : null;
  }

  setHovered(id: HandleId|null) {
    if (id === this._hovered) return;
    this._hovered = id;
    this._recolor();
  }

  getHitMeshes() { return this.hitMesh; }

  // ── Drag ──────────────────────────────────────────────────────────────────
  startDrag(id: HandleId, ray: THREE.Ray): boolean {
    this._active = id;
    const O = this.root.position;

    if (['TX','TY','TZ','PULL'].includes(id)) {
      this._dAxis.copy(this._wAxis(id));
      const side   = this._dAxis.clone().cross(ray.direction).normalize();
      const planeN = side.cross(this._dAxis).normalize();
      if (planeN.lengthSq() < 0.001) planeN.copy(ray.direction);
      this._dPlane.setFromNormalAndCoplanarPoint(planeN, O);
      ray.intersectPlane(this._dPlane, this._dStart);

    } else if (['PXY','PXZ','PYZ'].includes(id)) {
      const n = this._planeN(id);
      if (this._space==='local') n.applyQuaternion(this.root.quaternion);
      this._dPlane.setFromNormalAndCoplanarPoint(n, O);
      ray.intersectPlane(this._dPlane, this._dStart);

    } else { // RX RY RZ
      this._dAxis.copy(this._wAxis(id));
      this._dPlane.setFromNormalAndCoplanarPoint(this._dAxis, O);
      const hit = new THREE.Vector3();
      ray.intersectPlane(this._dPlane, hit);
      this._dStart.copy(hit.sub(O).normalize());
    }

    this._recolor();
    return true;
  }

  drag(ray: THREE.Ray): GizmoDelta {
    const out: GizmoDelta = { translation: new THREE.Vector3(), rotation: new THREE.Quaternion(), axis: this._dAxis.clone() };
    const id = this._active;
    if (!id) return out;

    if (['TX','TY','TZ','PULL'].includes(id)) {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dPlane, cur)) return out;
      const proj = cur.sub(this._dStart).dot(this._dAxis);
      out.translation.copy(this._dAxis).multiplyScalar(proj);

    } else if (['PXY','PXZ','PYZ'].includes(id)) {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dPlane, cur)) return out;
      out.translation.copy(cur.sub(this._dStart));

    } else {
      const cur = new THREE.Vector3();
      if (!ray.intersectPlane(this._dPlane, cur)) return out;
      const toCur = cur.sub(this.root.position).normalize();
      const angle = Math.atan2(
        this._dAxis.clone().dot(this._dStart.clone().cross(toCur)),
        this._dStart.dot(toCur),
      );
      out.rotation.setFromAxisAngle(this._dAxis, angle);
    }
    return out;
  }

  endDrag(): HandleId|null {
    const id = this._active;
    this._active = null;
    this._recolor();
    return id;
  }

  dispose() { this.entries.forEach(e => e.meshes.forEach(m => m.geometry.dispose())); }

  // ── Internals ─────────────────────────────────────────────────────────────
  private _applyMode() {
    this.entries.forEach(e => {
      const tr = ['TX','TY','TZ','PXY','PXZ','PYZ','PULL'].includes(e.id);
      const ro = ['RX','RY','RZ'].includes(e.id);
      const v  = this._mode === 'translate' ? tr : ro;
      e.meshes.forEach(m => { m.visible = v; });
    });
    // also hide invisible hit meshes for wrong mode
    this.hitMesh.forEach(m => {
      const id = m.userData['hid'] as HandleId;
      if (!id) return;
      const tr = ['TX','TY','TZ','PXY','PXZ','PYZ','PULL'].includes(id);
      const ro = ['RX','RY','RZ'].includes(id);
      m.visible = this._mode === 'translate' ? tr : ro;
    });
  }

  private _recolor() {
    this.entries.forEach(e => {
      const on = e.id === this._hovered || e.id === this._active;
      const c  = on ? bright(e.base) : e.base;
      const op = e.isPlane ? (on ? 0.72 : PLANE_A) : (on ? 1.0 : 0.90);
      e.meshes.forEach(m => {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.color.copy(c);
        mat.opacity = op;
        mat.emissive.copy(c).multiplyScalar(on ? 0.30 : 0);
        mat.needsUpdate = true;
      });
    });
  }

  private _wAxis(id: HandleId): THREE.Vector3 {
    let l: THREE.Vector3;
    switch (id) {
      case 'TX': case 'RX': l = new THREE.Vector3(1,0,0); break;
      case 'TY': case 'RY': l = new THREE.Vector3(0,1,0); break;
      case 'TZ': case 'RZ': l = new THREE.Vector3(0,0,1); break;
      case 'PULL':           l = this._pullN.clone(); break;
      default:               l = new THREE.Vector3(0,1,0);
    }
    if (this._space==='local') l.applyQuaternion(this.root.quaternion);
    return l;
  }

  private _planeN(id: HandleId): THREE.Vector3 {
    if (id==='PXY') return new THREE.Vector3(0,0,1);
    if (id==='PXZ') return new THREE.Vector3(0,1,0);
    return new THREE.Vector3(1,0,0);
  }
}
