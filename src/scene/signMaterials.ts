import * as T from 'three';
import { shapeFromRegion } from './scene.ts';
import { haloLit } from '../domain/recipes.ts';
import { kelvinToHex } from '../domain/lighting.ts';
import type { SceneInput } from '../domain/layout.ts';
export function disposeOwnedScene(root:T.Object3D){
 const resources=new Set<{dispose:()=>void}>();
 root.traverse(o=>{if(o instanceof T.Mesh){resources.add(o.geometry);for(const mat of [o.material].flat()){resources.add(mat);for(const value of Object.values(mat))if(value instanceof T.Texture)resources.add(value);}}if(o instanceof T.Light)resources.add(o);});
 resources.forEach(r=>r.dispose());root.removeFromParent();root.clear();
}
export function addHaloEmitters(root:T.Group,input:SceneInput){
 if(!input.lights)return;
 for(const e of input.layout.elements){if(!haloLit(e.type))continue;
  const light=e.light??{on:true,color:kelvinToHex(input.settings.ledTemp),dimming:1};
  if(!light.on)continue;
  for(const r of e.regions){const shape=shapeFromRegion({outer:r.outer.map(([x,y])=>[x*.001,y*.001]),holes:r.holes.map(h=>h.map(([x,y])=>[x*.001,y*.001]))});
   const m=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshStandardMaterial({color:light.color,emissive:light.color,emissiveIntensity:8*input.dimming*light.dimming,side:T.BackSide}));
   m.position.z=(e.base+(e.params.standoff??0))*.001-.001;m.name='rear-light-emitter';root.add(m);
  }
 }
}
