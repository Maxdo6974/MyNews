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
  {
    id: 2,
    name: "clusters (événements)",
    sql: `
      CREATE TABLE clusters (
        id              bigserial PRIMARY KEY,
        pays            text NOT NULL,
        label           text NOT NULL,
        themes          text[] NOT NULL DEFAULT '{}',
        groups          text[] NOT NULL DEFAULT '{}',
        sources         text[] NOT NULL DEFAULT '{}',
        n_articles      integer NOT NULL,
        n_groups        integer NOT NULL,
        score           real NOT NULL,
        confirmed       boolean NOT NULL,
        featured        boolean NOT NULL DEFAULT false,
        first_published timestamptz NOT NULL,
        last_published  timestamptz NOT NULL,
        computed_at     timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX clusters_pays_score ON clusters (pays, score DESC);
      CREATE TABLE cluster_articles (
        cluster_id bigint NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
        article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        PRIMARY KEY (cluster_id, article_id)
      );
      CREATE INDEX cluster_articles_article ON cluster_articles (article_id);
    `,
  },
  {
    id: 3,
    name: "bulletins, cost_log",
    sql: `
      CREATE TABLE bulletins (
        id           bigserial PRIMARY KEY,
        pays         text NOT NULL,
        theme        text NOT NULL,
        langue       text NOT NULL,
        duree        text NOT NULL,
        edition      text NOT NULL,
        status       text NOT NULL,          -- en_cours | pret | echec
        error        text,
        intro        text,
        chapters     jsonb NOT NULL DEFAULT '[]',
        outro        text,
        facts        jsonb NOT NULL DEFAULT '[]', -- faits retenus et rejetés, avec raisons
        qc           jsonb NOT NULL DEFAULT '{}',
        word_count   integer,
        cost_eur     real NOT NULL DEFAULT 0,
        duration_ms  integer,
        created_at   timestamptz NOT NULL DEFAULT now(),
        finished_at  timestamptz
      );
      CREATE INDEX bulletins_lookup ON bulletins (pays, theme, langue, duree, created_at DESC);
      CREATE TABLE cost_log (
        id           bigserial PRIMARY KEY,
        at           timestamptz NOT NULL DEFAULT now(),
        provider     text NOT NULL,
        model        text NOT NULL,
        purpose      text NOT NULL,
        input_units  integer NOT NULL,
        output_units integer NOT NULL,
        cost_eur     real NOT NULL,
        bulletin_id  bigint REFERENCES bulletins(id) ON DELETE SET NULL
      );
      CREATE INDEX cost_log_at ON cost_log (at);
    `,
  },
  {
    id: 4,
    name: "bulletin_audio",
    sql: `
      CREATE TABLE bulletin_audio (
        bulletin_id  bigint NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
        persona      text NOT NULL,
        provider     text NOT NULL,
        voice        text NOT NULL,
        mp3          bytea NOT NULL,
        bytes        integer NOT NULL,
        duration_ms  integer NOT NULL,
        chapters     jsonb NOT NULL,
        cost_eur     real NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (bulletin_id, persona)
      );
    `,
  },
  {
    id: 5,
    name: "versions linguistiques d'un bulletin, audio par langue",
    sql: `
      CREATE TABLE bulletin_versions (
        bulletin_id  bigint NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
        langue       text NOT NULL,
        source       text NOT NULL,            -- original | traduction
        intro        text NOT NULL,
        chapters     jsonb NOT NULL,
        outro        text NOT NULL,
        qc           jsonb NOT NULL DEFAULT '{}',
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (bulletin_id, langue)
      );
      INSERT INTO bulletin_versions (bulletin_id, langue, source, intro, chapters, outro, qc, created_at)
        SELECT id, langue, 'original', intro, chapters, outro, qc, created_at FROM bulletins WHERE status = 'pret';
      -- L'audio dépend désormais de la langue (et du nouveau montage) : l'ancien est supprimé.
      DROP TABLE bulletin_audio;
      CREATE TABLE bulletin_audio (
        bulletin_id  bigint NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
        langue       text NOT NULL,
        persona      text NOT NULL,
        provider     text NOT NULL,
        voice        text NOT NULL,
        mp3          bytea NOT NULL,
        bytes        integer NOT NULL,
        duration_ms  integer NOT NULL,
        chapters     jsonb NOT NULL,
        cost_eur     real NOT NULL DEFAULT 0,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (bulletin_id, langue, persona)
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
