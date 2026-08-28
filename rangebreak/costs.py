"""Tick-grid rounding and fill-price modeling.

Comparisons like "trades below the range low by at least 1 tick" are done
in integer tick units rather than on raw floats, so a rule meant to be
exact ("1 tick") can't silently pass or fail because of binary
floating-point rounding noise (e.g. 0.1 + 0.2 != 0.3).
"""

from __future__ import annotations

from .models import BacktestConfig


def to_ticks(price: float, tick_size: float) -> int:
    return round(price / tick_size)


def from_ticks(n: int, tick_size: float) -> float:
    return round(n * tick_size, 10)


def round_to_tick(price: float, tick_size: float) -> float:
    return from_ticks(to_ticks(price, tick_size), tick_size)


def _adverse_ticks(cfg: BacktestConfig) -> float:
    """Half the spread (you cross it to get filled) plus configured slippage."""
    return cfg.spread_ticks / 2.0 + cfg.slippage_ticks


def entry_fill(nominal_price: float, is_long: bool, cfg: BacktestConfig) -> float:
    """A marketable fill at the breakout candle's close: pay half the
    spread plus slippage, against you."""
    delta = _adverse_ticks(cfg) * cfg.tick_size
    price = nominal_price + delta if is_long else nominal_price - delta
    return round_to_tick(price, cfg.tick_size)


def stop_fill(stop_price: float, is_long: bool, cfg: BacktestConfig) -> float:
    """A triggered stop is modeled as an immediate marketable order, so it
    pays the same spread+slippage penalty as a marketable entry."""
    delta = _adverse_ticks(cfg) * cfg.tick_size
    price = stop_price - delta if is_long else stop_price + delta
    return round_to_tick(price, cfg.tick_size)


def target_fill(target_price: float, cfg: BacktestConfig) -> float:
    """The take-profit is modeled as a resting limit order at the target
    price: filled at that price with no added adverse slippage."""
    return round_to_tick(target_price, cfg.tick_size)


def eod_fill(last_price: float, is_long: bool, cfg: BacktestConfig) -> float:
    """An end-of-day close-out is a discretionary marketable order, same
    cost treatment as the entry."""
    delta = _adverse_ticks(cfg) * cfg.tick_size
    price = last_price - delta if is_long else last_price + delta
    return round_to_tick(price, cfg.tick_size)
