import { hashPassword, publicUser, verifyPassword, type UserDoc } from "../auth";
import type { Deps } from "../deps";
import { email as emailOf, HttpError, json, newId, str, type Router } from "../http";
import { acceptPendingInvites } from "./teams";

const limited = (retryAfter: number, message: string) => new HttpError(429, message, "rate_limited");

export function accountRoutes(r: Router, deps: Deps): void {
  const { store, tokens, limits, log } = deps;

  r.post("/api/auth/register", async (ctx) => {
    const reg = await limits.register.consume(ctx.ip);
    if (!reg.allowed) throw limited(reg.retryAfter, "Too many accounts created from this address, try again later");
    const b = await ctx.body();
    const name = str(b.name, "name", { min: 2, max: 60 });
    const email = emailOf(b.email);
    const password = str(b.password, "password", { min: 8, max: 128 });
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new HttpError(400, "password must contain a letter and a digit", "validation");
    if ((await store.query<UserDoc>("users", { where: [["email", "==", email]], limit: 1 })).length) throw new HttpError(409, "An account with this e-mail already exists", "duplicate");
    const user: UserDoc = { id: newId(), email, name, passwordHash: await hashPassword(password), createdAt: Date.now() };
    await store.set("users", user.id, user);
    const joined = await acceptPendingInvites(deps, user);
    log.logAuditEvent("UserRegistered", "Account created", { userId: user.id, dashboardsJoined: joined });
    return json({ token: tokens.sign(user.id), user: publicUser(user) }, 201);
  }, false);

  r.post("/api/auth/login", async (ctx) => {
    const b = await ctx.body();
    const email = emailOf(b.email);
    const attempt = await limits.login.consume(`${ctx.ip}:${email}`);
    if (!attempt.allowed) throw limited(attempt.retryAfter, "Too many sign-in attempts, try again later");
    const password = str(b.password, "password", { max: 128 });
    const [user] = await store.query<UserDoc>("users", { where: [["email", "==", email]], limit: 1 });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      log.logAuditEvent("LoginFailed", "Sign-in failed", { email });
      throw new HttpError(401, "Wrong e-mail or password", "bad_credentials");
    }
    log.logAuditEvent("LoginSucceeded", "Signed in", { userId: user.id });
    return json({ token: tokens.sign(user.id), user: publicUser(user) });
  }, false);

  r.get("/api/auth/me", async (ctx) => {
    const user = await store.get<UserDoc>("users", ctx.userId!);
    if (!user) throw new HttpError(401, "Account not found", "invalid_token");
    return json({ user: publicUser(user) });
  });
}
