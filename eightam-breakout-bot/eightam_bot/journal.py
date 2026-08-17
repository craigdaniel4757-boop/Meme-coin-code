"""CSV trade journal: the single source of truth for realized P&L and the
account's simulated (paper) or live equity curve.

Deliberately not a database -- at most one trade per symbol per day (see
strategy.py), so an append-only CSV is simple, human-inspectable, and
exactly the kind of data the source video's own P&L graph was built from.
`backtest/engine.py` produces the same shape, so `report` and the backtest
equity-curve chart both read this one format.
"""

from __future__ import annotations

import csv
import logging
from datetime import date
from pathlib import Path

from eightam_bot.models import Bias, Trade

logger = logging.getLogger(__name__)

FIELDNAMES = [
    "id", "symbol", "session_date", "bias", "entry_price", "entry_ts", "stop_price", "target_price",
    "quantity", "risk_usd", "exit_price", "exit_ts", "exit_reason", "fee_usd", "realized_pnl_usd",
    "ml_confidence",
]


def trade_to_row(trade: Trade) -> dict:
    return {
        "id": trade.id,
        "symbol": trade.symbol,
        "session_date": trade.session_date.isoformat(),
        "bias": trade.bias.value,
        "entry_price": trade.entry_price,
        "entry_ts": trade.entry_ts,
        "stop_price": trade.stop_price,
        "target_price": trade.target_price,
        "quantity": trade.quantity,
        "risk_usd": trade.risk_usd,
        "exit_price": trade.exit_price,
        "exit_ts": trade.exit_ts,
        "exit_reason": trade.exit_reason,
        "fee_usd": trade.fee_usd,
        "realized_pnl_usd": trade.realized_pnl_usd,
        "ml_confidence": trade.ml_confidence,
    }


def _opt_float(row: dict, key: str) -> float | None:
    value = row.get(key)
    return float(value) if value not in (None, "") else None


def row_to_trade(row: dict) -> Trade:
    return Trade(
        id=row["id"],
        symbol=row["symbol"],
        session_date=date.fromisoformat(row["session_date"]),
        bias=Bias(row["bias"]),
        entry_price=float(row["entry_price"]),
        entry_ts=int(row["entry_ts"]),
        stop_price=float(row["stop_price"]),
        target_price=float(row["target_price"]),
        quantity=float(row["quantity"]),
        risk_usd=float(row["risk_usd"]),
        exit_price=_opt_float(row, "exit_price"),
        exit_ts=int(float(row["exit_ts"])) if row.get("exit_ts") not in (None, "") else None,
        exit_reason=row.get("exit_reason") or "",
        fee_usd=_opt_float(row, "fee_usd") or 0.0,
        realized_pnl_usd=_opt_float(row, "realized_pnl_usd"),
        ml_confidence=_opt_float(row, "ml_confidence"),
    )


class TradeJournal:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record_trade(self, trade: Trade) -> None:
        is_new = not self.path.exists()
        with self.path.open("a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            if is_new:
                writer.writeheader()
            writer.writerow(trade_to_row(trade))
        logger.debug("Journaled trade %s (%s, %s)", trade.id, trade.symbol, trade.exit_reason)

    def load_trades(self) -> list[Trade]:
        if not self.path.exists():
            return []
        with self.path.open(newline="") as f:
            return [row_to_trade(row) for row in csv.DictReader(f)]

    def total_realized_pnl_usd(self) -> float:
        return sum(t.realized_pnl_usd or 0.0 for t in self.load_trades())

    def realized_pnl_since(self, since_ts: float) -> float:
        return sum(
            t.realized_pnl_usd or 0.0 for t in self.load_trades() if t.exit_ts is not None and t.exit_ts >= since_ts
        )
