import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppData } from "../types/models";

interface ThreeInOneDatabase extends DBSchema {
  state: {
    key: "current";
    value: AppData;
  };
  attachments: {
    key: string;
    value: Blob;
  };
  attachmentCache: {
    key: string;
    value: Blob;
  };
  pendingDeletions: {
    key: string;
    value: string;
  };
}

let databasePromise: Promise<IDBPDatabase<ThreeInOneDatabase>> | undefined;

function database(): Promise<IDBPDatabase<ThreeInOneDatabase>> {
  databasePromise ??= openDB<ThreeInOneDatabase>("three-in-one-pwa", 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("attachments")) db.createObjectStore("attachments");
      if (!db.objectStoreNames.contains("attachmentCache")) db.createObjectStore("attachmentCache");
      if (!db.objectStoreNames.contains("pendingDeletions")) db.createObjectStore("pendingDeletions");
    }
  });
  return databasePromise;
}

export async function readLocalData(): Promise<AppData | undefined> {
  return (await database()).get("state", "current");
}

export async function writeLocalData(data: AppData): Promise<void> {
  await (await database()).put("state", data, "current");
}

export async function saveAttachment(key: string, file: Blob): Promise<void> {
  const db = await database();
  const transaction = db.transaction(["attachments", "attachmentCache"], "readwrite");
  await Promise.all([
    transaction.objectStore("attachments").put(file, key),
    transaction.objectStore("attachmentCache").put(file, key),
    transaction.done
  ]);
}

export async function readAttachment(key: string): Promise<Blob | undefined> {
  const db = await database();
  return (await db.get("attachments", key)) ?? db.get("attachmentCache", key);
}

export async function listAttachmentKeys(): Promise<string[]> {
  return (await database()).getAllKeys("attachments");
}

export async function removeAttachment(key: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction(["attachments", "attachmentCache"], "readwrite");
  await Promise.all([
    transaction.objectStore("attachments").delete(key),
    transaction.objectStore("attachmentCache").delete(key),
    transaction.done
  ]);
}

export async function finishAttachmentUpload(key: string): Promise<void> {
  await (await database()).delete("attachments", key);
}

export async function clearPendingAttachments(): Promise<void> {
  await (await database()).clear("attachments");
}

export async function queueAttachmentDeletion(key: string): Promise<void> {
  await (await database()).put("pendingDeletions", key, key);
}

export async function pendingAttachmentDeletions(): Promise<string[]> {
  return (await database()).getAll("pendingDeletions");
}

export async function clearPendingAttachmentDeletion(key: string): Promise<void> {
  await (await database()).delete("pendingDeletions", key);
}

export async function clearPendingAttachmentDeletions(): Promise<void> {
  await (await database()).clear("pendingDeletions");
}