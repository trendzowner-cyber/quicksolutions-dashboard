"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Check, Clock, Play, Pause, Timer, Calendar, Eye, EyeOff, LogIn, LogOut,
  Wrench, ShoppingBag, Store, Globe, FileText, Sparkles, ChevronRight
} from "lucide-react";

// ─── Types ───
interface TimeLog { start: string; end?: string; duration?: number; }
interface Task {
  id: string; title: string; category: string; status: "todo" | "in_progress" | "done";
  timeLogs: TimeLog[]; createdAt: string; completedAt?: string; date: string;
}
interface Session { start: string; end?: string; }
interface TaskData { tasks: Task[]; sessions: Session[]; }

// ─── Helpers ───
function fmtDur(ms: number): string {
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
}
function today(): string { return new Date().toISOString().slice(0, 10); }

// ─── Constants ───
const CATS = [
  { key: "google-ads-repair", label: "Google Ads Repair", icon: Wrench, color: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20" },
  { key: "google-ads-shopping", label: "Google Ads Shopping", icon: ShoppingBag, color: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20" },
  { key: "google-merchant", label: "Google Merchant Center", icon: Store, color: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  { key: "website", label: "Website", icon: Globe, color: "text-violet-400", bg: "bg-violet-500/10", ring: "ring-violet-500/20" },
  { key: "blog", label: "Blog", icon: FileText, color: "text-rose-400", bg: "bg-rose-500/10", ring: "ring-rose-500/20" },
];

// ─── Component ───
export default function TakenPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TaskData>({ tasks: [], sessions: [] });
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState(CATS[0].key);
  const [showAdd, setShowAdd] = useState(false);
  const [showTimes, setShowTimes] = useState(true);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"board" | "calendar">("board");
  const [customCats, setCustomCats] = useState<Array<{key:string;label:string}>>([]);
  const [newCustomCat, setNewCustomCat] = useState("");
  const [_, setTick] = useState(0);

  // Auth check
  useEffect(() => { fetch("/api/auth/me").then(r => r.json()).then(d => setIsAdmin(d.role === "admin")).catch(() => {}); }, []);
  // Load
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch("/api/tasks"); setData(await r.json()); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  // Timer tick
  useEffect(() => { if (!activeTask) return; const i = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(i); }, [activeTask]);

  async function save(d: TaskData) {
    if (!isAdmin) return;
    try { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); } catch { toast.error("Opslaan mislukt"); }
  }

  // ─── Session ───
  const activeSession = data.sessions?.find(s => !s.end);
  function startSession() {
    const s: Session = { start: new Date().toISOString() };
    const updated = { ...data, sessions: [...(data.sessions || []), s] };
    setData(updated); save(updated);
    toast.success("Sessie gestart — " + fmtTime(s.start));
  }
  function endSession() {
    if (!activeSession) return;
    activeSession.end = new Date().toISOString();
    const updated = { ...data, sessions: [...(data.sessions || [])] };
    setData(updated); save(updated);
    const dur = new Date(activeSession.end).getTime() - new Date(activeSession.start).getTime();
    toast.success("Sessie beëindigd — " + fmtDur(dur));
    if (activeTask) toggleTimer(activeTask);
  }

  // ─── Tasks ───
  function addTask() {
    if (!newTitle.trim()) return;
    const task: Task = { id: Date.now().toString(), title: newTitle.trim(), category: newCat, status: "todo", timeLogs: [], createdAt: new Date().toISOString(), date: today() };
    const updated = { ...data, tasks: [...data.tasks, task] };
    setData(updated); save(updated); setNewTitle(""); setShowAdd(false);
    toast.success("Taak toegevoegd");
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
    const task = data.tasks.find(t => t.id === id);
    if (!task) return;
    if (activeTask === id) {
      const lastLog = task.timeLogs[task.timeLogs.length - 1];
      if (lastLog && !lastLog.end) {
        lastLog.end = new Date().toISOString();
        lastLog.duration = new Date(lastLog.end).getTime() - new Date(lastLog.start).getTime();
      }
      updateTask(id, { timeLogs: [...task.timeLogs] });
      setActiveTask(null);
    } else {
      if (activeTask) toggleTimer(activeTask);
      task.timeLogs.push({ start: new Date().toISOString() });
      updateTask(id, { timeLogs: [...task.timeLogs] });
      setActiveTask(id);
      toast.success("Timer: " + task.title);
    }
  }
  function addCustomCat() {
    if (!newCustomCat.trim()) return;
    const key = newCustomCat.trim().toLowerCase().replace(/\s+/g, "-");
    setCustomCats([...customCats, { key, label: newCustomCat.trim() }]);
    setNewCat(key); setNewCustomCat("");
  }

  const allCats = [...CATS, ...customCats];
  const todayTasks = data.tasks.filter(t => t.date === today());
  const totalTodayMs = todayTasks.reduce((s, t) => s + t.timeLogs.reduce((ss, l) => ss + (l.duration || 0), 0), 0);
  const openCount = data.tasks.filter(t => t.status !== "done").length;
  const doneCount = data.tasks.filter(t => t.status === "done").length;
  const grouped = allCats.map(c => ({ ...c, tasks: data.tasks.filter(t => t.category === c.key) }));

  if (loading) return <div className="space-y-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24 w-full rounded-xl"/>)}</div>;

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
          <p className="text-muted-foreground text-sm">{isAdmin ? "Project management & time tracking" : "Werkoverzicht"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Session control */}
          {isAdmin && (
            <div className="flex items-center gap-2 mr-2">
              {activeSession ? (
                <div className="flex items-center gap-2">
                  <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
                    <span className="text-xs">{fmtTime(activeSession.start)}</span>
                  </Badge>
                  <Button size="sm" variant="outline" onClick={endSession} className="h-8 gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10">
                    <LogOut className="h-3.5 w-3.5"/> Stop
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={startSession} className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  <LogIn className="h-3.5 w-3.5"/> Start Sessie
                </Button>
              )}
            </div>
          )}
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg border border-border p-0.5">
            <Button size="sm" variant={viewMode==="board"?"default":"ghost"} className="h-7 text-xs" onClick={()=>setViewMode("board")}>Board</Button>
            <Button size="sm" variant={viewMode==="calendar"?"default":"ghost"} className="h-7 text-xs gap-1" onClick={()=>setViewMode("calendar")}><Calendar className="h-3 w-3"/>Kalender</Button>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={()=>setShowTimes(!showTimes)}>
            {showTimes ? <Eye className="h-3 w-3"/> : <EyeOff className="h-3 w-3"/>}
            {showTimes ? "Tijden" : "Tijden"}
          </Button>
        </div>
      </div>

      {/* ═══ SESSION HISTORY ═══ */}
      {data.sessions && data.sessions.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {data.sessions.slice(-5).map((s, i) => {
            const dur = s.end ? new Date(s.end).getTime() - new Date(s.start).getTime() : 0;
            return (
              <span key={i} className="px-2 py-1 rounded-lg bg-muted/30 border border-border/50">
                {fmtDate(s.start)} {fmtTime(s.start)} — {s.end ? fmtTime(s.end) : "actief"}
                {s.end && <span className="ml-1 text-muted-foreground">({fmtDur(dur)})</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* ═══ KPI ROW ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Vandaag", value: todayTasks.length + " taken", sub: showTimes ? fmtDur(totalTodayMs) : undefined, color: "from-blue-500/5 to-cyan-500/5 border-blue-500/10" },
          { label: "Open", value: openCount, sub: "actieve taken", color: "from-amber-500/5 to-orange-500/5 border-amber-500/10" },
          { label: "Afgerond", value: doneCount, sub: "voltooide taken", color: "from-emerald-500/5 to-teal-500/5 border-emerald-500/10" },
          { label: "Sessies", value: (data.sessions?.length || 0), sub: activeSession ? "actief" : "inactief", color: "from-violet-500/5 to-purple-500/5 border-violet-500/10" },
        ].map(s => (
          <div key={s.label} className={cn("rounded-xl border p-3.5 bg-gradient-to-br", s.color)}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="text-xl font-bold">{s.value}</p>
              {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ ADMIN CONTROLS ═══ */}
      {isAdmin && (
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5"><Plus className="h-4 w-4"/>Taak</Button>
          {showAdd && (
            <div className="flex gap-2 flex-wrap items-center">
              <Input placeholder="Titel..." value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter"&&addTask()} className="h-8 w-44 text-sm"/>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} className="text-xs h-8 bg-muted/50 border border-border rounded-lg px-2 outline-none">
                {allCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <Input placeholder="Nieuwe categorie" value={newCustomCat} onChange={e => setNewCustomCat(e.target.value)} onKeyDown={e => e.key==="Enter"&&addCustomCat()} className="h-8 w-36 text-xs"/>
              <Button size="sm" onClick={addTask} className="h-8">Toevoegen</Button>
            </div>
          )}
        </div>
      )}

      {/* ═══ BOARD VIEW ═══ */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(({ key, label, icon: Icon, color, bg, ring, tasks }) => {
            const catTimeMs = tasks.reduce((s, t) => s + t.timeLogs.reduce((ss, l) => ss + (l.duration || 0), 0), 0);
            return (
              <Card key={key} className="border-border overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg ring-1", bg, ring)}>
                        <Icon className={cn("h-3.5 w-3.5", color)}/>
                      </div>
                      {label}
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
                  </div>
                  {showTimes && catTimeMs > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 ml-9 flex items-center gap-1"><Timer className="h-3 w-3"/>{fmtDur(catTimeMs)}</p>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="p-2 space-y-2 max-h-[320px] overflow-y-auto">
                  {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Geen taken</p>}
                  {(["todo","in_progress","done"] as const).map(status => {
                    const st = tasks.filter(t => t.status === status);
                    if (st.length === 0) return null;
                    return (
                      <div key={status}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1 pb-0.5 font-medium">
                          {status === "todo" ? "Te doen" : status === "in_progress" ? "Bezig" : "Afgerond"}
                        </p>
                        {st.map(task => {
                          const tMs = task.timeLogs.reduce((s, l) => s + (l.duration || 0), 0);
                          return (
                            <div key={task.id} className={cn(
                              "group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all",
                              "hover:bg-muted/50",
                              activeTask === task.id && "bg-emerald-500/5 ring-1 ring-emerald-500/20",
                              task.status === "done" && "opacity-60"
                            )}>
                              <span className="text-xs truncate flex-1">{task.title}</span>
                              {showTimes && tMs > 0 && <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{fmtDur(tMs)}</span>}
                              {isAdmin && (
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  {task.status !== "done" && (
                                    <button onClick={() => updateTask(task.id, { status: "done", completedAt: new Date().toISOString() })} className="p-0.5 hover:bg-emerald-500/10 rounded"><Check className="h-3 w-3 text-emerald-400"/></button>
                                  )}
                                  {task.status === "todo" && (
                                    <button onClick={() => updateTask(task.id, { status: "in_progress" })} className="p-0.5 hover:bg-blue-500/10 rounded"><Play className="h-3 w-3 text-blue-400"/></button>
                                  )}
                                  <button onClick={() => toggleTimer(task.id)} className={cn("p-0.5 hover:bg-muted rounded", activeTask===task.id && "text-emerald-400")}>
                                    {activeTask===task.id ? <Pause className="h-3 w-3"/> : <Clock className="h-3 w-3"/>}
                                  </button>
                                  <button onClick={() => deleteTask(task.id)} className="p-0.5 hover:bg-rose-500/10 rounded"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-rose-400"/></button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══ CALENDAR VIEW ═══ */}
      {viewMode === "calendar" && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-4">
            <p className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4"/>Activiteiten</p>
            {(() => {
              const logs = data.tasks
                .filter(t => t.timeLogs.length > 0)
                .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 40);
              if (logs.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nog geen activiteit</p>;
              return logs.map(task => {
                const tMs = task.timeLogs.reduce((s, l) => s + (l.duration || 0), 0);
                const cat = allCats.find(c => c.key === task.category);
                return (
                  <div key={task.id} className="flex items-center justify-between border-b border-border/30 pb-2 text-sm">
                    <div className="flex items-center gap-2">
                      {cat && <div className={cn("flex h-5 w-5 items-center justify-center rounded", cat.bg)}><cat.icon className={cn("h-3 w-3", cat.color)}/></div>}
                      <div>
                        <p className="font-medium text-xs">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground">{cat?.label} — {fmtDate(task.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={task.status==="done"?"default":"secondary"} className="text-[10px]">{task.status==="done"?"Klaar":"Open"}</Badge>
                      {showTimes && task.timeLogs.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {task.timeLogs.map((l,i) => <span key={i} className="block">{fmtTime(l.start)}{l.end?"→"+fmtTime(l.end)+" ("+fmtDur(l.duration||0)+")":"→ ..."}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
