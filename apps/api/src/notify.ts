/** Alert delivery: Slack incoming webhooks and e-mail (SMTP). */
import { lookup } from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import type { Config } from "./deps";
import { HttpError } from "./http";

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || (v6.startsWith("::ffff:") && isPrivateAddress(v6.slice(7)));
}

/** Webhook targets must be public http(s) hosts (no requests into the server's own network). */
export async function assertPublicUrl(raw: string, config: Config): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "webhookUrl must be a URL", "validation");
  }
  if (u.protocol !== "https:" && !(config.allowPrivateWebhooks && u.protocol === "http:")) throw new HttpError(400, "webhookUrl must use https", "validation");
  if (config.allowPrivateWebhooks) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new HttpError(400, "webhookUrl must point to a public host", "validation");
  return u;
}

export interface AlertMessage {
  ruleName: string;
  metric: string;
  value: string;
  threshold: string;
  condition: string;
  url?: string;
}

export async function sendSlack(webhookUrl: string, msg: AlertMessage, config: Config, channel?: string): Promise<void> {
  await assertPublicUrl(webhookUrl, config);
  const text = `:rotating_light: *${msg.ruleName}*: ${msg.metric} p75 is ${msg.value} (${msg.condition} ${msg.threshold})${msg.url ? ` on ${msg.url}` : ""}`;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...(channel && { channel }), blocks: [{ type: "section", text: { type: "mrkdwn", text } }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack answered ${res.status}`);
}

let transport: nodemailer.Transporter | null = null;

export async function sendEmail(recipients: string[], msg: AlertMessage, config: Config): Promise<void> {
  if (!config.smtpUrl) throw new Error("E-mail is not configured on this server (SMTP_URL)");
  transport ??= nodemailer.createTransport(config.smtpUrl);
  await transport.sendMail({
    from: config.mailFrom,
    to: recipients.join(", "),
    subject: `[Web Vitals] ${msg.ruleName}: ${msg.metric} ${msg.value}`,
    text: `${msg.ruleName}\n\n${msg.metric} p75 is ${msg.value}, ${msg.condition} the threshold of ${msg.threshold}.${msg.url ? `\nPage: ${msg.url}` : ""}\n\nWeb Vitals Profiler`,
  });
}
