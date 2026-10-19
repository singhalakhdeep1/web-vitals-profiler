/** Alert channels (Slack, e-mail), rules on Core Web Vitals, and the delivery history. Rules run on every ingest. */
import { AlertService, formatMetric, type Metric, type Sample } from "@wvp/core";
import type { VitalsDoc } from "@wvp/firebase";
import type { Deps } from "../deps";
import { email as emailOf, HttpError, httpUrl, json, newId, num, oneOf, str, type Router } from "../http";
import { assertPublicUrl, sendEmail, sendSlack, type AlertMessage } from "../notify";
import { toSample } from "../samples";
import { ownUser } from "./vitals";

interface ChannelDoc {
  id: string;
  userId: string;
  type: "slack" | "email";
  name: string;
  enabled: boolean;
  config: { webhookUrl?: string; channel?: string; recipients?: string[] };
  createdAt: number;
}

interface RuleDoc {
  id: string;
  userId: string;
  name: string;
  metric: Metric | "FID";
  condition: "above" | "below";
  threshold: number;
  channels: string[];
  enabled: boolean;
  /** Only samples of this page trigger the rule (all pages when empty). */
  url?: string;
  createdAt: number;
}

interface HistoryDoc {
  id: string;
  userId: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  channelId: string;
  channelName: string;
  triggeredAt: number;
  status: "sent" | "failed";
  error?: string;
}

const strip = <T extends { userId: string }>({ userId: _u, ...rest }: T) => rest;
/** Webhook URLs are secrets: only their host is shown back. */
const viewChannel = (c: ChannelDoc) => ({ ...strip(c), config: { ...c.config, webhookUrl: c.config.webhookUrl ? `${new URL(c.config.webhookUrl).origin}/…` : undefined } });

async function owned<T extends { userId: string }>(deps: Deps, collection: string, id: string, userId: string): Promise<T> {
  const doc = await deps.store.get<T>(collection, id);
  if (!doc || doc.userId !== userId) throw new HttpError(404, "Not found", "not_found");
  return doc;
}

async function deliver(deps: Deps, channel: ChannelDoc, msg: AlertMessage): Promise<void> {
  if (channel.type === "slack") await sendSlack(channel.config.webhookUrl!, msg, deps.config, channel.config.channel);
  else await sendEmail(channel.config.recipients ?? [], msg, deps.config);
}

const alerting = new AlertService();

/** Runs the user's enabled rules against newly ingested samples; returns how many rules fired. */
export async function evaluateAlerts(deps: Deps, userId: string, docs: VitalsDoc[]): Promise<number> {
  const rules = (await deps.store.query<RuleDoc>("alertRules", { where: [["userId", "==", userId]] })).filter((r) => r.enabled);
  if (!rules.length) return 0;
  let fired = 0;
  for (const rule of rules) {
    const samples: Sample[] = docs.filter((d) => !rule.url || d.url === rule.url).map(toSample);
    const value = alerting.observedValue(rule, samples);
    if (value === null || !alerting.evaluateRule(rule, value)) continue;
    // one notification per rule per cool-down window, across all API instances
    if (!(await deps.cache.setIfAbsent(`alert-cooldown:${rule.id}`, "1", deps.config.alertCooldownSeconds))) continue;
    fired++;
    const metric = (rule.metric === "FID" ? "INP" : rule.metric) as Metric;
    const msg: AlertMessage = { ruleName: rule.name, metric, value: formatMetric(metric, value), threshold: formatMetric(metric, rule.threshold), condition: rule.condition, url: rule.url ?? samples[0]?.url };
    for (const channelId of rule.channels) {
      const channel = await deps.store.get<ChannelDoc>("alertChannels", channelId);
      if (!channel || channel.userId !== userId || !channel.enabled) continue;
      const entry: HistoryDoc = { id: newId(), userId, ruleId: rule.id, ruleName: rule.name, metric, value, threshold: rule.threshold, channelId, channelName: channel.name, triggeredAt: Date.now(), status: "sent" };
      try {
        await deliver(deps, channel, msg);
      } catch (e) {
        entry.status = "failed";
        entry.error = (e as Error).message.slice(0, 300);
      }
      await deps.store.set("alertHistory", entry.id, entry);
      deps.log.logAuditEvent("AlertSent", `Alert "${rule.name}" ${entry.status}`, { ruleId: rule.id, channel: channel.type, status: entry.status });
    }
  }
  return fired;
}

export function alertRoutes(r: Router, deps: Deps): void {
  const { store } = deps;

  r.get("/api/users/:id/alert-channels", async (ctx) => json((await store.query<ChannelDoc>("alertChannels", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["createdAt", "desc"] })).map(viewChannel)));
  r.get("/api/users/:id/alert-rules", async (ctx) => json((await store.query<RuleDoc>("alertRules", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["createdAt", "desc"] })).map(strip)));
  r.get("/api/users/:id/alert-history", async (ctx) => json((await store.query<HistoryDoc>("alertHistory", { where: [["userId", "==", ownUser(ctx)]], orderBy: ["triggeredAt", "desc"], limit: 100 })).map(strip)));

  r.post("/api/alert-channels", async (ctx) => {
    const b = await ctx.body<{ type?: unknown; name?: unknown; config?: { webhookUrl?: unknown; channel?: unknown; recipients?: unknown } }>();
    const type = oneOf(b.type, "type", ["slack", "email"] as const);
    const config: ChannelDoc["config"] = {};
    if (type === "slack") {
      config.webhookUrl = (await assertPublicUrl(httpUrl(b.config?.webhookUrl, "webhookUrl"), deps.config)).toString();
      if (b.config?.channel) config.channel = str(b.config.channel, "channel", { max: 80 });
    } else {
      const list = Array.isArray(b.config?.recipients) ? b.config.recipients : typeof b.config?.recipients === "string" ? b.config.recipients.split(",") : [];
      config.recipients = [...new Set(list.map((x) => emailOf(String(x).trim(), "recipient")))];
      if (!config.recipients.length || config.recipients.length > 20) throw new HttpError(400, "Give 1 to 20 recipients", "validation");
    }
    const channel: ChannelDoc = { id: newId(), userId: ctx.userId!, type, name: str(b.name, "name", { max: 80 }), enabled: true, config, createdAt: Date.now() };
    await store.set("alertChannels", channel.id, channel);
    return json(viewChannel(channel), 201);
  });

  r.post("/api/alert-channels/:cid/toggle", async (ctx) => {
    const c = await owned<ChannelDoc>(deps, "alertChannels", ctx.params.cid!, ctx.userId!);
    await store.update("alertChannels", c.id, { enabled: !c.enabled });
    return json(viewChannel({ ...c, enabled: !c.enabled }));
  });

  // sends a test message through the channel right away
  r.post("/api/alert-channels/:cid/test", async (ctx) => {
    const c = await owned<ChannelDoc>(deps, "alertChannels", ctx.params.cid!, ctx.userId!);
    try {
      await deliver(deps, c, { ruleName: "Test alert", metric: "LCP", value: "3.10 s", threshold: "2.50 s", condition: "above" });
      return json({ status: "sent" });
    } catch (e) {
      return json({ status: "failed", error: (e as Error).message }, 502);
    }
  });

  r.delete("/api/alert-channels/:cid", async (ctx) => {
    const c = await owned<ChannelDoc>(deps, "alertChannels", ctx.params.cid!, ctx.userId!);
    await store.delete("alertChannels", c.id);
    return json({ deleted: true });
  });

  r.post("/api/alert-rules", async (ctx) => {
    const b = await ctx.body();
    const channels = Array.isArray(b.channels) ? b.channels.map(String) : [];
    for (const id of channels) await owned<ChannelDoc>(deps, "alertChannels", id, ctx.userId!);
    const rule: RuleDoc = {
      id: newId(),
      userId: ctx.userId!,
      name: str(b.name, "name", { max: 80 }),
      metric: oneOf(b.metric, "metric", ["LCP", "CLS", "INP", "FCP", "TTFB", "TBT", "FID"] as const),
      condition: oneOf(b.condition, "condition", ["above", "below"] as const, "above"),
      threshold: num(b.threshold, "threshold", { min: 0, max: 600_000 }),
      channels,
      enabled: true,
      url: httpUrl(b.url, "url", { optional: true }) || undefined,
      createdAt: Date.now(),
    };
    await store.set("alertRules", rule.id, rule);
    return json(strip(rule), 201);
  });

  r.post("/api/alert-rules/:rid/toggle", async (ctx) => {
    const rule = await owned<RuleDoc>(deps, "alertRules", ctx.params.rid!, ctx.userId!);
    await store.update("alertRules", rule.id, { enabled: !rule.enabled });
    return json(strip({ ...rule, enabled: !rule.enabled }));
  });

  r.delete("/api/alert-rules/:rid", async (ctx) => {
    const rule = await owned<RuleDoc>(deps, "alertRules", ctx.params.rid!, ctx.userId!);
    await store.delete("alertRules", rule.id);
    return json({ deleted: true });
  });
}
