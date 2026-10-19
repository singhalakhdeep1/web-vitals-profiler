/**
 * Team dashboards: a named set of pages whose field data (samples from every member's browser) is shown together.
 * Members are invited by e-mail; someone without an account joins automatically when they register.
 */
import { overallRating, p75ByMetric, rate, type Metric } from "@wvp/core";
import type { PublicUser, UserDoc } from "../auth";
import type { Deps } from "../deps";
import { email as emailOf, HttpError, httpUrl, json, newId, oneOf, str, type Router } from "../http";
import { DAY, samplesForUrl, toSample } from "../samples";
import { ownUser } from "./vitals";

type Role = "owner" | "admin" | "member" | "viewer";

interface Member {
  id: string;
  userId?: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
  joinedAt: number;
}

interface DashboardDoc {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  isPublic: boolean;
  urls: string[];
  members: Member[];
  /** Active members' user ids (for "dashboards I belong to" queries). */
  memberIds: string[];
  invitedEmails: string[];
  createdAt: number;
}

const view = (d: DashboardDoc) => ({ id: d.id, name: d.name, description: d.description, isPublic: d.isPublic, urls: d.urls, createdAt: d.createdAt, ownerId: d.ownerId, members: d.members });

function roleOf(d: DashboardDoc, userId: string): Role | null {
  return d.members.find((m) => m.userId === userId && m.status === "active")?.role ?? null;
}

async function load(deps: Deps, id: string, userId: string, need: "view" | "manage"): Promise<DashboardDoc> {
  const d = await deps.store.get<DashboardDoc>("dashboards", id);
  const role = d ? roleOf(d, userId) : null;
  if (!d || !role) throw new HttpError(404, "Dashboard not found", "not_found");
  if (need === "manage" && role !== "owner" && role !== "admin") throw new HttpError(403, "Only the owner or an admin can do this", "forbidden");
  return d;
}

/** Field data for the dashboard's pages from all active members over `days`. */
async function summary(deps: Deps, d: DashboardDoc, days: number) {
  const since = Date.now() - days * DAY;
  const pages = [];
  for (const url of d.urls) {
    const rows = (await samplesForUrl(deps, url, since, d.memberIds)).map(toSample);
    const p75 = p75ByMetric(rows);
    pages.push({
      url,
      samples: rows.length,
      rating: rows.length ? overallRating(p75) : null,
      metrics: Object.fromEntries(Object.entries(p75).map(([m, v]) => [m, { p75: v, rating: rate(m as Metric, v as number) }])),
    });
  }
  return { id: d.id, name: d.name, description: d.description, days, pages, members: d.members.filter((m) => m.status === "active").length };
}

/** Turns pending invitations for this e-mail into memberships (called on registration). */
export async function acceptPendingInvites(deps: Deps, user: UserDoc | PublicUser): Promise<number> {
  const pending = await deps.store.query<DashboardDoc>("dashboards", { where: [["invitedEmails", "array-contains", user.email]] });
  for (const d of pending) {
    const members = d.members.map((m) => (m.status === "invited" && m.email === user.email ? { ...m, id: user.id, userId: user.id, name: user.name, status: "active" as const, joinedAt: Date.now() } : m));
    await deps.store.update("dashboards", d.id, { members, memberIds: [...new Set([...d.memberIds, user.id])], invitedEmails: d.invitedEmails.filter((e) => e !== user.email) });
  }
  return pending.length;
}

export function teamRoutes(r: Router, deps: Deps): void {
  const { store, log } = deps;

  r.get("/api/users/:id/team-dashboards", async (ctx) => {
    const rows = await store.query<DashboardDoc>("dashboards", { where: [["memberIds", "array-contains", ownUser(ctx)]] });
    return json(rows.sort((a, b) => b.createdAt - a.createdAt).map(view));
  });

  r.post("/api/team-dashboards", async (ctx) => {
    const b = await ctx.body();
    const me = await store.get<UserDoc>("users", ctx.userId!);
    if (!me) throw new HttpError(401, "Account not found");
    const urls = Array.isArray(b.urls) ? [...new Set(b.urls.map((u, i) => httpUrl(u, `urls[${i}]`)))].slice(0, 25) : [];
    const d: DashboardDoc = {
      id: newId(),
      ownerId: me.id,
      name: str(b.name, "name", { max: 80 }),
      description: str(b.description, "description", { max: 500, optional: true }),
      isPublic: b.isPublic === true,
      urls,
      members: [{ id: me.id, userId: me.id, name: me.name, email: me.email, role: "owner", status: "active", joinedAt: Date.now() }],
      memberIds: [me.id],
      invitedEmails: [],
      createdAt: Date.now(),
    };
    await store.set("dashboards", d.id, d);
    return json(view(d), 201);
  });

  r.patch("/api/team-dashboards/:did", async (ctx) => {
    const d = await load(deps, ctx.params.did!, ctx.userId!, "manage");
    const b = await ctx.body();
    const patch: Partial<DashboardDoc> = {};
    if (b.name !== undefined) patch.name = str(b.name, "name", { max: 80 });
    if (b.description !== undefined) patch.description = str(b.description, "description", { max: 500, optional: true });
    if (b.isPublic !== undefined) patch.isPublic = b.isPublic === true;
    if (b.urls !== undefined) {
      if (!Array.isArray(b.urls)) throw new HttpError(400, "urls must be a list", "validation");
      patch.urls = [...new Set(b.urls.map((u, i) => httpUrl(u, `urls[${i}]`)))].slice(0, 25);
    }
    await store.update("dashboards", d.id, patch);
    return json(view({ ...d, ...patch }));
  });

  r.delete("/api/team-dashboards/:did", async (ctx) => {
    const d = await load(deps, ctx.params.did!, ctx.userId!, "view");
    if (d.ownerId !== ctx.userId) throw new HttpError(403, "Only the owner can delete the dashboard", "forbidden");
    await store.delete("dashboards", d.id);
    return json({ deleted: true });
  });

  r.post("/api/team-dashboards/:did/invite", async (ctx) => {
    const d = await load(deps, ctx.params.did!, ctx.userId!, "manage");
    const b = await ctx.body();
    const email = emailOf(b.email);
    const role = oneOf(b.role, "role", ["admin", "member", "viewer"] as const, "member");
    if (d.members.some((m) => m.email === email)) throw new HttpError(409, "That person is already on this dashboard", "duplicate");
    const [user] = await store.query<UserDoc>("users", { where: [["email", "==", email]], limit: 1 });
    const member: Member = user
      ? { id: user.id, userId: user.id, name: user.name, email, role, status: "active", joinedAt: Date.now() }
      : { id: `inv_${newId()}`, name: email.split("@")[0] as string, email, role, status: "invited", joinedAt: Date.now() };
    const members = [...d.members, member];
    await store.update("dashboards", d.id, { members, memberIds: user ? [...d.memberIds, user.id] : d.memberIds, invitedEmails: user ? d.invitedEmails : [...d.invitedEmails, email] });
    log.logAuditEvent("DashboardInvite", "Member invited", { dashboardId: d.id, email, role, pending: !user });
    // the new member (the dashboard screen appends it to its list)
    return json(member, 201);
  });

  r.delete("/api/team-dashboards/:did/members/:mid", async (ctx) => {
    const d = await load(deps, ctx.params.did!, ctx.userId!, "view");
    const target = d.members.find((m) => m.id === ctx.params.mid);
    if (!target) throw new HttpError(404, "Member not found", "not_found");
    if (target.role === "owner") throw new HttpError(400, "The owner cannot be removed", "validation");
    const role = roleOf(d, ctx.userId!);
    if (target.userId !== ctx.userId && role !== "owner" && role !== "admin") throw new HttpError(403, "Only the owner or an admin can remove members", "forbidden");
    const members = d.members.filter((m) => m.id !== target.id);
    await store.update("dashboards", d.id, { members, memberIds: d.memberIds.filter((id) => id !== target.userId), invitedEmails: d.invitedEmails.filter((e) => e !== target.email) });
    return json(view({ ...d, members }));
  });

  r.get("/api/team-dashboards/:did/summary", async (ctx) => {
    const d = await load(deps, ctx.params.did!, ctx.userId!, "view");
    return json(await summary(deps, d, Number(ctx.query("days") ?? 7) || 7));
  });

  // read-only view of a dashboard its owner made public (no sign-in)
  r.get("/api/public/dashboards/:did", async (ctx) => {
    const d = await store.get<DashboardDoc>("dashboards", ctx.params.did!);
    if (!d || !d.isPublic) throw new HttpError(404, "Dashboard not found", "not_found");
    const s = await summary(deps, d, 7);
    return json({ ...s, members: undefined });
  }, false);
}
