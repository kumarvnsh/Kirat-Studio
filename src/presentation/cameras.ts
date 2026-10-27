import * as T from 'three';
import type { ShotCamera } from './model.ts';
export function presentationCamera(bounds:T.Box3,shot:ShotCamera,aspect:number):T.PerspectiveCamera|T.OrthographicCamera {
 const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()), radius=Math.max(size.length(),.05);
 const directions={front:[0,0,1],left:[-1,0,0],right:[1,0,0],top:[0,1,0],elevated:[.32,.8,1],threeQuarter:[.5,.22,1],custom:[.5,.22,1]};
 const direction=new T.Vector3(...directions[shot.preset]).normalize();
 if(shot.preset==='custom'&&shot.position&&shot.target)direction.fromArray(shot.position).sub(new T.Vector3(...shot.target)).normalize();
 const up=shot.preset==='top'?new T.Vector3(0,0,-1):new T.Vector3(0,1,0);
 const right=new T.Vector3().crossVectors(up,direction).normalize(),vertical=new T.Vector3().crossVectors(direction,right).normalize();
 const corners:T.Vector3[]=[];
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new T.Vector3(x,y,z).sub(center));
 const halfWidth=Math.max(.001,...corners.map(p=>Math.abs(p.dot(right)))),halfHeight=Math.max(.001,...corners.map(p=>Math.abs(p.dot(vertical))));
 const technical=['front','left','right','top'].includes(shot.preset);
 let camera:T.PerspectiveCamera|T.OrthographicCamera,distance:number;
 if(technical) {const h=Math.max(halfHeight,halfWidth/aspect)*1.12;camera=new T.OrthographicCamera(-h*aspect,h*aspect,h,-h,.001,radius*6);distance=radius*2;}
 else {const tan=Math.tan(T.MathUtils.degToRad(35/2));distance=Math.max(...corners.map(p=>p.dot(direction)+Math.max(Math.abs(p.dot(vertical))/tan,Math.abs(p.dot(right))/(tan*aspect))))*1.12;camera=new T.PerspectiveCamera(35,aspect,.001,distance+radius*3);}
 camera.up.copy(up);camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return camera;
}
