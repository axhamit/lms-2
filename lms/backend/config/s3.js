const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand,
  ListObjectsV2Command, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3: cfg } = require('./env');

const enabled = Boolean(cfg.bucket && cfg.region);
const client = enabled ? new S3Client({ region: cfg.region }) : null; // credentials come from env vars or the IAM role
const Bucket = cfg.bucket;
const httpErr = (status, message) => Object.assign(new Error(message), { status });

exports.enabled = enabled;
exports.require = (req, res, next) => (enabled ? next() : res.status(503).json({ message: 'File storage (S3) is not configured on the server' }));

exports.presignPut = (Key, ContentType) => getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: 900 });
exports.presignGet = (Key, { filename, inline } = {}) => getSignedUrl(client, new GetObjectCommand({
  Bucket, Key,
  ResponseContentDisposition: inline ? 'inline' : `attachment; filename="${String(filename || 'file').replace(/["\r\n]/g, '')}"`,
}), { expiresIn: 600 });

// Confirms the object really exists in S3 and is not bigger than allowed. Returns real size in bytes.
exports.verify = async (Key, maxBytes) => {
  if (!enabled) throw httpErr(503, 'File storage (S3) is not configured');
  let head;
  try { head = await client.send(new HeadObjectCommand({ Bucket, Key })); }
  catch { throw httpErr(400, 'Uploaded file was not found. Please upload it again.'); }
  if (head.ContentLength > maxBytes) { await exports.remove(Key); throw httpErr(400, 'File is too large'); }
  return head.ContentLength;
};

exports.remove = (Key) => (enabled ? client.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {}) : Promise.resolve());

exports.deletePrefix = async (Prefix) => {
  if (!enabled) return;
  let ContinuationToken;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    if (r.Contents?.length) await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: r.Contents.map((o) => ({ Key: o.Key })) } }));
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
};

// Multipart upload (used for long class recordings)
exports.mpStart = async (Key, ContentType) => (await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType }))).UploadId;
exports.mpPartUrl = (Key, UploadId, PartNumber) => getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), { expiresIn: 900 });
exports.mpComplete = (Key, UploadId, Parts) => client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts } }));
exports.mpAbort = (Key, UploadId) => client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })).catch(() => {});
