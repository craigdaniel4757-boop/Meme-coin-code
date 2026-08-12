"""A small asyncio-friendly rate limiter shared by every HTTP/RPC client.

Implements a sliding-window leaky bucket: at most `rate_per_minute` calls to
`acquire()` are allowed to return within any trailing 60-second window.
Callers that would exceed the limit simply await until a slot frees up.
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
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                self._evict_old(now)
                if len(self._timestamps) < self._rate:
                    self._timestamps.append(now)
                    return
                wait_for = self._window - (now - self._timestamps[0])
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
