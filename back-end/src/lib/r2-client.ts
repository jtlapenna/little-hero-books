import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  r2Client,
  R2_CHARACTERS_PREFIX,
  R2_ORDERS_BUCKET,
  R2_PUBLIC_BUCKET,
  validateR2Config,
} from './r2-config';

export { r2Client, R2_CHARACTERS_PREFIX, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET, validateR2Config };

/**
 * ListObjectsV2 response structure (parsed from XML)
 */
export interface ListObjectsV2Response {
  ListBucketResult: {
    IsTruncated?: boolean;
    Contents?: Array<{
      Key: string;
      LastModified?: string;
      ETag?: string;
      Size?: number;
      StorageClass?: string;
    }>;
    CommonPrefixes?: Array<{
      Prefix: string;
    }>;
    KeyCount?: number;
    MaxKeys?: number;
    Prefix?: string;
    Delimiter?: string;
    NextContinuationToken?: string;
  };
}

/**
 * List objects in an R2 bucket (S3-compatible ListObjectsV2)
 * @param bucket - Bucket name
 * @param prefix - Optional prefix filter
 * @param delimiter - Optional delimiter for grouping (e.g., '/' for folders)
 * @param maxKeys - Maximum number of keys to return
 * @param continuationToken - Token for pagination
 */
export async function listObjects(
  bucket: string,
  options: {
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
    continuationToken?: string;
  } = {}
): Promise<ListObjectsV2Response['ListBucketResult']> {
  const { prefix, delimiter, maxKeys, continuationToken } = options;
  try {
    const result = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: delimiter,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      })
    );

    return {
      IsTruncated: result.IsTruncated,
      Contents: (result.Contents || []).map((item) => ({
        Key: item.Key || '',
        LastModified: item.LastModified?.toISOString(),
        ETag: item.ETag,
        Size: item.Size,
        StorageClass: item.StorageClass,
      })),
      CommonPrefixes: (result.CommonPrefixes || []).map((item) => ({
        Prefix: item.Prefix || '',
      })),
      KeyCount: result.KeyCount,
      MaxKeys: result.MaxKeys,
      Prefix: result.Prefix,
      Delimiter: result.Delimiter,
      NextContinuationToken: result.NextContinuationToken,
    };
  } catch (error: any) {
    throw new Error(`R2 listObjects failed: ${error?.name || 'Error'} - ${error?.message || error}`);
  }
}

/**
 * Encode S3/R2 key for URL (preserve slashes, encode other special chars)
 */
function encodeS3Key(key: string): string {
  // Split by /, encode each segment, rejoin to preserve slashes
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * Get an object from R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Response with body that can be read as text/JSON/blob
 */
export async function getObject(bucket: string, key: string): Promise<Response> {
  console.log('[R2 getObject] Debug:', {
    bucket,
    key,
  });
  try {
    const result = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      throw new Error('R2 getObject returned empty body');
    }

    return new Response(result.Body as BodyInit, {
      status: 200,
      headers: {
        ...(result.ContentType ? { 'content-type': result.ContentType } : {}),
        ...(result.ContentLength != null ? { 'content-length': String(result.ContentLength) } : {}),
        ...(result.ETag ? { etag: result.ETag } : {}),
      },
    });
  } catch (error: any) {
    throw new Error(`R2 getObject failed: ${error?.name || 'Error'} - ${error?.message || error}`);
  }
}

/**
 * Issue a HEAD request for an object in R2 to retrieve metadata without downloading the file
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Response containing headers (Content-Type, Content-Length, etc.)
 */
export async function headObject(bucket: string, key: string): Promise<Response> {
  try {
    const result = await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return new Response(null, {
      status: 200,
      headers: {
        ...(result.ContentType ? { 'content-type': result.ContentType } : {}),
        ...(result.ContentLength != null ? { 'content-length': String(result.ContentLength) } : {}),
        ...(result.ETag ? { etag: result.ETag } : {}),
      },
    });
  } catch (error: any) {
    const httpStatus = error?.$metadata?.httpStatusCode;
    if (httpStatus === 404 || error?.name === 'NotFound') {
      return new Response(null, { status: 404 });
    }
    throw new Error(`R2 headObject failed: ${error?.name || 'Error'} - ${error?.message || error}`);
  }
}

/**
 * Put (upload) an object to R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @param body - File body (Blob, ArrayBuffer, or ReadableStream)
 * @param contentType - Content type (e.g., 'image/png')
 * @returns Response from R2
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Blob | ArrayBuffer | ReadableStream | Uint8Array | string,
  contentType?: string
): Promise<Response> {
  console.log('[R2 putObject] Uploading:', {
    bucket,
    key,
    contentType,
  });

  let requestBody: Uint8Array | string | Blob;
  if (typeof body === 'string' || (typeof Blob !== 'undefined' && body instanceof Blob)) {
    requestBody = body;
  } else if (body instanceof Uint8Array) {
    requestBody = body;
  } else if (body instanceof ArrayBuffer) {
    requestBody = new Uint8Array(body);
  } else {
    requestBody = new Uint8Array(await new Response(body).arrayBuffer());
  }

  try {
    const result = await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: requestBody,
        ContentType: contentType,
      })
    );

    return new Response(null, {
      status: 200,
      headers: {
        ...(result.ETag ? { etag: result.ETag } : {}),
      },
    });
  } catch (error: any) {
    throw new Error(`R2 putObject failed: ${error?.name || 'Error'} - ${error?.message || error}`);
  }
}

/**
 * Delete an object from R2 bucket
 * @param bucket - Bucket name
 * @param key - Object key
 * @returns Response from R2
 */
export async function deleteObject(bucket: string, key: string): Promise<Response> {
  console.log('[R2 deleteObject] Deleting:', {
    bucket,
    key,
  });
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return new Response(null, { status: 204 });
  } catch (error: any) {
    throw new Error(`R2 deleteObject failed: ${error?.name || 'Error'} - ${error?.message || error}`);
  }
}

/**
 * Generate a signed URL for an R2 object (for public access)
 * Note: aws4fetch doesn't have built-in presigning, so we'll use the client's fetch method
 * For temporary signed URLs, we'd need to implement presigning manually or use a different approach
 * For now, this returns a URL that requires authentication via the client
 */
export function getObjectUrl(bucket: string, key: string): string {
  throw new Error(`Direct object URL is not supported for private R2 buckets: ${bucket}/${key}`);
}
