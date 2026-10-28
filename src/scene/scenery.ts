import * as T from 'three';
import { sceneryDimensions, type ScenePreset } from '../domain/scenePresets.ts';

export type Scenery = {
  group: T.Group;
  wall: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  roomLight: T.DirectionalLight;
  frameBounds: T.Box3;
};

function disposeGroup(group: T.Group) {
  group.removeFromParent();
  const resources = new Set<{ dispose: () => void }>();
  group.traverse(child => {
    if (child instanceof T.Light) resources.add(child);
    if (!(child instanceof T.Mesh)) return;
    resources.add(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof T.Texture) resources.add(value);
    }
  });
  resources.forEach(resource => resource.dispose());
  group.clear();
}

export function disposeScenery(scenery: Scenery) {
  disposeGroup(scenery.group);
}

// `roofY` (rooftop only): roof surface height in metres, sign centre at the origin.
export function buildScenery(preset: ScenePreset, width: number, height: number, wallZ: number, roofY = -height / 2): Scenery {
  const group = new T.Group();
  group.name = 'installation-scenery';
  const addMesh = <G extends T.BufferGeometry>(geometry: G, parameters: T.MeshStandardMaterialParameters) => {
    let material: T.MeshStandardMaterial | undefined;
    try {
      material = new T.MeshStandardMaterial(parameters);
      const mesh = new T.Mesh(geometry, material);
      group.add(mesh);
      return mesh;
    } catch (error) {
      geometry.dispose();
      material?.dispose();
      throw error;
    }
  };
  try {
    if (preset === 'rooftop') return rooftopScenery(group, addMesh, width, height, roofY);
    const d = sceneryDimensions(width * 1000, height * 1000);
    const contextual = preset !== 'studio';
    const wallWidth = contextual ? d.facadeWidth : Math.max(width * 2, 10);
    const wallHeight = contextual ? d.wallTop - d.floorY : Math.max(height * 3, 5);
    const wall = addMesh(
      new T.PlaneGeometry(wallWidth, wallHeight),
      { color: '#bcc7ca', roughness: 0.95 },
    );
    wall.name = 'mounting-wall';
    wall.position.set(0, contextual ? (d.wallTop + d.floorY) / 2 : 0, wallZ);
    wall.receiveShadow = true;

    const roomLight = new T.DirectionalLight('#fff0d8', preset === 'interior' ? 2.2 : 0);
    roomLight.position.set(-width * 0.25, height / 2 + 1, 3);
    group.add(roomLight, roomLight.target);
    const frameBounds = contextual
      ? new T.Box3(new T.Vector3(-wallWidth / 2, d.floorY, wallZ), new T.Vector3(wallWidth / 2, d.wallTop, 1.2))
      : new T.Box3();

    const box = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, color: string, metalness = 0) => {
      const mesh = addMesh(
        new T.BoxGeometry(w, h, depth),
        { color, roughness: 0.65, metalness },
      );
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
    };

    if (contextual) {
      const floor = addMesh(
        new T.PlaneGeometry(wallWidth * 2, 8),
        { color: preset === 'interior' ? '#b9a78c' : '#a9aaa4', roughness: 1 },
      );
      floor.name = 'floor';
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, d.floorY, wallZ + 4);
      floor.receiveShadow = true;
    }
    if (preset === 'shopfront') {
      const glazingWidth = wallWidth * 0.88;
      const doorWidth = Math.min(1.1, glazingWidth * 0.3);
      const entranceY = d.floorY + d.entranceHeight / 2;
      box('glazing', glazingWidth, d.entranceHeight, 0.025, 0, entranceY, wallZ + 0.025, '#213d49', 0.3);
      box('door', doorWidth, d.entranceHeight, 0.045, 0, entranceY, wallZ + 0.055, '#344c54', 0.3);
      for (const side of [-1, 1]) {
        box('door-frame', 0.035, d.entranceHeight, 0.055, side * doorWidth / 2, entranceY, wallZ + 0.09, '#aab2b1', 0.6);
      }
      box('door-handle', 0.025, 0.32, 0.045, doorWidth * 0.3, d.floorY + 1.1, wallZ + 0.12, '#c3c9c7', 0.8);
    } else if (preset === 'interior') {
      const counterWidth = Math.min(wallWidth * 0.65, Math.max(1.8, width * 0.8));
      box('counter', counterWidth, d.counterHeight, 0.65, 0, d.floorY + d.counterHeight / 2, wallZ + 0.7, '#927353');
      box('counter-top', counterWidth + 0.08, 0.06, 0.73, 0, d.floorY + d.counterHeight + 0.03, wallZ + 0.7, '#e5dfd2');
    }
    return { group, wall, roomLight, frameBounds };
  } catch (error) {
    disposeGroup(group);
    throw error;
  }
}

// Fit the bounded installation area from any viewing direction, independent of the floor's extent.
export function contextFrame(bounds: T.Box3, aspect: number, fov: number, direction: T.Vector3) {
  const center = bounds.getCenter(new T.Vector3());
  const dir = direction.clone().normalize();
  if (dir.lengthSq() < .5) dir.set(.17, .115, 1).normalize();
  const right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new T.Vector3().crossVectors(dir, right).normalize();
  const tanV = Math.tan(fov * Math.PI / 360), tanH = tanV * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new T.Vector3(x, y, z).sub(center);
    distance = Math.max(distance, offset.dot(dir) + Math.max(Math.abs(offset.dot(right)) / tanH, Math.abs(offset.dot(up)) / tanV) * 1.12);
  }
  const radius = bounds.getSize(new T.Vector3()).length() / 2;
  return { center, position: center.clone().addScaledVector(dir, distance), distance, near: .05, far: Math.max(35, distance + radius * 3) };
}

// A flat roof at the top of a building: facade with windows, roof slab and a coping at the
// front edge. The sign stands on the roof just behind the coping.
function rooftopScenery(
  group: T.Group,
  addMesh: <G extends T.BufferGeometry>(geometry: G, parameters: T.MeshStandardMaterialParameters) => T.Mesh<G, T.MeshStandardMaterial>,
  width: number,
  height: number,
  roofY: number,
): Scenery {
  const fw = Math.max(8, width * 1.5),
    front = 1.1, // building edge, in front of the sign
    storey = 3.2;
  const wall = addMesh(new T.PlaneGeometry(fw, storey * 2), { color: '#d9d2c4', roughness: 0.95 });
  wall.name = 'facade';
  wall.position.set(0, roofY - 0.35 - storey, front);
  wall.receiveShadow = true;
  const box = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, color: string, roughness = 0.9) => {
    const mesh = addMesh(new T.BoxGeometry(w, h, depth), { color, roughness });
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  };
  box('roof', fw, 0.35, 12, 0, roofY - 0.175, front - 6, '#8f9592', 1);
  box('coping', fw, 0.12, 0.26, 0, roofY + 0.06, front - 0.13, '#cfc7b8');
  box('cornice', fw + 0.1, 0.12, 0.3, 0, roofY - 0.4, front + 0.05, '#bdb5a6');
  for (let row = 0; row < 2; row++)
    for (let x = -fw / 2 + 1.2; x < fw / 2 - 0.6; x += 2.2)
      box('window', 1.2, 1.5, 0.05, x + 0.3, roofY - 1.6 - row * storey, front + 0.03, '#2b3c45', 0.25);
  const roomLight = new T.DirectionalLight('#fff0d8', 0);
  group.add(roomLight, roomLight.target);
  const frameBounds = new T.Box3(
    new T.Vector3(-Math.max(width * 0.65, 2.5), roofY - 1.2, -1.5),
    new T.Vector3(Math.max(width * 0.65, 2.5), Math.max(height / 2, roofY + 0.5) + 0.4, front + 0.3),
  );
  return { group, wall, roomLight, frameBounds };
}
