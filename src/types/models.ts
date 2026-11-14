export type WorkspaceId = "cashflow" | "diary" | "health";

export interface CashflowItem {
  id: string;
  name: string;
  amount: number;
  category?: string;
  cashflow?: number;
  cost?: number;
  invested?: number;
  target?: number;
}

export interface CashflowState {
  profession: string;
  cash: number;
  salary: number;
  children: number;
  expenses: CashflowItem[];
  liabilities: CashflowItem[];
  assets: CashflowItem[];
  extraIncomes: CashflowItem[];
  dreams: CashflowItem[];
  log: Array<{ id: string; time: string; text: string }>;
}

export interface DiaryImage {
  key: string;
  name: string;
  type: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  text: string;
  images: DiaryImage[];
  createdAt: string;
  updatedAt: string;
}

export interface HealthRecord {
  date: string;
  updatedAt: number;
  fasting: number | null;
  postprandial: number | null;
  water: number | null;
  backPain: number | null;
  numbness: "none" | "intermittent" | "persistent";
  kneePain: number | null;
  smoke: number | null;
  sleepBed: string;
  sleepWake: string;
  weight: number | null;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  todos: Record<string, number>;
}

export interface TodoDefinition {
  key: string;
  name: string;
}

export interface AppData {
  schemaVersion: 1;
  cashflow: CashflowState;
  diary: DiaryEntry[];
  health: HealthRecord[];
  healthTodos: TodoDefinition[];
  dirty: boolean;
  manifestVersion: number;
  deviceId: string;
}

export interface RemoteShard {
  key: string;
  sha256: string;
  bytes: number;
}

export interface RemoteManifest {
  schemaVersion: 1;
  version: number;
  deviceId: string;
  updatedAt: string;
  shards: Partial<Record<WorkspaceId, RemoteShard>>;
}

export type SyncPhase = "setup" | "connecting" | "ready" | "dirty" | "syncing" | "offline" | "conflict" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  message: string;
  remoteVersion?: number;
}