"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Check, Clock, Play, Pause, Timer, Calendar, Eye, EyeOff,
  Wrench, ShoppingBag, Store, Globe, FileText, Sparkles
} from "lucide-react";

interface Task {
  id: string; title: string; category: string; status: "todo" | "in_progress" | "done";
  timeLogs: Array<{ start: string; end?: string; duration?: number }>;
  createdAt: string; completedAt?: string;
}
interface TaskData { tasks: Task[]; sessions: Array<{start:string;end?:string}>; defaultCategories: string[]; }

const DEFAULT_CATS = ["Google Ads Repair", "Google Ads Shopping", "Google Merchant Center", "Website", "Blog"];
const CAT_ICONS: Record<string, typeof Wrench> = {
  "Google Ads Repair": Wrench, "Google Ads Shopping": ShoppingBag,
  "Google Merchant Center": Store, Website: Globe, Blog: FileText,
};
const CAT_COLORS: Record<string, string> = {
  "Google Ads Repair": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Google Ads Shopping": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Google Merchant Center": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Website: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Blog: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};
const STATUS_LABELS: Record<string, string> = { todo: "Te doen", in_progress: "Bezig", done: "Afgerond" };

function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

function TaskRow({ task, isAdmin, showTimes, activeTask, onUpdate, onDelete, onToggleTimer }: {
  task: Task; isAdmin: boolean; showTimes: boolean; activeTask: string | null;
  onUpdate: (id: string, u: Partial<Task>) => void; onDelete: (id: string) => void;
  onToggleTimer: (id: string) => void;
}) {
  const totalMs = task.timeLogs.reduce((s, l) => s + (l.duration || 0), 0);
  return (
    <div className={cn(
      "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-150 hover:bg-muted/50",
      activeTask === task.id && "bg-emerald-500/5 ring-1 ring-emerald-500/20",
      task.status === "done" && "opacity-60"
    )}>
      <span className="text-xs truncate flex-1">{task.title}</span>
      {showTimes && totalMs > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDuration(totalMs)}</span>
      )}
      {isAdmin && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {task.status !== "done" && (
            <button onClick={() => onUpdate(task.id, { status: "done", completedAt: new Date().toISOString() })}
              className="p-0.5 hover:bg-emerald-500/10 rounded"><Check className="h-3 w-3 text-emerald-400"/></button>
          )}
          {task.status === "todo" && (
            <button onClick={() => onUpdate(task.id, { status: "in_progress" })}
              className="p-0.5 hover:bg-blue-500/10 rounded"><Play className="h-3 w-3 text-blue-400"/></button>
          )}
          <button onClick={() => onToggleTimer(task.id)}
            className={cn("p-0.5 hover:bg-muted rounded", activeTask===task.id && "text-emerald-400")}>
            {activeTask===task.id ? <Pause className="h-3 w-3"/> : <Clock className="h-3 w-3"/>}
          </button>
          <button onClick={() => onDelete(task.id)}
            className="p-0.5 hover:bg-rose-500/10 rounded"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-rose-400"/></button>
        </div>
      )}
    </div>
  );
}

export default function TakenPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TaskData>({ tasks: [], sessions: [], defaultCategories: DEFAULT_CATS });
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState(DEFAULT_CATS[0]);
  const [showAdd, setShowAdd] = useState(false);
  const [showTimes, setShowTimes] = useState(true);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"board" | "calendar">("board");
  const [customCat, setCustomCat] = useState("");
  const [customCats, setCustomCats] = useState<string[]>([]);

  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => setIsAdmin(d.role === "admin")).catch(() => {}); }, []);
  async function load() { setLoading(true); try { const r = await fetch("/api/tasks"); setData(await r.json()); } catch {} finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!activeTask) return; const i = setInterval(() => setTimerTick(t => t + 1), 10000); return () => clearInterval(i); }, [activeTask]);
  const [timerTick, setTimerTick] = useState(0);

  async function save(d: TaskData) {
    if (!isAdmin) return;
    try { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); } catch { toast.error("Fout bij opslaan"); }
  }

  function addTask() {
    if (!newTitle.trim()) return;
    const task: Task = { id: Date.now().toString(), title: newTitle.trim(), category: newCat, status: "todo", timeLogs: [], createdAt: new Date().toISOString() };
    const updated = { ...data, tasks: [...data.tasks, task] };
    setData(updated); save(updated); setNewTitle(""); setShowAdd(false); toast.success("Taak toegevoegd");
  }

  function updateTask(id: string, updates: Partial<Task>) {
    const updated = { ...data, tasks: data.tasks.map(t => t.id === id ? { ...t, ...updates } : t) };
    setData(updated); save(updated);
  }

  function deleteTask(id: string) {
    const updated = { ...data, tasks: data.tasks.filter(t => t.id !== id) };
    setData(updated); save(updated);
  }

  function toggleTimer(id: string) {
    if (activeTask === id) {
      const task = data.tasks.find(t => t.id === id);
      if (!task) return;
      const lastLog = task.timeLogs[task.timeLogs.length - 1];
      if (lastLog && !lastLog.end) {
        lastLog.end = new Date().toISOString();
        lastLog.duration = new Date(lastLog.end).getTime() - new Date(lastLog.start).getTime();
      }
      updateTask(id, { timeLogs: [...task.timeLogs] });
      setActiveTask(null);
    } else {
      if (activeTask) toggleTimer(activeTask);
      const task = data.tasks.find(t => t.id === id);
      if (!task) return;
      task.timeLogs.push({ start: new Date().toISOString() });
      updateTask(id, { timeLogs: [...task.timeLogs] });
      setActiveTask(id);
      toast.success("Timer gestart");
    }
  }

  function addCustomCat() {
    if (!customCat.trim()) return;
    setCustomCats([...customCats, customCat.trim()]);
    setNewCat(customCat.trim());
    setCustomCat("");
  }

  const allCats = [...DEFAULT_CATS, ...customCats];
  const groupedTasks = allCats.map(cat => ({ cat, tasks: data.tasks.filter(t => t.category === cat) }));
  const totalToday = data.tasks.reduce((s, t) => s + t.timeLogs.reduce((ss, l) => ss + (l.duration || 0), 0), 0);
  const todayTasks = data.tasks.filter(t => t.timeLogs.some(l => new Date(l.start).toDateString() === new Date().toDateString()));
  const todaySession = data.sessions?.find(s => !s.end);

  if (loading) return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-32 w-full rounded-xl"/>)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
          <p className="text-muted-foreground text-sm">{isAdmin ? "Werk tracker & time logger" : "Werk overzicht — read-only"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg border border-border p-0.5">
            <Button size="sm" variant={viewMode==="board"?"default":"ghost"} className="h-7 text-xs" onClick={()=>setViewMode("board")}>Board</Button>
            <Button size="sm" variant={viewMode==="calendar"?"default":"ghost"} className="h-7 text-xs" onClick={()=>setViewMode("calendar")}>
              <Calendar className="h-3 w-3 mr-1"/>Kalender
            </Button>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={()=>setShowTimes(!showTimes)}>
            {showTimes ? <Eye className="h-3 w-3"/> : <EyeOff className="h-3 w-3"/>}
            {showTimes ? "Tijden aan" : "Tijden uit"}
          </Button>
          {todaySession && (
            <Badge className="gap-1 bg-emerald-500/10 text-emerald-400 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>Actief
            </Badge>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Taken vandaag", value: todayTasks.length, color: "from-blue-500/10 to-cyan-500/5" },
          { label: "Tijd vandaag", value: fmtDuration(totalToday), color: "from-violet-500/10 to-purple-500/5" },
          { label: "Open taken", value: data.tasks.filter(t=>t.status!=="done").length, color: "from-amber-500/10 to-orange-500/5" },
          { label: "Afgerond", value: data.tasks.filter(t=>t.status==="done").length, color: "from-emerald-500/10 to-teal-500/5" },
        ].map(s => (
          <div key={s.label} className={cn("rounded-xl border border-border/50 p-3 bg-gradient-to-br", s.color)}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1"><Plus className="h-4 w-4"/> Nieuwe taak</Button>
          {showAdd && (
            <>
              <Input placeholder="Taak titel..." value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter"&&addTask()} className="h-8 w-48 text-sm"/>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} className="text-xs h-8 bg-muted/50 border border-border rounded-lg px-2">
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input placeholder="+ categorie" value={customCat} onChange={e => setCustomCat(e.target.value)} onKeyDown={e => e.key==="Enter"&&addCustomCat()} className="h-8 w-32 text-xs"/>
              <Button size="sm" onClick={addTask} className="h-8">Toevoegen</Button>
            </>
          )}
        </div>
      )}

      {/* Board View */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {groupedTasks.map(({ cat, tasks }) => {
            const Icon = CAT_ICONS[cat] || Sparkles;
            const catColor = CAT_COLORS[cat] || "bg-gray-500/10 text-gray-400 border-gray-500/20";
            const catTime = tasks.reduce((s, t) => s + t.timeLogs.reduce((ss, l) => ss + (l.duration || 0), 0), 0);
            return (
              <Card key={cat} className="border-border overflow-hidden">
                <CardHeader className={cn("pb-3 border-b", catColor)}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4"/>{cat}</CardTitle>
                    <span className="text-[10px] text-muted-foreground">{tasks.length} taken</span>
                  </div>
                  {showTimes && catTime > 0 && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Timer className="h-2.5 w-2.5"/> {fmtDuration(catTime)} totaal</p>}
                </CardHeader>
                <CardContent className="p-2 space-y-1 max-h-[350px] overflow-y-auto">
                  {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Geen taken</p>}
                  {(["todo","in_progress","done"] as const).map(status => {
                    const stasks = tasks.filter(t => t.status === status);
                    if (stasks.length === 0) return null;
                    return (
                      <div key={status} className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-2 font-medium">{STATUS_LABELS[status]}</p>
                        {stasks.map(task => (
                          <TaskRow key={task.id} task={task} isAdmin={isAdmin} showTimes={showTimes}
                            activeTask={activeTask} onUpdate={updateTask} onDelete={deleteTask} onToggleTimer={toggleTimer}/>
                        ))}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-sm font-medium flex items-center gap-2 mb-4"><Calendar className="h-4 w-4"/>Activiteitenlog</p>
            <div className="space-y-3">
              {data.tasks.filter(t => t.timeLogs.length > 0).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 30).map(task => (
                <div key={task.id} className="flex items-start justify-between border-b border-border/30 pb-2 text-sm">
                  <div>
                    <p className="font-medium text-xs">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground">{task.category} — {new Date(task.createdAt).toLocaleDateString("nl-BE")}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={task.status==="done"?"default":"secondary"} className="text-[10px]">{STATUS_LABELS[task.status]}</Badge>
                    {showTimes && task.timeLogs.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {task.timeLogs.map((l,i) => (
                          <span key={i}>{i>0&&", "}{new Date(l.start).toLocaleTimeString("nl-BE",{hour:"2-digit",minute:"2-digit"})}{l.end?" → "+new Date(l.end).toLocaleTimeString("nl-BE",{hour:"2-digit",minute:"2-digit"}):" → ..."}</span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {data.tasks.filter(t => t.timeLogs.length > 0).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nog geen tijdsregistraties</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
