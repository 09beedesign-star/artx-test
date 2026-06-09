import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type AuthAction = "register" | "login" | "me" | "logout" | "social";

interface StoredUser {
  id: string;
  username: string;
  loginKey: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
}

interface AuthDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
}

const DATA_DIR = process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const DATA_FILE = path.join(DATA_DIR, "auth-users.json");
const DEFAULT_USERNAME = "09bee";
const DEFAULT_PASSWORD = "1234";

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvider(value: unknown) {
  return value === "google" || value === "wechat" || value === "apple" || value === "github" || value === "meta" ? value : "";
}

function loginKey(username: string) {
  return username.toLowerCase();
}

function publicUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  };
}

function hashPassword(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createUser(username: string, password: string): StoredUser {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    username,
    loginKey: loginKey(username),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
}

async function loadDatabase(): Promise<AuthDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let db: AuthDatabase = { users: [], sessions: [] };

  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = parseAuthDatabase(raw);
    db = parsed.db;
    if (parsed.recovered) {
      await saveDatabase(db);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  if (!db.users.some((user) => user.loginKey === loginKey(DEFAULT_USERNAME))) {
    db.users.push(createUser(DEFAULT_USERNAME, DEFAULT_PASSWORD));
    await saveDatabase(db);
  }

  return db;
}

function normalizeDatabase(parsed: Partial<AuthDatabase>): AuthDatabase {
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
}

function parseAuthDatabase(raw: string): { db: AuthDatabase; recovered: boolean } {
  try {
    return { db: normalizeDatabase(JSON.parse(raw) as Partial<AuthDatabase>), recovered: false };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  const candidates = extractTopLevelJsonObjects(raw);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return { db: normalizeDatabase(JSON.parse(candidates[index]) as Partial<AuthDatabase>), recovered: true };
    } catch {
      // Try the previous complete object.
    }
  }

  throw new SyntaxError("Auth database is corrupted and could not be recovered");
}

function extractTopLevelJsonObjects(raw: string) {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) {
        objects.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

async function saveDatabase(db: AuthDatabase) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
  await fs.rename(tmpFile, DATA_FILE);
}

function createSession(db: AuthDatabase, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date().toISOString(),
  });
  return token;
}

function getBearerToken(payload: Record<string, unknown>) {
  const token = payload.token;
  return typeof token === "string" ? token.trim() : "";
}

export async function handleAuthAction(action: AuthAction, payload: unknown) {
  const db = await loadDatabase();
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  if (action === "register") {
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!username) {
      return { status: 400, body: { error: "请输入账号或邮箱" } };
    }
    if (password.trim().length < 4) {
      return { status: 400, body: { error: "密码至少需要 4 位" } };
    }
    if (db.users.some((user) => user.loginKey === loginKey(username))) {
      return { status: 409, body: { error: "该账号已注册，请直接登录" } };
    }

    const user = createUser(username, password);
    const token = createSession(db, user.id);
    db.users.push(user);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "login") {
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";
    const user = db.users.find((item) => item.loginKey === loginKey(username));

    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      return { status: 401, body: { error: "账号或密码错误，请重新输入" } };
    }

    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "social") {
    const provider = normalizeProvider(body.provider);
    if (!provider) {
      return { status: 400, body: { error: "不支持的第三方登录方式" } };
    }
    const providerName = provider === "google" ? "gmail" : provider;
    const username = `${providerName}@artx.social`;
    let user = db.users.find((item) => item.loginKey === loginKey(username));
    if (!user) {
      user = createUser(username, crypto.randomBytes(18).toString("hex"));
      db.users.push(user);
    }
    const token = createSession(db, user.id);
    await saveDatabase(db);
    return { status: 200, body: { token, user: publicUser(user) } };
  }

  if (action === "me") {
    const token = getBearerToken(body);
    const session = token ? db.sessions.find((item) => item.tokenHash === hashToken(token)) : undefined;
    const user = session ? db.users.find((item) => item.id === session.userId) : undefined;

    if (!user) {
      return { status: 401, body: { error: "登录已失效" } };
    }
    return { status: 200, body: { user: publicUser(user) } };
  }

  if (action === "logout") {
    const token = getBearerToken(body);
    if (token) {
      db.sessions = db.sessions.filter((item) => item.tokenHash !== hashToken(token));
      await saveDatabase(db);
    }
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { error: "Unknown auth action" } };
}
