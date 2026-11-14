import { useEffect, useRef, useState } from "react";
import { Activity, BookOpen, Check, CircleDollarSign, Cloud, Download, RefreshCw, Settings2, Upload } from "lucide-react";
import CashflowWorkspace from "../features/cashflow/CashflowWorkspace";
import DiaryWorkspace from "../features/diary/DiaryWorkspace";
import HealthWorkspace from "../features/health/HealthWorkspace";
import { createDefaultData } from "../store/defaultData";
import { clearPendingAttachments, finishAttachmentUpload, queueAttachmentDeletion, readLocalData, saveAttachment, writeLocalData } from "../store/db";
import { isOssConfigured } from "../sync/client";
import { bootstrapSync, RemoteVersionConflictError, synchronize, syncAttachment, type ConflictChoice } from "../sync/sync";
import type { AppData, SyncStatus, WorkspaceId } from "../types/models";

const workspaces: Array<{ id: WorkspaceId; label: string; icon: typeof CircleDollarSign }> = [
  { id: "cashflow", label: "现金流", icon: CircleDollarSign },
  { id: "diary", label: "日记", icon: BookOpen },
  { id: "health", label: "健康", icon: Activity }
];

interface ConflictData { local: AppData; remote: AppData; remoteVersion: number }

export default function App() {
  const [active, setActive] = useState<WorkspaceId>("cashflow");
  const [data, setData] = useState<AppData>();
  const [status, setStatus] = useState<SyncStatus>({ phase: "connecting", message: "正在准备本地数据" });
  const [conflict, setConflict] = useState<ConflictData>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dataRef = useRef<AppData>();
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    void startFromRemote().catch((error: unknown) => setStatus({ phase: "error", message: error instanceof Error ? error.message : "无法连接同步服务" }));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function startFromRemote() {
    const local = await readLocalData();
    if (!isOssConfigured()) {
      setData(local);
      dataRef.current = local;
      setStatus({ phase: "setup", message: "OSS 尚未通过 GitHub Actions 构建配置" });
      return;
    }
    setBusy(true);
    setStatus({ phase: "connecting", message: "正在先从 OSS 拉取最新数据…" });
    try {
      const result = await bootstrapSync(local);
      if (result.kind === "conflict") {
        setData(result.local);
        dataRef.current = result.local;
        setConflict({ local: result.local, remote: result.remote, remoteVersion: result.remoteVersion });
        setStatus({ phase: "conflict", message: "检测到本地与云端版本不同，请选择保留哪一份", remoteVersion: result.remoteVersion });
      } else {
        setData(result.data);
        dataRef.current = result.data;
        await writeLocalData(result.data);
        setConflict(undefined);
        setStatus({ phase: "ready", message: `已同步 · 云端版本 ${result.remoteVersion}`, remoteVersion: result.remoteVersion });
      }
    } finally {
      setBusy(false);
    }
  }

  function commitData(next: AppData) {
    revisionRef.current += 1;
    next.dirty = true;
    dataRef.current = next;
    setData(next);
    setStatus({ phase: "dirty", message: "更改已保存在本机，等待同步" });
    void writeLocalData(next).catch(() => setStatus({ phase: "error", message: "本地保存失败，请检查浏览器存储空间" }));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void syncNow(); }, 900);
  }

  async function syncNow(choice?: ConflictChoice) {
    const currentData = dataRef.current;
    if (!isOssConfigured() || !currentData || busy) return;
    const revisionAtStart = revisionRef.current;
    setBusy(true);
    setStatus({ phase: "syncing", message: "正在同步数据与附件…" });
    try {
      const result = await synchronize(currentData, choice);
      if (result.kind === "conflict") {
        setConflict({ local: result.local, remote: result.remote, remoteVersion: result.remoteVersion });
        setStatus({ phase: "conflict", message: "远端数据已变化，请选择冲突处理方式", remoteVersion: result.remoteVersion });
      } else {
        if (revisionRef.current !== revisionAtStart) {
          const latest = dataRef.current;
          if (latest) {
            latest.manifestVersion = result.remoteVersion;
            latest.dirty = true;
            setData(latest);
            await writeLocalData(latest);
            setStatus({ phase: "dirty", message: "新修改已保存在本机，继续同步中" });
            timerRef.current = setTimeout(() => { void syncNow(); }, 250);
          }
        } else {
          dataRef.current = result.data;
          setData(result.data);
          await writeLocalData(result.data);
          setStatus({ phase: "ready", message: `已同步 · 云端版本 ${result.remoteVersion}`, remoteVersion: result.remoteVersion });
        }
        setConflict(undefined);
      }
    } catch (error) {
      if (error instanceof RemoteVersionConflictError) {
        try {
          const latest = dataRef.current;
          if (latest?.dirty) {
            const result = await synchronize(latest);
            if (result.kind === "conflict") {
              setConflict({ local: result.local, remote: result.remote, remoteVersion: result.remoteVersion });
              setStatus({ phase: "conflict", message: "远端数据刚被另一页面或设备更新，请选择保留哪一份", remoteVersion: result.remoteVersion });
              return;
            }
          }
        } catch {
          // Fall through to the original error while preserving the local IndexedDB copy.
        }
      }
      setStatus({ phase: "error", message: error instanceof Error ? error.message : "同步失败，本机数据仍已保存" });
    } finally {
      setBusy(false);
    }
  }

  async function resolveConflict(choice: ConflictChoice) {
    if (!conflict) return;
    if (choice === "use-remote") {
      if (!isOssConfigured()) return;
      setBusy(true);
      try {
        const result = await synchronize(conflict.remote, "use-remote");
        if (result.kind !== "ready") throw new Error("读取最新云端数据失败，请重试");
        dataRef.current = result.data;
        setData(result.data);
        await writeLocalData(result.data);
        setConflict(undefined);
        setStatus({ phase: "ready", message: `已采用云端版本 ${result.remoteVersion}`, remoteVersion: result.remoteVersion });
      } catch (error) {
        setStatus({ phase: "error", message: error instanceof Error ? error.message : "采用云端版本失败" });
      } finally {
        setBusy(false);
      }
    } else {
      await syncNow("overwrite-remote");
    }
  }

  async function addAttachment(key: string, file: File) {
    await saveAttachment(key, file);
    try {
      setStatus({ phase: "syncing", message: "正在上传图片附件…" });
      await syncAttachment(key, file);
      await finishAttachmentUpload(key);
      setStatus({ phase: "ready", message: "图片已同步到 OSS" });
    } catch {
      setStatus({ phase: "dirty", message: "图片暂存在本机，联网后会继续上传" });
    }
  }

  async function deleteAttachment(key: string) {
    await queueAttachmentDeletion(key);
  }

  function exportData() {
    if (!data) return;
    const content = JSON.stringify({ app: "three-in-one-pwa", exportedAt: new Date().toISOString(), data }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `three-in-one-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { data?: AppData };
      const imported = parsed.data;
      if (!imported || imported.schemaVersion !== 1 || !imported.cashflow || !Array.isArray(imported.diary) || !Array.isArray(imported.health)) {
        throw new Error("备份格式无效或版本不兼容");
      }
      imported.dirty = true;
      imported.deviceId = dataRef.current?.deviceId ?? imported.deviceId;
      commitData(imported);
      setNotice("备份已导入本机，并已加入 OSS 同步队列。");
      setSettingsOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function clearAllData() {
    const current = dataRef.current;
    if (!current) return;
    const imageKeys = current.diary.flatMap((entry) => entry.images.map((image) => image.key));
    await Promise.all(imageKeys.map((key) => queueAttachmentDeletion(key)));
    await clearPendingAttachments();
    const cleared = createDefaultData(current.deviceId);
    cleared.manifestVersion = current.manifestVersion;
    cleared.dirty = true;
    setActive("cashflow");
    setSettingsOpen(false);
    commitData(cleared);
    setNotice("已清空本地记录，空数据会作为新版本同步到 OSS。");
  }

  const activeWorkspace = workspaces.find((item) => item.id === active)!;
  const ActiveIcon = activeWorkspace.icon;
  const canEdit = Boolean(data && status.phase !== "connecting" && status.phase !== "conflict" && status.phase !== "error" && status.phase !== "setup");

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="主导航">
        <div className="brand-mark" aria-label="日常管理台">三</div>
        <nav className="rail-nav">
          {workspaces.map(({ id, label, icon: Icon }) => <button aria-current={active === id ? "page" : undefined} aria-label={label} className={`rail-button ${active === id ? "is-active" : ""}`} key={id} onClick={() => setActive(id)} title={label}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>)}
        </nav>
        <button className="rail-button rail-settings" aria-label="设置" title="设置" onClick={() => setSettingsOpen(true)}><Settings2 size={19} strokeWidth={1.8} /><span>设置</span></button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title"><span className="eyebrow">PERSONAL DESK / 01</span><h1>日常管理台</h1></div>
          <button className={`sync-pill sync-${status.phase}`} onClick={() => { if (status.phase === "error" || status.phase === "offline") void startFromRemote(); else if (status.phase === "ready" || status.phase === "dirty") void syncNow(); }} title="查看同步状态"><Cloud size={16} /><span>{status.message}</span>{status.phase === "ready" && <Check size={14} />}</button>
        </header>

        {canEdit && data ? <div className="workspace-content" key={active}>
          <fieldset className="workspace-lock" disabled={busy}>
          <div className="section-heading"><div className="section-icon"><ActiveIcon size={20} /></div><div><p className="eyebrow">YOUR EVERYDAY, ORGANIZED</p><h2>{activeWorkspace.label}</h2></div><div className="heading-actions"><button className="icon-button" aria-label="立即同步" title="立即同步" onClick={() => void syncNow()} disabled={busy}><RefreshCw size={17} /></button><button className="icon-button" aria-label="打开设置" title="设置与备份" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button></div></div>
          {active === "cashflow" && <CashflowWorkspace data={data} onChange={commitData} />}
          {active === "diary" && <DiaryWorkspace data={data} onChange={commitData} onUpload={addAttachment} onDeleteAttachment={deleteAttachment} />}
          {active === "health" && <HealthWorkspace data={data} onChange={commitData} />}
          </fieldset>
        </div> : <Gate status={status} busy={busy} onRetry={() => void startFromRemote()} />}
      </section>

      {conflict && <div className="modal-backdrop"><section className="dialog conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><p className="eyebrow">SYNC CONFLICT · LOCAL {conflict.local.manifestVersion} / REMOTE {conflict.remoteVersion}</p><h2 id="conflict-title">两个设备的数据都发生了变化</h2><p>先选择保留哪一份。覆盖远端会用当前本机的三个工作区数据替换云端版本。</p><div className="dialog-actions"><button className="button button-light" onClick={() => void resolveConflict("use-remote")}>采用云端数据</button><button className="button button-dark" onClick={() => void resolveConflict("overwrite-remote")} disabled={busy}>{busy ? "正在处理…" : "保留本机并覆盖云端"}</button></div></section></div>}
      {settingsOpen && <SettingsDialog busy={busy} hasData={Boolean(data)} onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={(file) => void importData(file)} onClearData={() => void clearAllData()} />}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>关闭</button></div>}
    </main>
  );
}

function Gate({ status, busy, onRetry }: { status: SyncStatus; busy: boolean; onRetry: () => void }) {
  const isSetup = status.phase === "setup";
  return <section className="gate-screen"><div className="gate-symbol"><Cloud size={24} /></div><p className="eyebrow">FIRST, YOUR DATA</p><h2>{isSetup ? "配置 GitHub Actions 的 OSS 凭据" : status.phase === "connecting" ? "正在读取云端数据" : "目前无法加载云端数据"}</h2><p>{isSetup ? "请在 GitHub 仓库的 Actions secrets and variables 中配置 OSS 凭据和 Bucket 信息，然后重新部署。配置完成后，每次打开应用都会先从 OSS 拉取。" : status.message}</p><div className="gate-actions"><button className="button button-dark" disabled={busy} onClick={onRetry}><RefreshCw size={16} />{busy ? "检查中…" : isSetup ? "重新检查配置" : "重新连接"}</button></div><small>远端数据尚未确认前，工作区保持锁定，本机记录不会被覆盖。</small></section>;
}

function SettingsDialog({ busy, hasData, onClose, onExport, onImport, onClearData }: {
  busy: boolean;
  hasData: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearData: () => void;
}) {
  return <div className="modal-backdrop"><section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="dialog-header"><div><p className="eyebrow">LOCAL DATA & BACKUP</p><h2 id="settings-title">设置</h2></div><button className="icon-button" aria-label="关闭设置" onClick={onClose}>×</button></div><p className="settings-note">OSS 连接由 GitHub Actions 构建配置，修改凭据后需重新部署前端。</p><div className="backup-actions"><button className="button button-light" onClick={onExport} disabled={!hasData}><Download size={16} />导出 JSON</button><label className="button button-light"><Upload size={16} />导入 JSON<input accept="application/json,.json" type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} /></label></div><button className="text-danger" disabled={!hasData || busy} onClick={() => { if (window.confirm("这会清空现金流、日记和健康记录，并将空数据同步到云端。建议先导出备份。确定继续吗？")) onClearData(); }}>清空全部记录</button></section></div>;
}