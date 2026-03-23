import Database from "better-sqlite3"
import path from "path";

const DB_PATH = path.resolve(process.env.STATS_DB_PATH || "../stats.db")
const db = new Database(DB_PATH)

db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
    CREATE TABLE IF NOT EXISTS game_durations
    (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id      TEXT    NOT NULL,
        duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
        created_at  INTEGER NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS task_durations
    (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id      TEXT    NOT NULL,
        task        TEXT    NOT NULL,
        duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
        created_at  INTEGER NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS task_failures
    (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id     TEXT    NOT NULL,
        task       TEXT    NOT NULL,
        fail_count INTEGER NOT NULL CHECK (fail_count >= 0),
        completed  INTEGER NOT NULL CHECK (completed IN (0, 1)),
        created_at INTEGER NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS log_metadata
    (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id      TEXT    NOT NULL UNIQUE,
        byte_size   INTEGER NOT NULL CHECK (byte_size >= 0),
        event_count INTEGER NOT NULL CHECK (event_count >= 0),
        created_at  INTEGER NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_game_durations_log_id ON game_durations (log_id);
    CREATE INDEX IF NOT EXISTS idx_task_durations_log_id ON task_durations (log_id);
    CREATE INDEX IF NOT EXISTS idx_task_failures_log_id ON task_failures (log_id);
`)

const insertGameDuration = db.prepare("INSERT INTO game_durations (log_id, duration_ms) VALUES (?, ?)")
const insertTaskDuration = db.prepare("INSERT INTO task_durations (log_id, task, duration_ms) VALUES (?, ?, ?)")
const insertTaskFailure = db.prepare("INSERT INTO task_failures (log_id, task, fail_count, completed) VALUES (?, ?, ?, ?)")
const insertLogMetadata = db.prepare("INSERT INTO log_metadata (log_id, byte_size, event_count) VALUES (?, ?, ?)")

const collectStatisticsTransaction = db.transaction((logId, events, byteSize) => {
    insertLogMetadata.run(logId, byteSize, events.length)

    const gameStart = events.find(e => e.type === "game_start")
    const gameEnd   = events.find(e => e.type === "game_end")

    if (gameStart?.timestamp && gameEnd?.timestamp) {
        const durationMs = Date.parse(gameEnd.timestamp) - Date.parse(gameStart.timestamp)
        if (durationMs > 0) insertGameDuration.run(logId, durationMs)
    }

    const taskState = new Map()
    const getState = task => {
        if (!taskState.has(task)) taskState.set(task, { starts: [], failCount: 0, completed: false })
        return taskState.get(task)
    }

    for (const event of events) {
        const task = event.data?.task
        if (!task) continue

        const ts = Date.parse(event.timestamp)
        if (Number.isNaN(ts)) continue

        const state = getState(task)

        switch (event.type) {
            case "task_started":
                state.starts.push(ts)
                break
            case "task_failed":
                state.failCount++
                state.starts.pop()
                break
            case "task_completed": {
                state.completed = true
                const startTs = state.starts.pop()
                if (startTs != null) {
                    const dur = ts - startTs
                    if (dur > 0) insertTaskDuration.run(logId, task, dur)
                }
                break
            }
        }
    }

    for (const [task, state] of taskState) {
        if (state.failCount > 0 || state.completed) {
            insertTaskFailure.run(logId, task, state.failCount, state.completed ? 1 : 0)
        }
    }
})

export function collectStatistics(logId, body, byteSize) {
    const events = Array.isArray(body.log) ? body.log : []
    collectStatisticsTransaction(logId, events, byteSize)
}

export { db }