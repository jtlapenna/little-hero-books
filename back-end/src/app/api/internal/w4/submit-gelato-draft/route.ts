import { NextRequest, NextResponse } from 'next/server';
import nodeProcess from 'node:process';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyBearerAuth } from '@/lib/auth';
import {GelatoKeyChallenge,createGelatoRuntimeKeyProof} from '@/lib/books/gelato-runtime-key-proof';
import { handleGelatoSubmission } from '@/lib/books/gelato-submission-endpoint';
import { gelatoSubmissionRuntime } from '@/lib/books/gelato-submission-runtime';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const challenges=request.nextUrl.searchParams.getAll('keyChallenge');
  if(challenges.length&&(challenges.length!==1||[...request.nextUrl.searchParams.keys()].some(k=>k!=='keyChallenge')||!GelatoKeyChallenge.safeParse(challenges[0]).success))return NextResponse.json({error:'Invalid runtime key challenge'},{status:400,headers});
  const flag = 'GELATO_DRAFT_SUBMISSION_ENABLED';
  const classify = (env: Record<string, unknown>) => ({
    present: Object.hasOwn(env, flag), isString: typeof env[flag] === 'string',
    isTrue: env[flag] === 'true', isFalse: env[flag] === 'false',
  });
  let cloudflareEnv: Record<string, unknown> = {};
  let contextAvailable = false;
  try {
    cloudflareEnv = getCloudflareContext().env as unknown as Record<string, unknown>;
    contextAvailable = true;
  } catch { /* Local Node execution may have no Cloudflare request context. */ }
  let draftsEnabled: boolean | null = null;
  try { draftsEnabled = gelatoSubmissionRuntime().draftsEnabled; } catch { /* Report construction failure without error details. */ }
  const timestamp = (globalThis as typeof globalThis & { __BUILD_TIMESTAMP_MS__?: unknown }).__BUILD_TIMESTAMP_MS__;
  let keyAttestation;
  if(challenges.length){
    try{
      if(!contextAvailable)throw Error('Request context unavailable');
      keyAttestation=createGelatoRuntimeKeyProof(challenges[0],{cloudflare:cloudflareEnv,globalProcess:process.env,nodeProcess:nodeProcess.env});
    }catch{return NextResponse.json({error:'Runtime key attestation unavailable'},{status:503,headers});}
  }
  return NextResponse.json({
    ...(keyAttestation?{keyAttestation}:{}),
    contextAvailable, cloudflare: classify(cloudflareEnv),
    globalProcess: classify(process.env), nodeProcess: classify(nodeProcess.env),
    draftsEnabled, buildTimestampMs: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null,
  }, { headers });
}
export async function POST(request: NextRequest) {
  if (!verifyBearerAuth(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await handleGelatoSubmission(await request.json().catch(() => null), 'draft', gelatoSubmissionRuntime());
  return NextResponse.json(result.body, { status: result.status });
}
