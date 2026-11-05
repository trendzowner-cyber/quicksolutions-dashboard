"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, UserPlus, Shield, CheckCircle2, XCircle, Crown, Users } from "lucide-react";

interface UserData {
  id: string; name: string; username: string; email: string;
  role: string; status: string; groupId: string | null; lastLoginAt: string | null; createdAt: string;
}

interface GroupInfo {
  id: string; name: string; sortOrder: number; active: boolean; leadUserId: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", admin: "Admin", marketer: "Marketeer",
  content_manager: "Content Manager", sales: "Sales", analyst: "Analist", viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  admin: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  marketer: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  content_manager: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  sales: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  analyst: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  viewer: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [creating, setCreating] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);

  const load = useCallback(async () => {
    try {
      const [meRes, usersRes, groupsRes] = await Promise.all([
        fetch("/api/auth/me").then(r => r.json()),
        fetch("/api/users").then(r => r.json()),
        fetch("/api/reviews/groups", { cache: "no-store" }).then(r => r.json()),
      ]);
      if (meRes.user) setCurrentUser(meRes.user);
      setUsers(usersRes.users || []);
      if (groupsRes.mode === "admin" && Array.isArray(groupsRes.groups)) {
        setGroups(groupsRes.groups);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Fout bij aanmaken");
        return;
      }
      toast.success("Gebruiker aangemaakt");
      setShowCreate(false);
      setName(""); setUsername(""); setEmail(""); setPassword(""); setRole("viewer");
      load();
    } catch { toast.error("Verbindingsfout"); }
    finally { setCreating(false); }
  }

  async function toggleStatus(user: UserData) {
    const newStatus = user.status === "active" ? "disabled" : "active";
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { toast.error("Fout bij wijzigen status"); return; }
      toast.success(newStatus === "active" ? "Gebruiker actief" : "Gebruiker uitgeschakeld");
      load();
    } catch { toast.error("Verbindingsfout"); }
  }

  async function assignGroup(userId: string, groupId: string) {
    try {
      const res = await fetch("/api/reviews/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", userId, groupId: groupId || null }),
      });
      if (!res.ok) { toast.error("Fout bij teamindeling"); return; }
      toast.success("Team bijgewerkt");
      load();
    } catch { toast.error("Verbindingsfout"); }
  }

  async function setLead(groupId: string, userId: string) {
    try {
      const res = await fetch("/api/reviews/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setLead", groupId, userId: userId || null }),
      });
      if (!res.ok) { toast.error("Fout bij lead instellen"); return; }
      toast.success("Lead bijgewerkt");
      load();
    } catch { toast.error("Verbindingsfout"); }
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-20 w-full rounded-xl"/>)}</div>;
  }

  const canManage = currentUser && (currentUser.role === "owner" || currentUser.role === "admin");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm">Gebruikersbeheer & toegangsrechten</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4"/> Gebruiker Toevoegen
          </Button>
        )}
      </div>

      {/* Teams & rotatie — wie zit in welk team, wie is lead */}
      {canManage && groups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map(g => (
            <Card key={g.id} className="border-border">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground"/>{g.name}
                  </p>
                  {g.active && (
                    <Badge className="text-[10px] border bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Aan de beurt deze week
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Teamlead (ziet het teamoverzicht)</Label>
                  <Select value={g.leadUserId ?? "none"} onValueChange={(v) => setLead(g.id, v && v !== "none" ? v : "")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— geen lead —</SelectItem>
                      {users.filter(u => u.status === "active").map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-3">
        {users.map(user => {
          const leadGroup = groups.find(g => g.leadUserId === user.id);
          return (
          <Card key={user.id} className="border-border">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <span className="text-sm font-semibold">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge className={`text-[10px] border ${ROLE_COLORS[user.role] || "bg-muted"}`}>
                      <Shield className="h-2.5 w-2.5 mr-1"/>{ROLE_LABELS[user.role] || user.role}
                    </Badge>
                    <Badge variant={user.status === "active" ? "default" : "destructive"} className="text-[10px] gap-1">
                      {user.status === "active" ? <CheckCircle2 className="h-2.5 w-2.5"/> : <XCircle className="h-2.5 w-2.5"/>}
                      {user.status === "active" ? "Actief" : "Uitgeschakeld"}
                    </Badge>
                    {leadGroup && (
                      <Badge className="text-[10px] border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                        <Crown className="h-2.5 w-2.5"/>{leadGroup.name} lead
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {user.lastLoginAt && <span>Laatste login: {new Date(user.lastLoginAt).toLocaleDateString("nl-BE")}</span>}
                {canManage && user.role !== "owner" && (
                  <Select value={user.groupId ?? "none"} onValueChange={(v) => assignGroup(user.id, v && v !== "none" ? v : "")}>
                    <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Team"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— geen team —</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {canManage && user.role !== "owner" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggleStatus(user)}>
                    {user.status === "active" ? "Uitschakelen" : "Activeren"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gebruiker Toevoegen</DialogTitle></DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Naam</Label><Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="Jan Janssen"/></div>
            <div className="space-y-2"><Label htmlFor="username">Gebruikersnaam</Label><Input id="username" value={username} onChange={e => setUsername(e.target.value)} required placeholder="jan"/></div>
            <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="jan@email.com"/></div>
            <div className="space-y-2"><Label htmlFor="password">Wachtwoord</Label><Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 karakters" minLength={8}/></div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full gap-1.5" disabled={creating}>
              {creating ? "Aanmaken..." : <><Plus className="h-4 w-4"/> Gebruiker Aanmaken</>}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
