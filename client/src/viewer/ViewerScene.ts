import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DemoCadAdapter } from '../cad/DemoCadAdapter';
import { buildDemoMesh, buildEdgeLines, getMaterial } from '../cad/MeshBuilder';
import { CadDocument } from '../cad/CadDocument';
import { CadBody } from '../cad/CadTypes';
import type { TransformMode, TransformSpace } from '../app/cadStore';

export interface SceneCallbacks {
  onBodySelected: (bodyId: string | null, position: [number, number, number]) => void;
  onFaceSelected?: (bodyId: string, faceIndex: number, normal: THREE.Vector3) => void;
  onTransformCommit: (bodyId: string, matrix: number[], position: THREE.Vector3, rotation: THREE.Euler) => void;
  onPositionChange: (p: [number, number, number]) => void;
  onRotationChange: (r: [number, number, number]) => void;
}

export class ViewerScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private transformControls: TransformControls;
  private gizmoTarget: THREE.Object3D;
  private meshMap = new Map<string, THREE.Mesh>();
  private edgeMap = new Map<string, THREE.LineSegments>();
  private cadDocument: CadDocument;
  private selectedBodyId: string | null = null;
  private animFrameId = 0;
  private callbacks: SceneCallbacks;
  private dragStartMatrix: THREE.Matrix4 | null = null;
  private selectedStartMatrix: THREE.Matrix4 | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks) {
    this.callbacks = callbacks;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e2228);
    this.scene.fog = new THREE.Fog(0x1e2228, 40, 100);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(8, 6, 10);
    this.camera.lookAt(0, 0, 0);

    // Lights
    this.setupLights();

    // Grid
    const grid = new THREE.GridHelper(20, 40, 0xa0a8b8, 0xc0c8d4);
    grid.position.y = -0.21;
    this.scene.add(grid);

    // Axes
    const axes = new THREE.AxesHelper(2);
    axes.position.set(-8, 0, -6);
    this.scene.add(axes);

    // Controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 80;

    // Gizmo target (invisible anchor for TransformControls)
    this.gizmoTarget = new THREE.Object3D();
    this.scene.add(this.gizmoTarget);

    // TransformControls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.attach(this.gizmoTarget);
    this.transformControls.getHelper().visible = false;
    this.scene.add(this.transformControls.getHelper());

    this.setupTransformEvents();

    // Demo document
    const adapter = new DemoCadAdapter();
    this.cadDocument = adapter.createDemoDocument();
    this.loadDemoGeometry();

    // Click handler
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

    this.animate();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8ab4d4, 0.5);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffeedd, 0.3);
    rim.position.set(0, -4, -8);
    this.scene.add(rim);
  }

  private loadDemoGeometry(): void {
    for (const body of this.cadDocument.bodies) {
      const mesh = buildDemoMesh(body);
      const edges = buildEdgeLines(mesh);
      this.scene.add(mesh);
      this.scene.add(edges);
      this.meshMap.set(body.id, mesh);
      this.edgeMap.set(body.id, edges);
    }
  }

  private setupTransformEvents(): void {
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !(event as unknown as { value: boolean }).value;
    });

    this.transformControls.addEventListener('mouseDown', () => {
      this.dragStartMatrix = this.gizmoTarget.matrixWorld.clone();
      const mesh = this.selectedBodyId ? this.meshMap.get(this.selectedBodyId) : null;
      this.selectedStartMatrix = mesh ? mesh.matrixWorld.clone() : null;
    });

    this.transformControls.addEventListener('objectChange', () => {
      if (!this.dragStartMatrix || !this.selectedStartMatrix || !this.selectedBodyId) return;
      const mesh = this.meshMap.get(this.selectedBodyId);
      const edges = this.edgeMap.get(this.selectedBodyId);
      if (!mesh) return;

      const delta = this.gizmoTarget.matrixWorld
        .clone()
        .multiply(this.dragStartMatrix.clone().invert());

      mesh.matrix.copy(delta.clone().multiply(this.selectedStartMatrix));
      mesh.matrixAutoUpdate = false;
      mesh.updateWorldMatrix(false, false);

      if (edges) {
        edges.position.setFromMatrixPosition(mesh.matrix);
        edges.rotation.setFromRotationMatrix(mesh.matrix);
      }

      const pos = new THREE.Vector3();
      const rot = new THREE.Euler();
      pos.setFromMatrixPosition(mesh.matrix);
      rot.setFromRotationMatrix(mesh.matrix);

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

    this.transformControls.addEventListener('mouseUp', () => {
      if (!this.selectedBodyId || !this.dragStartMatrix) return;

      const delta = this.gizmoTarget.matrixWorld
        .clone()
        .multiply(this.dragStartMatrix.clone().invert());

      const mesh = this.meshMap.get(this.selectedBodyId);
      const pos = mesh ? new THREE.Vector3().setFromMatrixPosition(mesh.matrix) : new THREE.Vector3();
      const rot = mesh ? new THREE.Euler().setFromRotationMatrix(mesh.matrix) : new THREE.Euler();

      this.callbacks.onTransformCommit(this.selectedBodyId, delta.toArray(), pos, rot);
      this.dragStartMatrix = null;
      this.selectedStartMatrix = null;
    });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.transformControls.dragging) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);

    const meshes = Array.from(this.meshMap.values());
    const hits = raycaster.intersectObjects(meshes, false);

    if (hits.length > 0) {
      const hit = hits[0];
      const bodyId = hit.object.userData['bodyId'] as string | undefined;
      if (bodyId) {
        this.selectBody(bodyId);
        return;
      }
    }

    // Clicked on empty space → deselect
    this.selectBody(null);
  };

  selectBody(bodyId: string | null): void {
    // Reset previous selection material
    if (this.selectedBodyId) {
      const prev = this.meshMap.get(this.selectedBodyId);
      if (prev) {
        (prev.material as THREE.MeshStandardMaterial).copy(getMaterial(false));
      }
    }

    this.selectedBodyId = bodyId;

    if (bodyId) {
      const mesh = this.meshMap.get(bodyId);
      if (mesh) {
        (mesh.material as THREE.MeshStandardMaterial).copy(getMaterial(true));

        // Position gizmoTarget at bounding box center
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        this.gizmoTarget.position.copy(center);
        this.gizmoTarget.updateMatrixWorld(true);

        this.transformControls.getHelper().visible = true;

        const pos = mesh.position;
        this.callbacks.onBodySelected(bodyId, [
          parseFloat(pos.x.toFixed(3)),
          parseFloat(pos.y.toFixed(3)),
          parseFloat(pos.z.toFixed(3)),
        ]);
      }
    } else {
      this.transformControls.getHelper().visible = false;
      this.callbacks.onBodySelected(null, [0, 0, 0]);
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.transformControls.setMode(mode);
  }

  setTransformSpace(space: TransformSpace): void {
    this.transformControls.setSpace(space);
  }

  setSnapEnabled(enabled: boolean): void {
    if (enabled) {
      this.transformControls.setTranslationSnap(0.5);
      this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
    } else {
      this.transformControls.setTranslationSnap(null);
      this.transformControls.setRotationSnap(null);
    }
  }

  setBodyVisibility(bodyId: string, visible: boolean): void {
    const mesh = this.meshMap.get(bodyId);
    const edges = this.edgeMap.get(bodyId);
    if (mesh) mesh.visible = visible;
    if (edges) edges.visible = visible;
  }

  focusSelection(): void {
    if (!this.selectedBodyId) return;
    const mesh = this.meshMap.get(this.selectedBodyId);
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(center.clone().add(new THREE.Vector3(size, size * 0.7, size)));
    this.orbitControls.target.copy(center);
  }

  cancelDrag(): void {
    if (this.transformControls.dragging) {
      // reset
      this.transformControls.reset();
    }
    this.selectBody(null);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setTheme(theme: 'light' | 'dark'): void {
    const bg = theme === 'light' ? 0xe8edf3 : 0x0d1117;
    this.scene.background = new THREE.Color(bg);
    (this.scene.fog as THREE.Fog).color.set(bg);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.orbitControls.dispose();
    this.transformControls.dispose();
    this.renderer.dispose();
    this.meshMap.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
  }

  getDocument(): CadDocument {
    return this.cadDocument;
  }
}
