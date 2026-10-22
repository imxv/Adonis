-- Signed-in players. Guests have no row here: they are known by the random id their browser keeps.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  login TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

-- Sign-in sessions. Only the SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

-- Every run belongs to a player: 'github:<GitHub user id>' or 'guest:<browser id>'.
-- Runs from before this migration become their browser's guest runs.
ALTER TABLE scores ADD COLUMN player TEXT NOT NULL DEFAULT '';
ALTER TABLE scores ADD COLUMN provider TEXT NOT NULL DEFAULT 'guest';
UPDATE scores SET player = 'guest:' || CASE WHEN pid = '' THEN request_id ELSE pid END WHERE player = '';
CREATE INDEX IF NOT EXISTS scores_player ON scores (player, score DESC, date ASC, id ASC);

-- The leaderboard: one row per player, pointing at their best run, with the name they go by now.
CREATE TABLE IF NOT EXISTS board (
  player TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  run INTEGER NOT NULL,
  score INTEGER NOT NULL,
  date INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS board_ranking ON board (score DESC, date ASC, run ASC);
INSERT OR IGNORE INTO board (player, provider, name, run, score, date)
  SELECT player, provider, name, id, score, date FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player ORDER BY score DESC, date ASC, id ASC) AS n FROM scores
  ) WHERE n = 1;
