import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 environment is not configured');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function signUpload(key: string, contentType: string, contentLength: number) {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('R2_BUCKET is not configured');
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
  const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 120 });
  const baseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  return { uploadUrl, publicUrl: baseUrl ? `${baseUrl}/${key}` : null };
}
