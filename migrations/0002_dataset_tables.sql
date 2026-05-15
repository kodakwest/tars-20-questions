-- Track dataset builds
CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_summary TEXT,
  entity_count INTEGER NOT NULL,
  assertion_count INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  validation_status TEXT NOT NULL,
  validation_report_json TEXT,
  notes TEXT
);

-- Entities (replaces old characters table gradually)
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT,
  popularity_prior REAL DEFAULT 0.5,
  source_refs_json TEXT DEFAULT '{}',
  dataset_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Aliases
CREATE TABLE IF NOT EXISTS aliases (
  entity_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  source TEXT,
  PRIMARY KEY (entity_id, alias)
);

-- Categories (type hierarchy)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  source_refs_json TEXT DEFAULT '{}'
);

-- Entity -> Category mapping
CREATE TABLE IF NOT EXISTS entity_categories (
  entity_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  PRIMARY KEY (entity_id, category_id)
);

-- Attribute definitions
CREATE TABLE IF NOT EXISTS attributes (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT '[]',
  answer_type TEXT DEFAULT 'yes_no_kind_of',
  ambiguity_risk TEXT DEFAULT 'low'
);

-- Attribute assertions (the core fact table)
CREATE TABLE IF NOT EXISTS attribute_assertions (
  entity_id TEXT NOT NULL,
  attribute_id TEXT NOT NULL,
  value TEXT NOT NULL,
  numeric_value REAL,
  confidence REAL DEFAULT 0.5,
  source_type TEXT NOT NULL,
  source_refs_json TEXT DEFAULT '{}',
  review_status TEXT DEFAULT 'unreviewed',
  user_truth_distribution_json TEXT,
  dataset_version_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_id, attribute_id, source_type)
);

-- Question templates
CREATE TABLE IF NOT EXISTS question_templates (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL,
  template TEXT NOT NULL,
  ask_stage TEXT DEFAULT '["mid_game"]',
  quality_score REAL DEFAULT 0.5
);

-- Game observations (per-turn data for learning)
CREATE TABLE IF NOT EXISTS game_observations (
  game_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  entity_id TEXT,
  attribute_id TEXT,
  user_answer TEXT,
  confidence_before REAL,
  confidence_after REAL,
  PRIMARY KEY (game_id, turn_number)
);
