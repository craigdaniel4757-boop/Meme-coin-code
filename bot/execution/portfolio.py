"""In-memory portfolio bookkeeping shared by paper and live execution.

Tracks cash, open positions, and a running trade log. `Portfolio` itself
does no I/O -- persistence to SQLite is the execution provider's job (see
`position_to_row` / `trade_to_row` / `position_from_row` below, shared by
both providers so the DB schema mapping only lives in one place).
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field

from bot.data.models import Position, TakeProfitLevel, Trade


@dataclass
class Portfolio:
    cash_usd: float
    positions: dict[str, Position] = field(default_factory=dict)
    trade_log: list[Trade] = field(default_factory=list)
    mode: str = "paper"

    def held_quantity(self, position: Position) -> float:
        return position.quantity * position.remaining_fraction

    def equity(self, current_prices: dict[str, float]) -> float:
        value = self.cash_usd
        for pos in self.positions.values():
            price = current_prices.get(pos.pair_address, pos.entry_price)
            value += price * self.held_quantity(pos)
        return value

    def apply_buy(self, position: Position, cost_usd: float, fee_usd: float) -> Trade:
        self.cash_usd -= cost_usd + fee_usd
        self.positions[position.id] = position
        trade = Trade(
            id=str(uuid.uuid4()),
            position_id=position.id,
            chain_id=position.chain_id,
            pair_address=position.pair_address,
            symbol=position.symbol,
            side="buy",
            price=position.entry_price,
            quantity=position.quantity,
            fee_usd=fee_usd,
            timestamp=time.time(),
            reason=f"entry ({position.strategy_name})",
            kind="entry",
        )
        self.trade_log.append(trade)
        return trade

    def apply_sell(
        self, position: Position, fraction: float, price: float, fee_usd: float, reason: str, kind: str = ""
    ) -> Trade:
        fraction = max(0.0, min(fraction, position.remaining_fraction))
        qty = position.quantity * fraction
        proceeds = qty * price
        cost_basis = qty * position.entry_price
        realized = proceeds - cost_basis - fee_usd

        self.cash_usd += proceeds - fee_usd
        position.remaining_fraction -= fraction

        trade = Trade(
            id=str(uuid.uuid4()),
            position_id=position.id,
            chain_id=position.chain_id,
            pair_address=position.pair_address,
            symbol=position.symbol,
            side="sell",
            price=price,
            quantity=qty,
            fee_usd=fee_usd,
            timestamp=time.time(),
            reason=reason,
            realized_pnl_usd=realized,
            kind=kind,
        )
        self.trade_log.append(trade)

        if position.remaining_fraction <= 1e-6:
            position.status = "closed"
            self.positions.pop(position.id, None)

        return trade

    def daily_realized_pnl(self, since_ts: float) -> float:
        return sum(t.realized_pnl_usd or 0.0 for t in self.trade_log if t.timestamp >= since_ts)


def position_to_row(position: Position) -> dict:
    return {
        "id": position.id,
        "chain_id": position.chain_id,
        "pair_address": position.pair_address,
        "base_token_address": position.base_token_address,
        "symbol": position.symbol,
        "entry_price": position.entry_price,
        "quantity": position.quantity,
        "entry_time": position.entry_time,
        "stop_loss_price": position.stop_loss_price,
        "trailing_stop_price": position.trailing_stop_price,
        "high_water_mark": position.high_water_mark,
        "remaining_fraction": position.remaining_fraction,
        "strategy_name": position.strategy_name,
        "status": position.status,
        "take_profit_json": json.dumps(
            [
                {"gain_pct": lvl.gain_pct, "fraction": lvl.fraction, "filled": lvl.filled}
                for lvl in position.take_profit_levels
            ]
        ),
        "closed_time": None if position.status == "open" else time.time(),
        "realized_pnl_usd": None,
    }


def trade_to_row(trade: Trade, mode: str) -> dict:
    return {
        "id": trade.id,
        "position_id": trade.position_id,
        "chain_id": trade.chain_id,
        "pair_address": trade.pair_address,
        "symbol": trade.symbol,
        "side": trade.side,
        "price": trade.price,
        "quantity": trade.quantity,
        "fee_usd": trade.fee_usd,
        "ts": trade.timestamp,
        "reason": trade.reason,
        "realized_pnl_usd": trade.realized_pnl_usd,
        "mode": mode,
        "kind": trade.kind,
    }


def position_from_row(row: sqlite3.Row) -> Position:
    keys = row.keys()
    levels_raw = row["take_profit_json"] if "take_profit_json" in keys else None
    levels = [TakeProfitLevel(**lvl) for lvl in json.loads(levels_raw or "[]")]
    base_token_address = row["base_token_address"] if "base_token_address" in keys else ""
    return Position(
        id=row["id"],
        chain_id=row["chain_id"],
        pair_address=row["pair_address"],
        base_token_address=base_token_address or "",
        symbol=row["symbol"],
        entry_price=row["entry_price"],
        quantity=row["quantity"],
        entry_time=row["entry_time"],
        stop_loss_price=row["stop_loss_price"],
        take_profit_levels=levels,
        trailing_stop_price=row["trailing_stop_price"],
        high_water_mark=row["high_water_mark"] or row["entry_price"],
        remaining_fraction=(
            row["remaining_fraction"] if row["remaining_fraction"] is not None else 1.0
        ),
        strategy_name=row["strategy_name"] or "",
        status=row["status"],
    )
