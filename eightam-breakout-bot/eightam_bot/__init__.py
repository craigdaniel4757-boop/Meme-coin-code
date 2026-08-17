"""eightam-breakout-bot: an automated implementation of the "8am break and
retest" intraday strategy -- mark the 8:00-8:15am New York session range,
wait for a confirmed break of it at or after 9:30am, enter on a retest of
the range's midpoint, manage risk mechanically, and optionally trade it live
through any ccxt-supported exchange. See the project README and
docs/STRATEGY.md for the full rationale.
"""

from __future__ import annotations

__version__ = "0.1.0"
