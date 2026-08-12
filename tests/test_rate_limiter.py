"""AsyncRateLimiter tests: both the count-per-window cap and the
minimum-spacing-between-calls behavior that keeps requests from bursting
even while staying under the per-minute average.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from bot.data.rate_limiter import AsyncRateLimiter


def test_rejects_non_positive_rate():
    with pytest.raises(ValueError):
        AsyncRateLimiter(0)
    with pytest.raises(ValueError):
        AsyncRateLimiter(-5)


async def test_acquire_enforces_minimum_spacing_under_concurrent_load():
    """Regression test: a pure count-per-window cap lets every call in the
    budget land in the same instant as long as the trailing-window total
    stays under the limit -- exactly the burst pattern that trips a
    server's short-window throttling even while its per-minute average is
    respected. Firing many acquire() calls at once must still come out
    evenly spaced, not bursted."""
    limiter = AsyncRateLimiter(rate_per_minute=600, window_seconds=60.0)  # min spacing = 0.1s
    timestamps: list[float] = []

    async def acquire_and_record() -> None:
        await limiter.acquire()
        timestamps.append(time.monotonic())

    await asyncio.gather(*(acquire_and_record() for _ in range(5)))

    timestamps.sort()
    gaps = [b - a for a, b in zip(timestamps, timestamps[1:])]
    assert all(gap >= 0.08 for gap in gaps)  # ~0.1s minimum, with some scheduling slack


async def test_acquire_respects_window_count_cap():
    """Spacing alone isn't the whole story either -- a burst of calls
    spaced *just* far enough apart must still be capped by the total count
    allowed within the window."""
    limiter = AsyncRateLimiter(rate_per_minute=2, window_seconds=0.3)
    start = time.monotonic()
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()  # window already holds 2 -> must wait for the first to age out
    elapsed = time.monotonic() - start
    assert elapsed >= 0.25


async def test_current_load_reflects_recent_acquisitions():
    limiter = AsyncRateLimiter(rate_per_minute=100, window_seconds=60.0)
    assert limiter.current_load == 0
    await limiter.acquire()
    assert limiter.current_load == 1
