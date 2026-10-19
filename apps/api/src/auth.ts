/** Accounts: scrypt password hashes and HS256 JWT bearer tokens (the extension stores the token). */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export interface UserDoc {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
}

export type PublicUser = Omit<UserDoc, "passwordHash">;
export const publicUser = ({ passwordHash: _p, ...u }: UserDoc): PublicUser => u;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

export class Tokens {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds = 30 * 24 * 3600,
  ) {}

  sign(userId: string): string {
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(JSON.stringify({ sub: userId, iat: now, exp: now + this.ttlSeconds }));
    const sig = createHmac("sha256", this.secret).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${sig}`;
  }

  /** The user id, or throws 401. */
  verify(token: string): string {
    const [header, payload, sig] = token.split(".");
    if (!header || !payload || !sig) throw new HttpError(401, "Invalid token", "invalid_token");
    const expected = createHmac("sha256", this.secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, "Invalid token", "invalid_token");
    let claims: { sub?: string; exp?: number };
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    } catch {
      throw new HttpError(401, "Invalid token", "invalid_token");
    }
    if (!claims.sub || !claims.exp || claims.exp < Date.now() / 1000) throw new HttpError(401, "Your session has expired, please sign in again", "token_expired");
    return claims.sub;
  }
}
