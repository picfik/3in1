interface OssCredentials {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
}

const URL_TTL_SECONDS = 600;

function credentials(): OssCredentials {
  const { VITE_OSS_BUCKET, VITE_OSS_ENDPOINT, VITE_OSS_ACCESS_KEY_ID, VITE_OSS_ACCESS_KEY_SECRET } = import.meta.env;
  if (!VITE_OSS_BUCKET || !VITE_OSS_ENDPOINT || !VITE_OSS_ACCESS_KEY_ID || !VITE_OSS_ACCESS_KEY_SECRET) {
    throw new Error("OSS 未在 GitHub Actions 中配置。请设置 OSS_BUCKET、OSS_ENDPOINT 和 OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET 后重新部署。");
  }
  return {
    bucket: VITE_OSS_BUCKET.trim(),
    endpoint: VITE_OSS_ENDPOINT.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    accessKeyId: VITE_OSS_ACCESS_KEY_ID.trim(),
    accessKeySecret: VITE_OSS_ACCESS_KEY_SECRET.trim()
  };
}

async function hmacSha1Base64(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  let binary = "";
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function isOssConfigured(): boolean {
  const env = import.meta.env;
  return Boolean(env.VITE_OSS_BUCKET && env.VITE_OSS_ENDPOINT && env.VITE_OSS_ACCESS_KEY_ID && env.VITE_OSS_ACCESS_KEY_SECRET);
}

export async function signedObjectUrl(
  key: string,
  method: "GET" | "PUT" | "DELETE",
  contentType = ""
): Promise<string> {
  const oss = credentials();
  const expires = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
  const resource = `/${oss.bucket}/${key}`;
  const stringToSign = [method, "", contentType, String(expires), resource].join("\n");
  const signature = await hmacSha1Base64(stringToSign, oss.accessKeySecret);
  const query = new URLSearchParams({
    OSSAccessKeyId: oss.accessKeyId,
    Expires: String(expires),
    Signature: signature
  });
  return `https://${oss.bucket}.${oss.endpoint}/${encodeObjectKey(key)}?${query.toString()}`;
}