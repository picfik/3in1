import type { AppData, HealthRecord } from "../types/models";

export const DEFAULT_TODOS = [
  { key: "wake", name: "起床" },
  { key: "breakfast", name: "早餐" },
  { key: "lunch", name: "午餐" },
  { key: "dinner", name: "晚餐" },
  { key: "walk", name: "快走" },
  { key: "baduanjin", name: "八段锦" },
  { key: "deadbug", name: "死虫式" },
  { key: "bird-dog", name: "鸟狗式" },
  { key: "bridge", name: "臀桥" },
  { key: "pushup", name: "俯卧撑" },
  { key: "squat", name: "深蹲" },
  { key: "sleep", name: "睡眠" }
];

export function createHealthRecord(date: string): HealthRecord {
  return {
    date,
    updatedAt: Date.now(),
    fasting: null,
    postprandial: null,
    water: null,
    backPain: null,
    numbness: "none",
    kneePain: null,
    smoke: null,
    sleepBed: "",
    sleepWake: "",
    weight: null,
    systolic: null,
    diastolic: null,
    heartRate: null,
    todos: {}
  };
}

export function createDefaultData(deviceId: string = crypto.randomUUID()): AppData {
  return {
    schemaVersion: 1,
    cashflow: {
      profession: "我的账本",
      cash: 0,
      salary: 0,
      children: 0,
      expenses: [],
      liabilities: [],
      assets: [],
      extraIncomes: [],
      dreams: [],
      log: []
    },
    diary: [],
    health: [],
    healthTodos: DEFAULT_TODOS.map((item) => ({ ...item })),
    dirty: false,
    manifestVersion: 0,
    deviceId
  };
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}