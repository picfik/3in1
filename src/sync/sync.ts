import type { AppData, RemoteManifest, RemoteShard, WorkspaceId } from "../types/models";
import { createDefaultData } from "../store/defaultData";
import {
  clearPendingAttachmentDeletion,
  clearPendingAttachments,
  finishAttachmentUpload,
  listAttachmentKeys,
  pendingAttachmentDeletions,
  readAttachment,
  removeAttachment
} from "../store/db";
import { isOssConfigured, signedObjectUrl } from "./client";

const ROOT = "threeinone";
const MANIFEST_KEY = `${ROOT}/manifest.json`;
const SHARDS: WorkspaceId[] = ["cashflow", "diary", "health"];

export type ConflictChoice = "use-remote" | "overwrite-remote";
export class RemoteVersionConflictError extends Error {}

export type SyncResult =
  | { kind: "ready"; data: AppData; remoteVersion: number }
  | { kind: "conflict"; local: AppData; remote: AppData; remoteVersion: number };

async function digest(content: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getObject(key: string): Promise<string | null> {
  const url = await signedObjectUrl(key, "GET");
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取 OSS 对象失败：HTTP ${response.status}`);
  return response.text();
}

async function putObject(key: string, content: Blob | string, contentType: string): Promise<void> {
  const url = await signedObjectUrl(key, "PUT", contentType);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: content
  });
  if (!response.ok) throw new Error(`上传 OSS 对象失败：HTTP ${response.status}`);
}

async function deleteObject(key: string): Promise<void> {
  const url = await signedObjectUrl(key, "DELETE");
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`删除 OSS 对象失败：HTTP ${response.status}`);
}

async function readManifest(): Promise<RemoteManifest | undefined> {
  const text = await getObject(MANIFEST_KEY);
  if (!text) return undefined;
  const parsed = JSON.parse(text) as Partial<RemoteManifest>;
  if (parsed.schemaVersion !== 1 || typeof parsed.version !== "number" || !parsed.shards) {
    throw new Error("OSS manifest 格式不受支持");
  }
  return parsed as RemoteManifest;
}

async function pullData(manifest?: RemoteManifest, deviceId?: string): Promise<AppData> {
  const data = createDefaultData(deviceId || crypto.randomUUID());
  if (!manifest) return data;
  for (const workspace of SHARDS) {
    const shard = manifest.shards[workspace] as RemoteShard | undefined;
    if (!shard) continue;
    const content = await getObject(shard.key);
    if (content === null) throw new Error(`OSS 分片缺失：${workspace}`);
    if (await digest(content) !== shard.sha256) throw new Error(`数据校验失败：${workspace}`);
    const payload = JSON.parse(content) as Partial<AppData>;
    if (workspace === "cashflow" && payload.cashflow) data.cashflow = payload.cashflow;
    if (workspace === "diary" && Array.isArray(payload.diary)) data.diary = payload.diary;
    if (workspace === "health") {
      if (Array.isArray(payload.health)) data.health = payload.health;
      if (Array.isArray(payload.healthTodos)) data.healthTodos = payload.healthTodos;
    }
  }
  data.manifestVersion = manifest.version;
  data.dirty = false;
  return data;
}

async function uploadPendingAttachments(): Promise<void> {
  for (const key of await listAttachmentKeys()) {
    const blob = await readAttachment(key);
    if (!blob) continue;
    await putObject(key, blob, blob.type || "application/octet-stream");
    await finishAttachmentUpload(key);
  }
}

async function flushAttachmentDeletions(data?: AppData): Promise<void> {
  const referencedKeys = new Set(data?.diary.flatMap((entry) => entry.images.map((image) => image.key)) ?? []);
  for (const key of await pendingAttachmentDeletions()) {
    if (referencedKeys.has(key)) {
      await clearPendingAttachmentDeletion(key);
      continue;
    }
    try {
      await deleteObject(key);
      await clearPendingAttachmentDeletion(key);
      await removeAttachment(key);
    } catch {
      // Keep failed deletions queued for a later sync attempt.
    }
  }
}

async function finalizeRemotePull(data: AppData): Promise<void> {
  await clearPendingAttachments();
  await flushAttachmentDeletions(data);
}

async function pushData(data: AppData, previousManifest?: RemoteManifest): Promise<number> {
  await uploadPendingAttachments();
  const previousVersion = previousManifest?.version ?? 0;
  const version = previousVersion + 1;
  const shards: RemoteManifest["shards"] = {};
  const payloads: Record<WorkspaceId, unknown> = {
    cashflow: { cashflow: data.cashflow },
    diary: { diary: data.diary },
    health: { health: data.health, healthTodos: data.healthTodos }
  };

  for (const workspace of SHARDS) {
    const content = JSON.stringify(payloads[workspace]);
    const sha256 = await digest(content);
    const existing = previousManifest?.shards[workspace];
    if (existing?.sha256 === sha256) {
      shards[workspace] = existing;
    } else {
      const key = `${ROOT}/data/v${version}-${data.deviceId}-${crypto.randomUUID()}/${workspace}.json`;
      await putObject(key, content, "application/json");
      shards[workspace] = { key, sha256, bytes: new Blob([content]).size };
    }
  }

  const latest = await readManifest();
  if ((latest?.version ?? 0) !== previousVersion) {
    throw new RemoteVersionConflictError("上传期间远端版本已变化");
  }
  const manifest: RemoteManifest = {
    schemaVersion: 1,
    version,
    deviceId: data.deviceId,
    updatedAt: new Date().toISOString(),
    shards
  };
  await putObject(MANIFEST_KEY, JSON.stringify(manifest), "application/json");
  const confirmed = await readManifest();
  const manifestMatches = SHARDS.every((workspace) => {
    const expected = shards[workspace];
    const actual = confirmed?.shards[workspace];
    return expected?.key === actual?.key && expected?.sha256 === actual?.sha256;
  });
  if (confirmed?.version !== version || confirmed.deviceId !== data.deviceId || !manifestMatches) {
    throw new RemoteVersionConflictError("远端 manifest 在写入后被并发更新");
  }
  await flushAttachmentDeletions(data);
  data.manifestVersion = version;
  data.dirty = false;
  return version;
}

export async function bootstrapSync(local?: AppData): Promise<SyncResult> {
  if (!isOssConfigured()) throw new Error("OSS 未在 GitHub Actions 中配置，请设置 Actions Secrets 和 Variables 后重新部署");
  const manifest = await readManifest();
  const remoteVersion = manifest?.version ?? 0;
  const remote = await pullData(manifest, local?.deviceId);
  if (local && remoteVersion !== local.manifestVersion && (local.dirty || local.manifestVersion > 0)) {
    return { kind: "conflict", local, remote, remoteVersion };
  }
  if (local?.dirty && local.manifestVersion === remoteVersion) {
    local.manifestVersion = await pushData(local, manifest);
    return { kind: "ready", data: local, remoteVersion: local.manifestVersion };
  }
  await finalizeRemotePull(remote);
  return { kind: "ready", data: remote, remoteVersion };
}

export async function synchronize(data: AppData, choice?: ConflictChoice): Promise<SyncResult> {
  const manifest = await readManifest();
  const remoteVersion = manifest?.version ?? 0;
  if (data.dirty && remoteVersion !== data.manifestVersion && choice !== "overwrite-remote") {
    const remote = await pullData(manifest, data.deviceId);
    return { kind: "conflict", local: data, remote, remoteVersion };
  }
  if (choice === "use-remote" || (!data.dirty && remoteVersion > data.manifestVersion)) {
    const pulled = await pullData(manifest, data.deviceId);
    await finalizeRemotePull(pulled);
    return { kind: "ready", data: pulled, remoteVersion };
  }
  if (!data.dirty) {
    await flushAttachmentDeletions(data);
    return { kind: "ready", data, remoteVersion };
  }
  const nextVersion = await pushData(data, manifest);
  return { kind: "ready", data, remoteVersion: nextVersion };
}

export async function syncAttachment(key: string, file: Blob): Promise<void> {
  await putObject(key, file, file.type || "application/octet-stream");
}

export async function signedAttachmentUrl(key: string): Promise<string> {
  return signedObjectUrl(key, "GET");
}