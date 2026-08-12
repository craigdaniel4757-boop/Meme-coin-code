"""A small asyncio-friendly rate limiter shared by every HTTP/RPC client.

Implements a sliding-window leaky bucket -- at most `rate_per_minute`
calls to `acquire()` are allowed to return within any trailing 60-second
window -- *plus* a minimum spacing between individual calls (`60 /
rate_per_minute` apart). The spacing is the important part: a pure
count-based window still lets every allowed call land in a single tight
burst (e.g. all 28 of a 28/min budget firing within the same second) as
long as the trailing-60s total stays under the cap, and that's exactly
the kind of pattern that trips a server's short-window burst protection
even while its per-minute average is being respected. Real APIs
(GeckoTerminal in particular) enforce that kind of burst limit
separately from -- and often more strictly than -- their advertised
per-minute rate, so evenly pacing requests matters as much as capping
their count.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque


class AsyncRateLimiter:
    def __init__(self, rate_per_minute: int, window_seconds: float = 60.0) -> None:
        if rate_per_minute <= 0:
            raise ValueError("rate_per_minute must be positive")
        self._rate = rate_per_minute
        self._window = window_seconds
        self._min_interval = window_seconds / rate_per_minute
        self._timestamps: deque[float] = deque()
        self._last_acquired: float | None = None
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                self._evict_old(now)
                since_last = (now - self._last_acquired) if self._last_acquired is not None else self._min_interval
                window_ok = len(self._timestamps) < self._rate
                spacing_ok = since_last >= self._min_interval
                if window_ok and spacing_ok:
                    self._timestamps.append(now)
                    self._last_acquired = now
                    return
                wait_for_window = (self._window - (now - self._timestamps[0])) if self._timestamps else 0.0
                wait_for_spacing = self._min_interval - since_last
                wait_for = max(wait_for_window if not window_ok else 0.0, wait_for_spacing if not spacing_ok else 0.0)
            # Sleep outside the lock so other coroutines can also check in.
            await asyncio.sleep(max(wait_for, 0.01))

    def _evict_old(self, now: float) -> None:
        cutoff = now - self._window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

    @property
    def current_load(self) -> int:
        now = time.monotonic()
        self._evict_old(now)
        return len(self._timestamps)
