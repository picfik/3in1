import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { CalendarDays, ImagePlus, Lightbulb, Pencil, Search, Trash2, X } from "lucide-react";
import type { AppData, DiaryEntry, DiaryImage } from "../../types/models";
import { localDateKey } from "../../store/defaultData";
import { readAttachment } from "../../store/db";
import { signedAttachmentUrl } from "../../sync/sync";

type UploadFile = (key: string, file: File) => Promise<void>;
const writingIdeas = [
  "今天最让我开心的一件小事是……",
  "如果用一句话总结今天，我会说……",
  "今天我学到的一件事是……",
  "此刻我最感激的人或事是……",
  "最近反复出现在我脑海里的念头是……",
  "今天身体和情绪的状态如何？",
  "写给一年后的自己一句话……"
];

export default function DiaryWorkspace({ data, onChange, onUpload, onDeleteAttachment }: {
  data: AppData;
  onChange: (data: AppData) => void;
  onUpload: UploadFile;
  onDeleteAttachment: (key: string) => Promise<void>;
}) {
  const [date, setDate] = useState(localDateKey());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<DiaryImage[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return data.diary
      .filter((entry) => normalized ? entry.text.toLocaleLowerCase().includes(normalized) : entry.date === date)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [data.diary, date, query]);

  function beginEdit(entry: DiaryEntry) {
    setEditing(entry.id);
    setDate(entry.date);
    setCalendarMonth(new Date(`${entry.date}T12:00:00`));
    setDraft(entry.text);
    setImages(entry.images);
    setQuery("");
  }

  function resetDraft() {
    setEditing(null);
    setDraft("");
    setImages([]);
  }

  function chooseDate(nextDate: string) {
    setDate(nextDate);
    setCalendarMonth(new Date(`${nextDate}T12:00:00`));
    setQuery("");
  }

  function shiftMonth(delta: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function addWritingIdea() {
    const idea = writingIdeas[Math.floor(Math.random() * writingIdeas.length)];
    setDraft((current) => current ? `${current}\n${idea}` : idea);
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (files.some((file) => file.size > 15 * 1024 * 1024)) {
      setUploadError("单张图片不能超过 15 MB。");
      event.target.value = "";
      return;
    }
    if (files.some((file) => !supportedTypes.has(file.type))) {
      setUploadError("图片格式仅支持 JPG、PNG、WebP 和 GIF。");
      event.target.value = "";
      return;
    }
    setUploadError("");
    setBusy(true);
    try {
      const additions: DiaryImage[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60) || "photo";
        const key = `threeinone/attachments/${crypto.randomUUID()}-${safeName}`;
        await onUpload(key, file);
        additions.push({ key, name: file.name, type: file.type });
      }
      setImages((current) => [...current, ...additions]);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function saveEntry() {
    if (!editing && !draft.trim() && !images.length) return;
    const now = new Date().toISOString();
    const next = structuredClone(data);
    if (editing) {
      const previousImages = next.diary.find((entry) => entry.id === editing)?.images ?? [];
      const removedImages = previousImages.filter((image) => !images.some((candidate) => candidate.key === image.key));
      next.diary = next.diary.map((entry) => entry.id === editing ? { ...entry, date, text: draft.trim(), images, updatedAt: now } : entry);
      await Promise.all(removedImages.map((image) => onDeleteAttachment(image.key)));
    } else {
      next.diary.unshift({ id: crypto.randomUUID(), date, text: draft.trim(), images, createdAt: now, updatedAt: now });
    }
    next.dirty = true;
    onChange(next);
    resetDraft();
  }

  async function removeEntry(id: string) {
    const next = structuredClone(data);
    const removedImages = next.diary.find((entry) => entry.id === id)?.images ?? [];
    next.diary = next.diary.filter((entry) => entry.id !== id);
    next.dirty = true;
    await Promise.all(removedImages.map((image) => onDeleteAttachment(image.key)));
    onChange(next);
    if (editing === id) resetDraft();
  }

  const datesWithEntries = new Set(data.diary.map((entry) => entry.date));
  const today = localDateKey();

  return (
    <div className="diary-layout feature-stack">
      <section className="work-panel diary-compose">
        <div className="panel-titleline"><div><p className="eyebrow">A MOMENT, KEPT</p><h3>{editing ? "编辑日记" : "写下今天"}</h3></div><CalendarDays size={18} /></div>
        <div className="diary-controls"><label>日期<input type="date" value={date} onChange={(event) => chooseDate(event.target.value)} /></label><label className="search-field"><Search size={16} /><input placeholder="搜索所有日记" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="diary-editor-tools"><span>一段文字，或几张照片</span><button className="idea-button" onClick={addWritingIdea}><Lightbulb size={14} />给我一个灵感</button></div>
        <textarea className="diary-editor" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="今天有什么值得记下？" rows={5} />
        <div className="image-strip">
          {images.map((image) => <div className="image-chip" key={image.key}><DiaryImageView image={image} /><span title={image.name}>{image.name}</span><button aria-label={`移除${image.name}`} onClick={() => setImages((current) => current.filter((candidate) => candidate.key !== image.key))}><X size={14} /></button></div>)}
        </div>
        <div className="diary-actions">
          <label className="button button-light upload-button"><ImagePlus size={16} />{busy ? "上传中…" : "添加图片"}<input accept="image/jpeg,image/png,image/webp,image/gif" multiple type="file" onChange={addFiles} disabled={busy} /></label>
          {editing && <button className="button button-light" onClick={resetDraft}>取消编辑</button>}
          <button className="button button-green" onClick={() => void saveEntry()} disabled={busy || (!editing && !draft.trim() && !images.length)}>{editing ? "保存修改" : "保存日记"}</button>
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
      </section>

      <section className="diary-list-area">
        <div className="list-heading"><div className="diary-calendar-header"><div><p className="eyebrow">{query ? "SEARCH RESULTS" : date === today ? "TODAY" : date}</p><h3>{query ? `找到 ${entries.length} 条` : `${date} 的记录`}</h3></div><div className="month-controls"><button className="icon-button" aria-label="上个月" onClick={() => shiftMonth(-1)}>‹</button><strong>{calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月</strong><button className="icon-button" aria-label="下个月" onClick={() => shiftMonth(1)}>›</button><button className="button button-light" onClick={() => chooseDate(today)}>今天</button></div></div><div className="month-calendar" aria-label="日记月历">
          {"日一二三四五六".split("").map((weekday) => <span className="weekday-label" key={weekday}>{weekday}</span>)}
          {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}
          {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
            const day = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1);
            const key = localDateKey(day);
            return <button aria-pressed={date === key && !query} className={`${date === key && !query ? "selected" : ""} ${key === today ? "today" : ""}`} key={key} onClick={() => chooseDate(key)}><strong>{day.getDate()}</strong><i className={datesWithEntries.has(key) ? "has-entry" : ""} /></button>;
          })}
        </div></div>
        {entries.length ? <div className="diary-entry-list">{entries.map((entry) => <article className="diary-entry" key={entry.id}>
          <div className="diary-entry-meta"><time>{new Date(entry.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time><span>{entry.date}</span><div className="entry-tools"><button className="icon-button" aria-label="编辑日记" onClick={() => beginEdit(entry)}><Pencil size={15} /></button><button className="icon-button danger-icon" aria-label="删除日记" onClick={() => void removeEntry(entry.id)}><Trash2 size={15} /></button></div></div>
          {entry.text && <p className="diary-entry-text">{entry.text}</p>}
          {!!entry.images.length && <div className="diary-photo-grid">{entry.images.map((image) => <DiaryImageView image={image} key={image.key} />)}</div>}
        </article>)}</div> : <div className="empty-state"><span>01 / 07</span><p>{query ? "没有匹配的日记" : "这一天还没有记录"}</p></div>}
      </section>
    </div>
  );
}

function DiaryImageView({ image }: { image: DiaryImage }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void readAttachment(image.key).then(async (blob) => {
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        if (active) setSource(objectUrl);
      } else {
        const url = await signedAttachmentUrl(image.key);
        if (active) setSource(url);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.key]);
  if (!source) return <div className="photo-loading" aria-label="图片加载中" />;
  return <img src={source} alt={image.name} loading="lazy" />;
}