import * as THREE from 'three';
import { CadBody } from './CadTypes';

const MATERIAL_DEFAULT = new THREE.MeshStandardMaterial({
  color: 0xc0ccd8,
  roughness: 0.5,
  metalness: 0.3,
});

const MATERIAL_SELECTED = new THREE.MeshStandardMaterial({
  color: 0x3a8fd4,
  roughness: 0.4,
  metalness: 0.3,
  transparent: true,
  opacity: 0.85,
  emissive: 0x1a4f8a,
  emissiveIntensity: 0.2,
});

export function getMaterial(selected: boolean): THREE.MeshStandardMaterial {
  return selected ? MATERIAL_SELECTED : MATERIAL_DEFAULT;
}

export function buildDemoMesh(body: CadBody): THREE.Mesh {
  let geometry: THREE.BufferGeometry;

  switch (body.id) {
    case 'body-base':
      geometry = new THREE.BoxGeometry(4, 0.4, 3);
      break;
    case 'body-column':
      geometry = new THREE.CylinderGeometry(0.4, 0.5, 3, 32);
      break;
    case 'body-cap':
      geometry = new THREE.BoxGeometry(1.8, 0.4, 1.8);
      break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const mesh = new THREE.Mesh(geometry, getMaterial(false).clone());
  mesh.name = body.meshObjectId ?? body.id;
  mesh.userData['bodyId'] = body.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (body.position) {
    mesh.position.set(...body.position);
  }

  return mesh;
}

export function buildEdgeLines(mesh: THREE.Mesh): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 15);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x607080, linewidth: 1 });
  const lines = new THREE.LineSegments(edges, lineMat);
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  lines.userData['isEdge'] = true;
  return lines;
}
