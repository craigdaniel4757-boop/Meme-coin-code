"""SQLite persistence: price ticks, scan results, trades, and positions.

Deliberately plain `sqlite3` rather than an ORM -- the schema is small and
stable, and this keeps the dependency footprint (and the number of places a
subtle bug can hide) down. All access goes through `Database`, which owns
schema creation/migration-by-`CREATE TABLE IF NOT EXISTS` and exposes a
handful of narrow, purpose-built methods rather than a generic query API.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS price_ticks (
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    ts INTEGER NOT NULL,
    price_usd REAL NOT NULL,
    volume_24h_usd REAL,
    liquidity_usd REAL,
    PRIMARY KEY (chain_id, pair_address, ts)
);
CREATE INDEX IF NOT EXISTS idx_price_ticks_lookup
    ON price_ticks (chain_id, pair_address, ts);

CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    symbol TEXT,
    score REAL,
    passed_safety INTEGER,
    signals TEXT,
    details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_scan_results_ts ON scan_results (ts);

CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    base_token_address TEXT,
    symbol TEXT,
    entry_price REAL NOT NULL,
    quantity REAL NOT NULL,
    entry_time REAL NOT NULL,
    stop_loss_price REAL,
    trailing_stop_price REAL,
    high_water_mark REAL,
    remaining_fraction REAL,
    strategy_name TEXT,
    status TEXT NOT NULL,
    take_profit_json TEXT,
    closed_time REAL,
    realized_pnl_usd REAL
);

CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    pair_address TEXT NOT NULL,
    symbol TEXT,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    quantity REAL NOT NULL,
    fee_usd REAL,
    ts REAL NOT NULL,
    reason TEXT,
    realized_pnl_usd REAL,
    mode TEXT NOT NULL DEFAULT 'paper',
    kind TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades (ts);
CREATE INDEX IF NOT EXISTS idx_trades_pair_lookup ON trades (chain_id, pair_address, ts);
"""


class Database:
    """Thread-safe-enough wrapper: one connection, guarded by a lock, since
    the bot is a single asyncio process and writes are infrequent relative
    to a scan cycle."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # -- price ticks ---------------------------------------------------

    def insert_tick(
        self,
        chain_id: str,
        pair_address: str,
        ts: int,
        price_usd: float,
        volume_24h_usd: float | None,
        liquidity_usd: float | None,
    ) -> None:
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO price_ticks
                   (chain_id, pair_address, ts, price_usd, volume_24h_usd, liquidity_usd)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (chain_id, pair_address, ts, price_usd, volume_24h_usd, liquidity_usd),
            )
            self._conn.commit()

    def get_ticks(
        self, chain_id: str, pair_address: str, since_ts: int, limit: int = 5000
    ) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute(
                """SELECT ts, price_usd, volume_24h_usd, liquidity_usd FROM price_ticks
                   WHERE chain_id = ? AND pair_address = ? AND ts >= ?
                   ORDER BY ts ASC LIMIT ?""",
                (chain_id, pair_address, since_ts, limit),
            )
            return cur.fetchall()

    def prune_ticks(self, older_than_ts: int) -> int:
        with self._lock:
            cur = self._conn.execute("DELETE FROM price_ticks WHERE ts < ?", (older_than_ts,))
            self._conn.commit()
            return cur.rowcount

    # -- scan results ----------------------------------------------------

    def insert_scan_result(
        self,
        ts: int,
        chain_id: str,
        pair_address: str,
        symbol: str,
        score: float | None,
        passed_safety: bool,
        signals: list[str],
        details: dict,
    ) -> None:
        with self._lock:
            self._conn.execute(
                """INSERT INTO scan_results
                   (ts, chain_id, pair_address, symbol, score, passed_safety, signals, details_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    ts,
                    chain_id,
                    pair_address,
                    symbol,
                    score,
                    int(passed_safety),
                    json.dumps(signals),
                    json.dumps(details, default=str),
                ),
            )
            self._conn.commit()

    # -- positions / trades ----------------------------------------------

    def upsert_position(self, row: dict) -> None:
        with self._lock:
            self._conn.execute(
                """INSERT INTO positions
                   (id, chain_id, pair_address, base_token_address, symbol, entry_price, quantity,
                    entry_time, stop_loss_price, trailing_stop_price, high_water_mark, remaining_fraction,
                    strategy_name, status, take_profit_json, closed_time, realized_pnl_usd)
                   VALUES (:id, :chain_id, :pair_address, :base_token_address, :symbol, :entry_price,
                           :quantity, :entry_time, :stop_loss_price, :trailing_stop_price, :high_water_mark,
                           :remaining_fraction, :strategy_name, :status, :take_profit_json,
                           :closed_time, :realized_pnl_usd)
                   ON CONFLICT(id) DO UPDATE SET
                       quantity=excluded.quantity,
                       stop_loss_price=excluded.stop_loss_price,
                       trailing_stop_price=excluded.trailing_stop_price,
                       high_water_mark=excluded.high_water_mark,
                       remaining_fraction=excluded.remaining_fraction,
                       status=excluded.status,
                       take_profit_json=excluded.take_profit_json,
                       closed_time=excluded.closed_time,
                       realized_pnl_usd=excluded.realized_pnl_usd
                """,
                row,
            )
            self._conn.commit()

    def get_open_positions(self) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM positions WHERE status = 'open'")
            return cur.fetchall()

    def get_all_positions(self) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM positions ORDER BY entry_time DESC")
            return cur.fetchall()

    def insert_trade(self, row: dict) -> None:
        with self._lock:
            self._conn.execute(
                """INSERT INTO trades
                   (id, position_id, chain_id, pair_address, symbol, side, price, quantity,
                    fee_usd, ts, reason, realized_pnl_usd, mode, kind)
                   VALUES (:id, :position_id, :chain_id, :pair_address, :symbol, :side, :price,
                           :quantity, :fee_usd, :ts, :reason, :realized_pnl_usd, :mode, :kind)""",
                row,
            )
            self._conn.commit()

    def has_recent_negative_exit(
        self, chain_id: str, pair_address: str, kinds: list[str], since_ts: float
    ) -> bool:
        """Used by the same-token cooldown (bot/scanner/screener.py): was
        there a sell of this exact pair, with one of `kinds` (e.g.
        stop_loss/liquidity_crash/reversal), at or after `since_ts`?"""
        if not kinds:
            return False
        with self._lock:
            placeholders = ",".join("?" * len(kinds))
            cur = self._conn.execute(
                f"""SELECT 1 FROM trades
                    WHERE chain_id = ? AND pair_address = ? AND side = 'sell'
                      AND kind IN ({placeholders}) AND ts >= ?
                    LIMIT 1""",
                (chain_id, pair_address, *kinds, since_ts),
            )
            return cur.fetchone() is not None

    def get_trades(self, limit: int = 200) -> list[sqlite3.Row]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM trades ORDER BY ts DESC LIMIT ?", (limit,)
            )
            return cur.fetchall()

    def daily_realized_pnl(self, since_ts: float) -> float:
        with self._lock:
            cur = self._conn.execute(
                """SELECT COALESCE(SUM(realized_pnl_usd), 0) AS total FROM trades
                   WHERE ts >= ? AND realized_pnl_usd IS NOT NULL""",
                (since_ts,),
            )
            row = cur.fetchone()
            return float(row["total"]) if row else 0.0
