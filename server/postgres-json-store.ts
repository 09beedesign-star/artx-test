import { Pool } from "pg";

const pools = new Map<string, Pool>();

function getPool(databaseUrl: string) {
  const url = databaseUrl.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for PostgreSQL storage");
  }

  const existing = pools.get(url);
  if (existing) return existing;

  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pools.set(url, pool);
  return pool;
}

export class PostgresJsonDocumentStore<TData extends object> {
  private schemaReady?: Promise<void>;

  constructor(
    private readonly databaseUrl: string,
    private readonly documentKey: string
  ) {}

  private ensureSchema() {
    this.schemaReady ||= getPool(this.databaseUrl).query(`
      CREATE TABLE IF NOT EXISTS artx_json_documents (
        key text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `).then(() => undefined);
    return this.schemaReady;
  }

  async load(): Promise<Partial<TData> | null> {
    await this.ensureSchema();
    const result = await getPool(this.databaseUrl).query(
      "SELECT data FROM artx_json_documents WHERE key = $1",
      [this.documentKey]
    );
    return result.rows[0]?.data as Partial<TData> | undefined || null;
  }

  async save(data: TData) {
    await this.ensureSchema();
    await getPool(this.databaseUrl).query(UPSERT_SQL, [this.documentKey, JSON.stringify(data)]);
  }

  /**
   * 带锁的「读 → 改 → 写」。
   *
   * ⚠️⚠️⚠️ 为什么需要：save() 是整文档 UPSERT。两个请求各自 load 到同一份快照、
   * 各改一处、先后 save，后写的会把先写的整份抹掉，且双方都返回成功
   * （2026-10-24 线上实测：同账号并发建 10 把 key，只落库 7 把）。
   *
   * 做法：事务内先拿 `pg_advisory_xact_lock(文档 key)`，同一文档的所有 transaction()
   * 调用在数据库层面排队 —— 跨模块、跨进程、跨实例都有效；COMMIT/ROLLBACK 自动释放。
   * fn 抛错 → ROLLBACK，本次所有写入作废。
   *
   * ⚠️ 只有走 transaction() 的写入者之间互斥。对同一文档仍直接调 save() 的代码
   * 不受保护 —— auth-users 的所有写入已收口到 auth-store 的 withAuthWriteLock。
   * ⚠️ fn 内禁止做慢速外部 IO（发短信/邮件/调上游），否则整站该文档的写入全部排队。
   */
  async transaction<R>(
    fn: (tx: { load(): Promise<Partial<TData> | null>; save(data: TData): Promise<void> }) => Promise<R>,
  ): Promise<R> {
    await this.ensureSchema();
    const client = await getPool(this.databaseUrl).connect();
    try {
      await client.query("BEGIN");
      // 防止某个持锁请求卡死后，其余请求无限等待：15 秒拿不到锁就报错。
      await client.query("SET LOCAL lock_timeout = '15s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`artx_json_documents:${this.documentKey}`]);
      const result = await fn({
        load: async () => {
          const res = await client.query("SELECT data FROM artx_json_documents WHERE key = $1", [this.documentKey]);
          return (res.rows[0]?.data as Partial<TData> | undefined) || null;
        },
        save: async (data: TData) => {
          await client.query(UPSERT_SQL, [this.documentKey, JSON.stringify(data)]);
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // 连接已坏时 ROLLBACK 也会失败，原始错误更重要。
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

const UPSERT_SQL = `
  INSERT INTO artx_json_documents (key, data, updated_at)
  VALUES ($1, $2::jsonb, now())
  ON CONFLICT (key) DO UPDATE
    SET data = EXCLUDED.data,
        updated_at = now()
`;
