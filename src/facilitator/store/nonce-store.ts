import Database from "better-sqlite3";
import type { NonceStore } from "../../types.js";

/**
 * SQLite-backed nonce store with WAL mode
 * Tracks spent nonces to prevent replay attacks.
 */
export class SqliteNonceStore implements NonceStore {
  private db: Database.Database;
  private stmtCheck: Database.Statement;
  private stmtInsert: Database.Statement;

  constructor(dbPath = "nonces.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spent_nonces (
        nonce TEXT PRIMARY KEY,
        spent_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    this.stmtCheck = this.db.prepare(
      "SELECT 1 FROM spent_nonces WHERE nonce = ?"
    );
    this.stmtInsert = this.db.prepare(
      "INSERT OR IGNORE INTO spent_nonces (nonce) VALUES (?)"
    );
  }

  isSpent(nonce: string): boolean {
    return this.stmtCheck.get(nonce) !== undefined;
  }

  markSpent(nonce: string): void {
    this.stmtInsert.run(nonce);
  }
}
