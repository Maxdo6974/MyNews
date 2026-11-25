import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __flashSql?: Sql };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Connexion unique, réutilisée (y compris entre rechargements à chaud). */
export function db(): Sql {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL absente : base de données non configurée");
  if (!g.__flashSql) {
    g.__flashSql = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 30,
      onnotice: () => {},
    });
  }
  return g.__flashSql;
}

/** Migrations numérotées, appliquées une seule fois et dans l'ordre. */
const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "sources, articles, ingestion_runs",
    sql: `
      CREATE TABLE sources (
        id              text PRIMARY KEY,
        nom             text NOT NULL,
        pays            text NOT NULL,
        langue          text NOT NULL,
        groupe          text NOT NULL,
        poids           real NOT NULL,
        themes          text[] NOT NULL DEFAULT '{}',
        url             text NOT NULL,
        actif           boolean NOT NULL DEFAULT true,
        etag            text,
        last_modified   text,
        last_status     integer,
        last_error      text,
        last_checked_at timestamptz,
        last_ok_at      timestamptz,
        updated_at      timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE articles (
        id            bigserial PRIMARY KEY,
        source_id     text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        groupe        text NOT NULL,
        pays          text NOT NULL,
        langue        text NOT NULL,
        themes        text[] NOT NULL DEFAULT '{}',
        title         text NOT NULL,
        title_norm    text NOT NULL,
        summary       text NOT NULL DEFAULT '',
        url           text NOT NULL,
        published_at  timestamptz NOT NULL,
        fetched_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX articles_source_url ON articles (source_id, url);
      CREATE UNIQUE INDEX articles_source_title ON articles (source_id, title_norm);
      CREATE INDEX articles_pays_published ON articles (pays, published_at DESC);
      CREATE INDEX articles_published ON articles (published_at DESC);

      CREATE TABLE ingestion_runs (
        id            serial PRIMARY KEY,
        trigger       text NOT NULL,
        started_at    timestamptz NOT NULL DEFAULT now(),
        finished_at   timestamptz,
        sources_ok    integer NOT NULL DEFAULT 0,
        sources_ko    integer NOT NULL DEFAULT 0,
        new_articles  integer NOT NULL DEFAULT 0,
        deleted_old   integer NOT NULL DEFAULT 0,
        details       jsonb NOT NULL DEFAULT '[]'
      );
    `,
  },
];

const MIGRATION_LOCK = 72_000_001;

export async function migrate(): Promise<number[]> {
  const sql = db();
  const applied: number[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      id integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await tx`SELECT id FROM schema_migrations`).map((r) => r.id as number));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`INSERT INTO schema_migrations (id, name) VALUES (${m.id}, ${m.name})`;
      applied.push(m.id);
    }
  });
  return applied;
}
