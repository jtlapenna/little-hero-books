import {createHash} from 'node:crypto';

export const MAX_GELATO_FILE_BYTES=256_000_000;

/** Hash a bounded response without retaining its chunks or allocating a full PDF. */
export async function digestGelatoFile(response:Response, options:{signal:AbortSignal;maxFileBytes?:number;onBytes?:(bytes:number)=>void}):Promise<string>{
 const {signal}=options,max=options.maxFileBytes??MAX_GELATO_FILE_BYTES;
 const cancelBody=()=>{void response.body?.cancel().catch(()=>undefined);};
 if(!Number.isSafeInteger(max)||max<1||max>MAX_GELATO_FILE_BYTES){cancelBody();throw Error('Gelato file verification exceeds byte budget');}
 if(!response.ok||!response.body){cancelBody();throw Error('Gelato file verification could not load bytes');}
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>max)){cancelBody();throw Error('Gelato file verification exceeds byte budget');}
 const reader=response.body.getReader(),hash=createHash('sha256');let bytes=0;
 try{
  for(;;){
   signal.throwIfAborted();
   const chunk=await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve,reject)=>{
    const abort=()=>reject(Error('Gelato file verification aborted'));
    signal.addEventListener('abort',abort,{once:true});
    reader.read().then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   });
   signal.throwIfAborted();
   if(chunk.done)break;
   bytes+=chunk.value.byteLength;
   if(bytes>max)throw Error('Gelato file verification exceeds byte budget');
   options.onBytes?.(chunk.value.byteLength);
   hash.update(chunk.value);
  }
  if(!bytes)throw Error('Gelato file verification received an empty file');
  return hash.digest('hex');
 }finally{void reader.cancel().catch(()=>undefined);reader.releaseLock();}
}

/** Caller deadline covers fetch and body reads, including a loader that ignores abort. */
export async function loadGelatoFileDigest(load:(signal:AbortSignal)=>Promise<Response>,callerSignal:AbortSignal):Promise<string>{
 const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(30_000)]);signal.throwIfAborted();
 const response=await new Promise<Response>((resolve,reject)=>{
  const abort=()=>reject(Error('Gelato file verification aborted'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return load(signal);}).then(value=>{
   if(signal.aborted){void value.body?.cancel().catch(()=>undefined);reject(Error('Gelato file verification aborted'));}
   else resolve(value);
  },reject).finally(()=>signal.removeEventListener('abort',abort));
 });
 return digestGelatoFile(response,{signal});
}
