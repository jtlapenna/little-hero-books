/** Credential-free bounded streaming helper; transport and storage are injected. */
export async function readGelatoArtifactBytes(load: (signal: AbortSignal) => Promise<Response>, budgetMs=30_000): Promise<Uint8Array> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(new Error('Engineering PDF read timed out')),budgetMs);
  let abortHandler: (()=>void)|undefined;
  const aborted=new Promise<never>((_,reject)=>{abortHandler=()=>reject(new Error('Engineering PDF read timed out'));controller.signal.addEventListener('abort',abortHandler,{once:true});});
  let reader: ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await Promise.race([load(controller.signal),aborted]);
    if(!response.ok||!response.body)throw new Error('Engineering PDF lookup failed');
    reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    for(;;){const next=await Promise.race([reader.read(),aborted]);if(next.done)break;length+=next.value.length;if(length>64_000_000)throw new Error('Engineering PDF exceeds bound');chunks.push(next.value);}
    return Buffer.concat(chunks);
  } catch(error){if(reader)void reader.cancel().catch(()=>undefined);throw error;}
  finally {clearTimeout(timeout);if(abortHandler)controller.signal.removeEventListener('abort',abortHandler);}
}
