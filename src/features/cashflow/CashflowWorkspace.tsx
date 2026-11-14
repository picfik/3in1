import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { AppData, CashflowItem } from "../../types/models";
import { cashflowSummary } from "./engine";

type ItemGroup = "expenses" | "extraIncomes" | "assets" | "liabilities" | "dreams";
type ItemKind = "expense" | "income" | "asset" | "liability" | "dream";

const groups: Array<{ key: ItemGroup; label: string; kind: ItemKind }> = [
  { key: "expenses", label: "月支出", kind: "expense" },
  { key: "extraIncomes", label: "额外收入", kind: "income" },
  { key: "assets", label: "资产", kind: "asset" },
  { key: "liabilities", label: "负债", kind: "liability" },
  { key: "dreams", label: "梦想", kind: "dream" }
];
const ideas = [
  "今天最让我开心的一件小事是……",
  "如果用一句话总结今天，我会说……",
  "今天我学到的一件事是……",
  "此刻我最感激的人或事是……",
  "最近反复出现在我脑海里的念头是……"
];

function amount(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export default function CashflowWorkspace({ data, onChange }: { data: AppData; onChange: (data: AppData) => void }) {
  const state = data.cashflow;
  const summary = cashflowSummary(state);
  const [kind, setKind] = useState<ItemKind>("expense");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [secondary, setSecondary] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");
  const [donation, setDonation] = useState("");

  function commit(next: AppData, note: string) {
    next.cashflow.log = [{ id: crypto.randomUUID(), time: new Date().toISOString(), text: note }, ...next.cashflow.log].slice(0, 50);
    onChange(next);
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericValue = Number(value);
    if (!name.trim() || !Number.isFinite(numericValue) || numericValue < 0) return;
    const item: CashflowItem = { id: crypto.randomUUID(), name: name.trim(), amount: numericValue };
    if (kind === "asset") {
      item.cost = numericValue;
      item.cashflow = Math.max(0, Number(secondary) || 0);
    } else if (kind === "dream") {
      item.target = numericValue;
      item.invested = Math.max(0, Number(secondary) || 0);
    }
    const group = groups.find((candidate) => candidate.kind === kind)!;
    const next = structuredClone(data);
    next.cashflow[group.key].unshift(item);
    if (kind === "asset") next.cashflow.cash -= numericValue;
    commit(next, `新增${group.label}：${item.name}`);
    setName("");
    setValue("");
    setSecondary("");
  }

  function updateBasic(field: "cash" | "salary" | "children", raw: string) {
    const next = structuredClone(data);
    next.cashflow[field] = field === "children" ? Math.max(0, Number(raw) || 0) : Number(raw) || 0;
    onChange(next);
  }

  function removeItem(group: ItemGroup, item: CashflowItem) {
    const next = structuredClone(data);
    next.cashflow[group] = next.cashflow[group].filter((candidate) => candidate.id !== item.id);
    if (group === "assets") next.cashflow.cash += item.cost ?? item.amount;
    commit(next, `删除：${item.name}`);
  }

  function updateItem(group: ItemGroup, item: CashflowItem, patch: Partial<CashflowItem>) {
    const next = structuredClone(data);
    const target = next.cashflow[group].find((candidate) => candidate.id === item.id);
    if (!target) return;
    if (group === "assets" && patch.cost !== undefined) next.cashflow.cash += (target.cost ?? target.amount) - patch.cost;
    Object.assign(target, patch);
    if (group === "assets" && patch.cost !== undefined) target.amount = patch.cost;
    if (group === "dreams" && patch.target !== undefined) target.amount = patch.target;
    commit(next, `更新：${item.name}`);
  }

  function sellAsset(item: CashflowItem, raw: string) {
    const salePrice = Number(raw);
    if (!Number.isFinite(salePrice) || salePrice < 0) return;
    const next = structuredClone(data);
    next.cashflow.assets = next.cashflow.assets.filter((candidate) => candidate.id !== item.id);
    next.cashflow.cash += salePrice;
    commit(next, `卖出资产：${item.name}，收入 ${salePrice}`);
  }

  function donate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(donation);
    if (!Number.isFinite(value) || value <= 0) return;
    const next = structuredClone(data);
    next.cashflow.cash -= value;
    commit(next, `慈善捐赠 ${value}`);
    setDonation("");
  }

  function adjustCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const delta = Number(adjustment);
    if (!Number.isFinite(delta) || !reason.trim()) return;
    const next = structuredClone(data);
    next.cashflow.cash += delta;
    commit(next, `现金调整 ${delta >= 0 ? "+" : ""}${delta}：${reason.trim()}`);
    setAdjustment("");
    setReason("");
  }

  function payLiability(item: CashflowItem, raw: string) {
    const paid = Math.min(item.amount, Math.max(0, Number(raw) || 0));
    if (!paid) return;
    const next = structuredClone(data);
    const liability = next.cashflow.liabilities.find((candidate) => candidate.id === item.id);
    if (!liability) return;
    liability.amount -= paid;
    next.cashflow.cash -= paid;
    if (liability.amount <= 0) next.cashflow.liabilities = next.cashflow.liabilities.filter((candidate) => candidate.id !== item.id);
    commit(next, `偿还负债：${item.name} ${paid}`);
  }

  function contributeDream(item: CashflowItem, raw: string) {
    const contributed = Math.max(0, Number(raw) || 0);
    if (!contributed) return;
    const next = structuredClone(data);
    const dream = next.cashflow.dreams.find((candidate) => candidate.id === item.id);
    if (!dream) return;
    dream.invested = (dream.invested ?? 0) + contributed;
    next.cashflow.cash -= contributed;
    commit(next, `梦想投入：${item.name} ${contributed}`);
  }

  return (
    <div className="feature-stack">
      <section className="metric-grid" aria-label="现金流摘要">
        <article className="metric metric-primary"><span>月被动收入</span><strong>¥{amount(summary.passiveIncome)}</strong><small>来自资产现金流</small></article>
        <article className="metric"><span>月总支出</span><strong>¥{amount(summary.expenses)}</strong><small>含每位孩子 ¥300</small></article>
        <article className="metric"><span>净现金流</span><strong className={summary.netCashflow < 0 ? "negative" : ""}>¥{amount(summary.netCashflow)}</strong><small>收入减去支出</small></article>
        <article className="metric"><span>净资产</span><strong>¥{amount(summary.netWorth)}</strong><small>现金 + 资产 - 负债</small></article>
      </section>

      <section className="work-panel freedom-panel">
        <div className="panel-titleline"><div><p className="eyebrow">FINANCIAL INDEPENDENCE</p><h3>财务自由进度</h3></div><strong>{Math.round(summary.freedomRatio * 100)}%</strong></div>
        <div className="progress-track"><span style={{ width: `${summary.freedomRatio * 100}%` }} /></div>
        <p>{summary.isFree ? "被动收入已覆盖当前月支出" : `距离覆盖月支出还差 ¥${amount(Math.max(0, summary.expenses - summary.passiveIncome))}`}</p>
      </section>

      <div className="split-grid">
        <section className="work-panel">
          <div className="panel-titleline"><div><p className="eyebrow">YOUR BALANCE</p><h3>账本基础</h3></div></div>
          <div className="field-grid">
            <label>账本名称<input value={state.profession} onChange={(event) => { const next = structuredClone(data); next.cashflow.profession = event.target.value; onChange(next); }} /></label>
            <label>现金余额<input type="number" value={state.cash} onChange={(event) => updateBasic("cash", event.target.value)} /></label>
            <label>月工资<input type="number" value={state.salary} onChange={(event) => updateBasic("salary", event.target.value)} /></label>
            <label>孩子数量<input min="0" type="number" value={state.children} onChange={(event) => updateBasic("children", event.target.value)} /></label>
          </div>
          <form className="adjust-form" onSubmit={adjustCash}>
            <label>现金变动<input type="number" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="正数增加，负数减少" /></label>
            <label>原因<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：工资到账" /></label>
            <button className="button button-dark" type="submit"><ArrowUpRight size={16} />调整</button>
          </form>
          <form className="adjust-form donation-form" onSubmit={donate}>
            <label>慈善捐赠<input min="0" type="number" value={donation} onChange={(event) => setDonation(event.target.value)} placeholder="捐赠金额" /></label>
            <span className="unit-note">从现金余额中扣除</span>
            <button className="button button-light" type="submit">捐赠</button>
          </form>
        </section>

        <section className="work-panel">
          <div className="panel-titleline"><div><p className="eyebrow">ADD AN ITEM</p><h3>记一笔</h3></div><Plus size={18} /></div>
          <form className="entry-form" onSubmit={addItem}>
            <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>
              <option value="expense">月支出</option><option value="income">额外收入</option><option value="asset">资产</option><option value="liability">负债</option><option value="dream">梦想目标</option>
            </select></label>
            <label>名称<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="名称" /></label>
            <label>{kind === "asset" ? "购买成本" : kind === "dream" ? "目标金额" : "金额"}<input required min="0" type="number" value={value} onChange={(event) => setValue(event.target.value)} /></label>
            {(kind === "asset" || kind === "dream") && <label>{kind === "asset" ? "月现金流" : "已投入"}<input min="0" type="number" value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label>}
            <button className="button button-green" type="submit"><Plus size={16} />加入账本</button>
          </form>
        </section>
      </div>

      <div className="records-grid">
        {groups.map(({ key, label }) => (
          <section className="work-panel record-panel" key={key}>
            <div className="panel-titleline"><div><p className="eyebrow">LEDGER</p><h3>{label}</h3></div><span className="count-badge">{state[key].length}</span></div>
            {state[key].length === 0 ? <p className="empty-note">还没有记录</p> : state[key].map((item) => (
              <CashflowRow key={item.id} group={key} item={item} onDelete={() => removeItem(key, item)} onPay={(value) => payLiability(item, value)} onInvest={(value) => contributeDream(item, value)} onSell={(value) => sellAsset(item, value)} onSave={(patch) => updateItem(key, item, patch)} />
            ))}
          </section>
        ))}
      </div>

      <section className="work-panel log-panel">
        <div className="panel-titleline"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>操作记录</h3></div><span>{state.log.length} / 50</span></div>
        {state.log.length ? state.log.slice(0, 8).map((entry) => <div className="log-row" key={entry.id}><span>{new Date(entry.time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span><p>{entry.text}</p></div>) : <p className="empty-note">操作后会自动记录在这里</p>}
      </section>
    </div>
  );
}

function CashflowRow({ group, item, onDelete, onPay, onInvest, onSell, onSave }: {
  group: ItemGroup;
  item: CashflowItem;
  onDelete: () => void;
  onPay: (value: string) => void;
  onInvest: (value: string) => void;
  onSell: (value: string) => void;
  onSave: (patch: Partial<CashflowItem>) => void;
}) {
  const [transaction, setTransaction] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editAmount, setEditAmount] = useState(String(item.amount));
  const [editSecondary, setEditSecondary] = useState(String(group === "assets" ? item.cashflow ?? 0 : item.invested ?? 0));
  const isAsset = group === "assets";
  const isDream = group === "dreams";
  const isLiability = group === "liabilities";
  const shown = isAsset ? item.cashflow ?? 0 : isDream ? item.target ?? item.amount : item.amount;
  if (editing) return <div className="ledger-edit"><input aria-label="名称" value={editName} onChange={(event) => setEditName(event.target.value)} /><input aria-label="金额" min="0" type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />{(isAsset || isDream) && <input aria-label={isAsset ? "月现金流" : "已投入"} min="0" type="number" value={editSecondary} onChange={(event) => setEditSecondary(event.target.value)} />}<button className="button button-light" onClick={() => { const parsed = Number(editAmount); if (!editName.trim() || !Number.isFinite(parsed) || parsed < 0) return; onSave({ name: editName.trim(), amount: parsed, ...(isAsset ? { cost: parsed, cashflow: Number(editSecondary) || 0 } : {}), ...(isDream ? { target: parsed, invested: Number(editSecondary) || 0 } : {}) }); setEditing(false); }}>保存</button><button className="icon-button" aria-label="取消编辑" onClick={() => setEditing(false)}>×</button></div>;
  return (
    <div className="ledger-row">
      <div className="ledger-copy"><strong>{item.name}</strong><span>{isAsset ? `成本 ¥${amount(item.cost ?? item.amount)} · 月现金流 ¥${amount(shown)}` : isDream ? `已投入 ¥${amount(item.invested ?? 0)} / 目标 ¥${amount(shown)}` : `¥${amount(shown)}${group === "expenses" || group === "extraIncomes" ? " / 月" : ""}`}</span></div>
      <div className="ledger-actions">
        {(isDream || isLiability) && <input aria-label={isDream ? "投入梦想金额" : "偿还负债金额"} className="mini-input" min="0" type="number" value={transaction} onChange={(event) => setTransaction(event.target.value)} />}
        {isDream && <button className="icon-button" aria-label="投入梦想" title="投入梦想" onClick={() => { onInvest(transaction); setTransaction(""); }}><ArrowUpRight size={16} /></button>}
        {isLiability && <button className="icon-button" aria-label="偿还负债" title="偿还负债" onClick={() => { onPay(transaction); setTransaction(""); }}><ArrowDownLeft size={16} /></button>}
        {isAsset && <><input aria-label="卖出价格" className="mini-input" min="0" type="number" placeholder="卖出价" value={transaction} onChange={(event) => setTransaction(event.target.value)} /><button className="icon-button" aria-label="卖出资产" title="卖出资产" onClick={() => { onSell(transaction); setTransaction(""); }}><ArrowDownLeft size={16} /></button></>}
        <button className="icon-button" aria-label={`编辑${item.name}`} title="编辑" onClick={() => setEditing(true)}><Pencil size={15} /></button>
        <button className="icon-button danger-icon" aria-label={`删除${item.name}`} title="删除" onClick={onDelete}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}