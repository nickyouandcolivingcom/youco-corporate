CREATE TABLE IF NOT EXISTS "docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"category" text NOT NULL DEFAULT 'General',
	"sort_order" integer NOT NULL DEFAULT 100,
	"body" text NOT NULL DEFAULT '',
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "docs_category_sort_idx" ON "docs" ("category", "sort_order");
