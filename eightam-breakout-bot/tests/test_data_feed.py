"""CSVDataFeed tests. CCXTDataFeed (network-backed) isn't unit tested here --
see the README's testing note -- but the pagination-free CSV path needs no
mocking and is straightforward to verify directly.
"""

from __future__ import annotations

import pytest

from eightam_bot.data_feed import CSVDataFeed


def _write_csv(path, rows: list[tuple[int, float, float, float, float, float]]) -> None:
    lines = ["timestamp,open,high,low,close,volume"]
    lines += [",".join(str(v) for v in row) for row in rows]
    path.write_text("\n".join(lines))


@pytest.mark.asyncio
async def test_csv_feed_loads_and_sorts(tmp_path):
    path = tmp_path / "candles.csv"
    _write_csv(path, [(200, 2, 2, 2, 2, 2), (100, 1, 1, 1, 1, 1), (300, 3, 3, 3, 3, 3)])

    feed = CSVDataFeed(str(path))
    all_candles = await feed.fetch_recent_candles("BTC/USDT", "1m", limit=10)

    assert [c.timestamp for c in all_candles] == [100, 200, 300]  # sorted, despite unsorted input


@pytest.mark.asyncio
async def test_csv_feed_fetch_recent_respects_limit(tmp_path):
    path = tmp_path / "candles.csv"
    _write_csv(path, [(i, 1, 1, 1, 1, 1) for i in range(10)])

    feed = CSVDataFeed(str(path))
    recent = await feed.fetch_recent_candles("BTC/USDT", "1m", limit=3)

    assert [c.timestamp for c in recent] == [7, 8, 9]


@pytest.mark.asyncio
async def test_csv_feed_fetch_historical_filters_by_range(tmp_path):
    path = tmp_path / "candles.csv"
    _write_csv(path, [(i, 1, 1, 1, 1, 1) for i in range(0, 100, 10)])

    feed = CSVDataFeed(str(path))
    window = await feed.fetch_historical_candles("BTC/USDT", "1m", since_ts=20, until_ts=60)

    assert [c.timestamp for c in window] == [20, 30, 40, 50, 60]


def test_csv_feed_raises_on_missing_columns(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("timestamp,open,high,low,close\n1,1,1,1,1\n")  # missing "volume"

    with pytest.raises(ValueError, match="volume"):
        CSVDataFeed(str(path))
