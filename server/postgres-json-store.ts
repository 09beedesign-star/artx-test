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
    await getPool(this.databaseUrl).query(
      `
        INSERT INTO artx_json_documents (key, data, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()
      `,
      [this.documentKey, JSON.stringify(data)]
    );
  }
}
