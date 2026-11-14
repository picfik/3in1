import { useMemo, useState, type FormEvent } from "react";
import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { AppData, HealthRecord } from "../../types/models";
import { createHealthRecord, localDateKey } from "../../store/defaultData";

type NumericMetric = "fasting" | "postprandial" | "water" | "backPain" | "kneePain" | "smoke" | "weight" | "systolic" | "diastolic" | "heartRate";

const metricFields: Array<{ key: NumericMetric; label: string; unit: string; step?: string; max?: number }> = [
  { key: "fasting", label: "空腹血糖", unit: "mmol/L", step: "0.1" },
  { key: "postprandial", label: "餐后 2 小时", unit: "mmol/L", step: "0.1" },
  { key: "water", label: "饮水", unit: "ml", step: "100" },
  { key: "backPain", label: "腰痛", unit: "/ 10", max: 10 },
  { key: "kneePain", label: "膝痛", unit: "/ 10", max: 10 },
  { key: "smoke", label: "吸烟", unit: "支" },
  { key: "weight", label: "体重", unit: "kg", step: "0.1" },
  { key: "systolic", label: "收缩压", unit: "mmHg" },
  { key: "diastolic", label: "舒张压", unit: "mmHg" },
  { key: "heartRate", label: "心率", unit: "次/分" }
];

function valueFor(value: number | null): string {
  return value === null ? "" : String(value);
}

export default function HealthWorkspace({ data, onChange }: { data: AppData; onChange: (data: AppData) => void }) {
  const [date, setDate] = useState(localDateKey());
  const [newTodo, setNewTodo] = useState("");
  const record = data.health.find((item) => item.date === date) ?? createHealthRecord(date);
  const history = useMemo(() => [...data.health].sort((left, right) => right.date.localeCompare(left.date)), [data.health]);

  function updateRecord<K extends keyof HealthRecord>(key: K, value: HealthRecord[K]) {
    const next = structuredClone(data);
    const existing = next.health.find((item) => item.date === date);
    const updated = { ...(existing ?? createHealthRecord(date)), [key]: value, updatedAt: Date.now() };
    next.health = existing
      ? next.health.map((item) => item.date === date ? updated : item)
      : [...next.health, updated];
    next.dirty = true;
    onChange(next);
  }

  function updateMetric(key: NumericMetric, raw: string) {
    const parsed = raw === "" ? null : Number(raw);
    updateRecord(key, (parsed !== null && Number.isFinite(parsed) ? parsed : null) as HealthRecord[typeof key]);
  }

  function toggleTodo(key: string) {
    const todos = { ...record.todos };
    if (todos[key]) delete todos[key];
    else todos[key] = Date.now();
    updateRecord("todos", todos);
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newTodo.trim();
    if (!name) return;
    const next = structuredClone(data);
    next.healthTodos.push({ key: crypto.randomUUID(), name });
    next.dirty = true;
    onChange(next);
    setNewTodo("");
  }

  function removeTodo(key: string) {
    const next = structuredClone(data);
    next.healthTodos = next.healthTodos.filter((item) => item.key !== key);
    next.dirty = true;
    onChange(next);
  }

  function moveTodo(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= data.healthTodos.length) return;
    const next = structuredClone(data);
    [next.healthTodos[index], next.healthTodos[target]] = [next.healthTodos[target], next.healthTodos[index]];
    next.dirty = true;
    onChange(next);
  }

  const alerts = [];
  if (record.fasting !== null && record.fasting > 7) alerts.push({ level: "red", text: `空腹血糖 ${record.fasting} mmol/L，高于应用内提示阈值。` });
  else if (record.fasting !== null && record.fasting > 6.1) alerts.push({ level: "yellow", text: `空腹血糖 ${record.fasting} mmol/L，高于应用内提示阈值。` });
  if (record.postprandial !== null && record.postprandial > 7.8) alerts.push({ level: record.postprandial > 11.1 ? "red" : "yellow", text: `餐后血糖 ${record.postprandial} mmol/L，高于应用内提示阈值。` });
  if ((record.backPain ?? 0) >= 7 || record.numbness !== "none") alerts.push({ level: "red", text: "腰痛或腿麻已达到你设置的运动提醒条件，请谨慎安排训练。" });

  const recent = history.slice(0, 14).reverse();
  const maxSugar = Math.max(8, ...recent.map((item) => item.fasting ?? 0));

  return (
    <div className="feature-stack">
      <section className="health-datebar work-panel">
        <div><p className="eyebrow">DAILY CHECK-IN</p><h3>每日健康记录</h3></div>
        <div className="date-stepper"><button className="icon-button" aria-label="前一天" onClick={() => { const day = new Date(`${date}T12:00:00`); day.setDate(day.getDate() - 1); setDate(localDateKey(day)); }}><ChevronLeft size={18} /></button><input aria-label="记录日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button className="icon-button" aria-label="后一天" onClick={() => { const day = new Date(`${date}T12:00:00`); day.setDate(day.getDate() + 1); setDate(localDateKey(day)); }}><ChevronRight size={18} /></button><button className="button button-light" onClick={() => setDate(localDateKey())}>今天</button></div>
      </section>

      {alerts.length > 0 && <section className="health-alerts" aria-live="polite">{alerts.map((alert, index) => <p className={`health-alert ${alert.level}`} key={`${alert.text}-${index}`}><Activity size={16} />{alert.text}</p>)}<small>自动提示仅用于记录参考，不构成诊断或治疗建议。</small></section>}

      <div className="health-layout">
        <div className="feature-stack">
          <section className="work-panel">
            <div className="panel-titleline"><div><p className="eyebrow">BODY & ROUTINE</p><h3>身体指标</h3></div><span className="unit-note">记录即保存</span></div>
            <div className="health-fields">
              {metricFields.map((field) => <label className="health-field" key={field.key}><span>{field.label}<small>{field.unit}</small></span><input aria-label={field.label} max={field.max} min="0" step={field.step ?? "1"} type="number" value={valueFor(record[field.key])} onChange={(event) => updateMetric(field.key, event.target.value)} /></label>)}
              <label className="health-field"><span>就寝时间</span><input type="time" value={record.sleepBed} onChange={(event) => updateRecord("sleepBed", event.target.value)} /></label>
              <label className="health-field"><span>起床时间</span><input type="time" value={record.sleepWake} onChange={(event) => updateRecord("sleepWake", event.target.value)} /></label>
              <label className="health-field"><span>腿麻情况</span><select value={record.numbness} onChange={(event) => updateRecord("numbness", event.target.value as HealthRecord["numbness"])}><option value="none">无</option><option value="intermittent">间歇</option><option value="persistent">持续</option></select></label>
            </div>
          </section>

          <section className="work-panel">
            <div className="panel-titleline"><div><p className="eyebrow">HABIT TRACKER</p><h3>今日待办</h3></div><span className="count-badge">{Object.keys(record.todos).length} / {data.healthTodos.length}</span></div>
            <div className="todo-list">{data.healthTodos.map((todo, index) => <div className="todo-row" key={todo.key}><label><input checked={Boolean(record.todos[todo.key])} type="checkbox" onChange={() => toggleTodo(todo.key)} /><span>{todo.name}</span></label><div className="todo-tools"><button className="icon-button" aria-label={`上移${todo.name}`} disabled={index === 0} onClick={() => moveTodo(index, -1)}><ChevronUp size={14} /></button><button className="icon-button" aria-label={`下移${todo.name}`} disabled={index === data.healthTodos.length - 1} onClick={() => moveTodo(index, 1)}><ChevronDown size={14} /></button><button className="icon-button danger-icon" aria-label={`删除待办${todo.name}`} onClick={() => removeTodo(todo.key)}><Trash2 size={15} /></button></div></div>)}</div>
            <form className="todo-add" onSubmit={addTodo}><input aria-label="新增待办" value={newTodo} onChange={(event) => setNewTodo(event.target.value)} placeholder="新增待办" /><button className="button button-dark" type="submit"><Plus size={16} />添加</button></form>
          </section>
        </div>

        <div className="feature-stack">
          <section className="work-panel trend-panel">
            <div className="panel-titleline"><div><p className="eyebrow">LAST 14 RECORDS</p><h3>空腹血糖趋势</h3></div><span className="unit-note">mmol/L</span></div>
            {recent.length ? <div className="trend-chart" role="img" aria-label="最近14次空腹血糖记录"><div className="trend-axis"><span>{maxSugar.toFixed(1)}</span><span>{(maxSugar / 2).toFixed(1)}</span><span>0</span></div><div className="trend-bars">{recent.map((item) => <div className="trend-column" key={item.date} title={`${item.date}：${item.fasting ?? "无记录"}`}><div className="trend-bar-wrap"><span className="trend-bar" style={{ height: `${Math.max(3, ((item.fasting ?? 0) / maxSugar) * 100)}%` }} /></div><time>{item.date.slice(5)}</time></div>)}</div></div> : <p className="empty-note">记录后会显示近期趋势</p>}
          </section>
          <section className="work-panel history-panel"><div className="panel-titleline"><div><p className="eyebrow">HISTORY</p><h3>历史记录</h3></div><span className="count-badge">{history.length}</span></div>{history.slice(0, 8).map((item) => <button className={`history-row ${item.date === date ? "current" : ""}`} key={item.date} onClick={() => setDate(item.date)}><time>{item.date}</time><span>空腹 {item.fasting ?? "—"}</span><span>饮水 {item.water ?? "—"}</span></button>)}</section>
        </div>
      </div>
    </div>
  );
}