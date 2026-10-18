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
  group.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
  group.clear();
}

export function disposeScenery(scenery: Scenery) {
  disposeGroup(scenery.group);
}

export function buildScenery(preset: ScenePreset, width: number, height: number, wallZ: number): Scenery {
  const group = new T.Group();
  group.name = 'installation-scenery';
  try {
    const d = sceneryDimensions(width * 1000, height * 1000);
    const contextual = preset !== 'studio';
    const wallWidth = contextual ? d.facadeWidth : Math.max(width * 2, 10);
    const wallHeight = contextual ? d.wallTop - d.floorY : Math.max(height * 3, 5);
    const wall = new T.Mesh(
      new T.PlaneGeometry(wallWidth, wallHeight),
      new T.MeshStandardMaterial({ color: '#bcc7ca', roughness: 0.95 }),
    );
    wall.name = 'mounting-wall';
    wall.position.set(0, contextual ? (d.wallTop + d.floorY) / 2 : 0, wallZ);
    wall.receiveShadow = true;
    group.add(wall);

    const roomLight = new T.DirectionalLight('#fff0d8', preset === 'interior' ? 2.2 : 0);
    roomLight.position.set(-width * 0.25, height / 2 + 1, 3);
    group.add(roomLight, roomLight.target);
    const frameBounds = contextual
      ? new T.Box3(new T.Vector3(-wallWidth / 2, d.floorY, wallZ), new T.Vector3(wallWidth / 2, d.wallTop, 1.2))
      : new T.Box3();

    const box = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, color: string, metalness = 0) => {
      const mesh = new T.Mesh(
        new T.BoxGeometry(w, h, depth),
        new T.MeshStandardMaterial({ color, roughness: 0.65, metalness }),
      );
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    if (contextual) {
      const floor = new T.Mesh(
        new T.PlaneGeometry(wallWidth * 2, 8),
        new T.MeshStandardMaterial({ color: preset === 'interior' ? '#b9a78c' : '#a9aaa4', roughness: 1 }),
      );
      floor.name = 'floor';
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, d.floorY, wallZ + 4);
      floor.receiveShadow = true;
      group.add(floor);
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
