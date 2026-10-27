export class RenderQueue {
 private controller:AbortController|null=null;
 cancel(){this.controller?.abort();}
 async run<T,R>(items:T[],render:(item:T,signal:AbortSignal)=>Promise<R>,complete:(item:T,result:R)=>void,signal?:AbortSignal){
  this.cancel();const controller=new AbortController();this.controller=controller;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)controller.abort();
  try{for(const item of items){controller.signal.throwIfAborted();const result=await render(item,controller.signal);controller.signal.throwIfAborted();if(this.controller!==controller)throw new DOMException('Superseded','AbortError');complete(item,result);}}
  finally{signal?.removeEventListener('abort',cancel);if(this.controller===controller)this.controller=null;}
 }
}
