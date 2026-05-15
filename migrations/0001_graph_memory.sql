CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'character',
  description TEXT,
  attributes TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL UNIQUE,
  attribute_key TEXT NOT NULL,
  category TEXT,
  priority INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO questions (text, attribute_key, category, priority) VALUES
('Is your answer fictional?', 'fictional', NULL, 100),
('Is it a human being?', 'human', NULL, 95),
('Is it a real living thing?', 'real_living', NULL, 90),
('Is it male?', 'male', 'character', 80),
('Is it female?', 'female', 'character', 79),
('Is it from a movie?', 'from_movie', 'character', 75),
('Is it from a video game?', 'from_game', 'character', 74),
('Is it from a book?', 'from_book', 'character', 73),
('Is it from TV?', 'from_tv', 'character', 72),
('Is it from a comic book?', 'from_comic', 'character', 71),
('Is it the main character?', 'main_character', 'character', 68),
('Is it a villain?', 'villain', 'character', 67),
('Does it involve magic or supernatural powers?', 'supernatural', NULL, 64),
('Is it from a science fiction setting?', 'sci_fi', NULL, 63),
('Is it from a fantasy setting?', 'fantasy', NULL, 62),
('Is it animated?', 'animated', 'character', 60),
('Is it an object?', 'object', NULL, 55),
('Is it a place?', 'place', NULL, 54),
('Is it an animal?', 'animal', NULL, 53),
('Is it food or drink?', 'food', NULL, 52);
