import * as T from 'three';
import type { PresentationScene, Shot } from '../presentation/model.ts';
import type { SignScene } from './scene.ts';
function surface(kind:string){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;const image=ctx.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const noise=((x*1973+y*9277+(x*y)*26699)%101)/101;const joint=kind==='brick'?y%64<3||(x+(Math.floor(y/64)%2)*64)%128<3:kind==='paving'?x%128<3||y%128<3:false;const v=joint?112:kind==='brick'?180+noise*30:220+noise*(kind==='concrete'?20:8);const i=(y*256+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}
 ctx.putImageData(image,0,0);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;return tex;
}
export function preparePresentationEnvironment(v:SignScene,scene:PresentationScene,shot:Shot){
 const wall=v.scenery!.wall,floor=v.scenery!.group.getObjectByName('floor') as T.Mesh|undefined;
 const apply=(mesh:T.Mesh,kind:string,color:string,scaleX:number,scaleY:number)=>{const texture=surface(kind);texture.repeat.set(scaleX,scaleY);mesh.material=new T.MeshStandardMaterial({color,roughness:.88,bumpMap:texture,bumpScale:kind==='brick'?.007:.0015,map:texture});texture.colorSpace=T.SRGBColorSpace;};
 wall.material.dispose();apply(wall,scene.wallFinish,scene.wallFinish==='brick'?'#a77c66':scene.wallFinish==='concrete'?'#9fa5a6':'#d6d1c7',Math.max(1,v.state!.settings.width/1000),3);
 if(floor){(floor.material as T.Material).dispose();apply(floor,scene.groundFinish,'#a4a29a',8,8);}
 if(scene.kind==='studio'){v.scenery!.group.visible=false;return;}
 if(scene.kind==='wall'||scene.kind==='facade')for(const child of [...v.scenery!.group.children])if(!['mounting-wall','floor'].includes(child.name)&&child instanceof T.Mesh){child.removeFromParent();child.geometry.dispose();(child.material as T.Material).dispose();}
 const addBox=(name:string,size:number[],position:number[],material:T.Material)=>{const m=new T.Mesh(new T.BoxGeometry(...size as [number,number,number]),material);m.name=name;m.position.set(...position as [number,number,number]);v.scenery!.group.add(m);};
 const bounds=v.scenery!.frameBounds,width=bounds.max.x-bounds.min.x,z=wall.position.z,base=bounds.min.y;
 if(scene.kind==='shopfront'){
  const glazing=v.scenery!.group.getObjectByName('glazing') as T.Mesh|undefined;
  if(glazing){(glazing.material as T.Material).dispose();glazing.material=new T.MeshPhysicalMaterial({color:'#bccbd1',roughness:.12,metalness:0,transmission:.75,thickness:.025,ior:1.5});}
  for(const x of [-width*.35,width*.35]){addBox('interior-shelf',[width*.18,.12,.45],[x,base+1,z-.35],new T.MeshStandardMaterial({color:'#b59c7c',roughness:.65}));}
  addBox('shop-interior',[width*.9,2.4,.08],[0,base+1.2,z-.8],new T.MeshStandardMaterial({color:'#3b4143',roughness:.8}));
 }
 if(scene.kind==='facade')for(const x of [-width*.46,width*.46])addBox('facade-pilaster',[.16,bounds.max.y-base,.18],[x,(base+bounds.max.y)/2,z+.08],new T.MeshStandardMaterial({color:'#bbb9b0',roughness:.8}));
 if(scene.kind==='shopfront'||scene.kind==='facade')for(const x of [-width*.42,width*.42]){
  addBox('planter',[.36,.48,.36],[x,base+.24,z+.45],new T.MeshStandardMaterial({color:'#494c49',roughness:.9}));
  const foliage=new T.Mesh(new T.SphereGeometry(.24,12,8),new T.MeshStandardMaterial({color:'#3b5945',roughness:1}));foliage.position.set(x,base+.68,z+.45);foliage.scale.y=1.4;v.scenery!.group.add(foliage);
 }
 const night=shot.environment==='night';
 if(night&&scene.kind==='shopfront'){const light=new T.RectAreaLight('#ffe3b2',2.5,width*.7,1.5);light.position.set(0,base+1.5,z+.04);light.lookAt(0,base+1.5,z+2);v.scene.add(light);}
}
