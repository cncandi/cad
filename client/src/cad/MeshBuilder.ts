import * as THREE from 'three';
import { CadBody } from './CadTypes';

export function buildDemoMesh(body: CadBody): THREE.Mesh {
  let geometry: THREE.BufferGeometry;

  switch (body.id) {
    case 'body-base':   geometry = new THREE.BoxGeometry(4, 0.4, 3); break;
    case 'body-column': geometry = new THREE.CylinderGeometry(0.4, 0.5, 3, 32); break;
    case 'body-cap':    geometry = new THREE.BoxGeometry(1.8, 0.4, 1.8); break;
    default:            geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const mesh = new THREE.Mesh(geometry,
    new THREE.MeshStandardMaterial({ color: 0xb8c8d8, roughness: 0.45, metalness: 0.25 })
  );
  mesh.name = body.meshObjectId ?? body.id;
  mesh.userData['bodyId'] = body.id;
  mesh.castShadow = mesh.receiveShadow = true;
  if (body.position) mesh.position.set(...body.position);
  return mesh;
}
