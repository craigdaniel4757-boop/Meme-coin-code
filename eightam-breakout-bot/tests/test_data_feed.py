"""CSVDataFeed and YFinanceDataFeed tests. CCXTDataFeed itself isn't unit
tested here -- see the README's testing note -- but the pagination-free CSV
path needs no mocking at all, and YFinanceDataFeed's chunking/dedup/history-
cap logic is real code worth covering even though the actual Yahoo Finance
HTTP call has to be faked: a `_FakeYf`/`_FakeTicker` pair stands in for the
`yfinance` module so `YFinanceDataFeed`'s own logic runs unmodified against
controlled DataFrames instead of the network.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd
import pytest

from eightam_bot.data_feed import CSVDataFeed, YFinanceDataFeed, _yf_frame_to_candles


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


# --- _yf_frame_to_candles ------------------------------------------------------


def test_yf_frame_to_candles_converts_rows():
    idx = pd.DatetimeIndex(["2024-01-08 08:00:00-05:00", "2024-01-08 08:01:00-05:00"])
    df = pd.DataFrame(
        {
            "Open": [100.0, 101.0], "High": [102.0, 103.0], "Low": [99.0, 100.5],
            "Close": [101.0, 102.0], "Volume": [1000, 1500],
        },
        index=idx,
    )

    candles = _yf_frame_to_candles(df)

    assert len(candles) == 2
    assert candles[0].open == 100.0
    assert candles[0].high == 102.0
    assert candles[0].low == 99.0
    assert candles[0].close == 101.0
    assert candles[0].volume == 1000.0
    # 2024-01-08 08:00:00 EST (UTC-5) == 13:00:00 UTC
    expected_ts = int(dt.datetime(2024, 1, 8, 13, 0, tzinfo=dt.timezone.utc).timestamp())
    assert candles[0].timestamp == expected_ts
    assert candles[1].timestamp == expected_ts + 60


def test_yf_frame_to_candles_handles_missing_volume():
    idx = pd.DatetimeIndex(["2024-01-08 08:00:00-05:00"])
    df = pd.DataFrame({"Open": [1.0], "High": [1.0], "Low": [1.0], "Close": [1.0]}, index=idx)

    [candle] = _yf_frame_to_candles(df)
    assert candle.volume == 0.0


@pytest.mark.parametrize("df", [pd.DataFrame(), None])
def test_yf_frame_to_candles_empty_or_none_returns_empty_list(df):
    assert _yf_frame_to_candles(df) == []


# --- YFinanceDataFeed (network faked) ------------------------------------------


class _FakeTicker:
    """Returns one queued DataFrame per `.history()` call, in order --
    stands in for a real yfinance Ticker so tests can control exactly what
    each chunked request "returns" without touching the network."""

    def __init__(self, frames: list[pd.DataFrame]) -> None:
        self._frames = list(frames)
        self.calls: list[dict] = []

    def history(self, **kwargs):
        self.calls.append(kwargs)
        return self._frames.pop(0) if self._frames else pd.DataFrame()


class _FakeYf:
    def __init__(self, ticker: _FakeTicker) -> None:
        self._ticker = ticker

    def Ticker(self, symbol):
        return self._ticker


def _bar(ts_str: str, price: float) -> pd.DataFrame:
    idx = pd.DatetimeIndex([ts_str])
    return pd.DataFrame({"Open": [price], "High": [price], "Low": [price], "Close": [price], "Volume": [1.0]}, index=idx)


def _frame(*rows: tuple[str, float]) -> pd.DataFrame:
    return pd.concat([_bar(ts, price) for ts, price in rows])


@pytest.mark.asyncio
async def test_yfinance_feed_stitches_chunks_and_dedupes_overlap():
    # Two 7-day chunks with one overlapping timestamp between them -- the
    # second chunk's copy of it must be dropped, not double-counted. The
    # fake bars' own timestamps are fixed illustrative values -- _FakeTicker
    # returns them verbatim regardless of what's requested -- but since_ts/
    # until_ts themselves must be recent (relative to whenever this test
    # actually runs) to avoid tripping the unrelated 30-day clamp below.
    chunk1 = _frame(("2024-01-08 08:00:00-05:00", 1.0), ("2024-01-08 08:01:00-05:00", 2.0))
    chunk2 = _frame(("2024-01-08 08:01:00-05:00", 2.0), ("2024-01-08 08:02:00-05:00", 3.0))
    ticker = _FakeTicker([chunk1, chunk2])

    feed = YFinanceDataFeed(request_delay_seconds=0.0)
    feed._yf = _FakeYf(ticker)

    now = int(dt.datetime.now(tz=dt.timezone.utc).timestamp())
    since_ts = now - 10 * 86400  # > CHUNK_DAYS (7) -- forces two chunked requests
    until_ts = now

    candles = await feed.fetch_historical_candles("RY", "1m", since_ts, until_ts)

    assert len(ticker.calls) == 2
    assert len(candles) == 3  # 2 + 2 rows, one duplicate timestamp removed
    assert [c.timestamp for c in candles] == sorted(c.timestamp for c in candles)


@pytest.mark.asyncio
async def test_yfinance_feed_clamps_1m_history_to_30_days():
    ticker = _FakeTicker([pd.DataFrame()])
    feed = YFinanceDataFeed(request_delay_seconds=0.0)
    feed._yf = _FakeYf(ticker)

    now = int(dt.datetime.now(tz=dt.timezone.utc).timestamp())
    since_ts = now - 90 * 86400  # far beyond Yahoo's ~30-day 1m history limit
    await feed.fetch_historical_candles("RY", "1m", since_ts, now)

    # The (single, empty-result) chunk request should have started from
    # ~30 days ago, not the originally requested 90-days-ago.
    requested_start = ticker.calls[0]["start"]
    assert (now - requested_start.timestamp()) < 31 * 86400


@pytest.mark.asyncio
async def test_yfinance_feed_does_not_chunk_or_clamp_coarser_timeframes():
    # The 7-day chunking and 30-day cap are both specific to 1m data --
    # a 90-day daily-bar request should be a single, unclamped call, not
    # ~13 chunked ones.
    ticker = _FakeTicker([pd.DataFrame()])
    feed = YFinanceDataFeed(request_delay_seconds=0.0)
    feed._yf = _FakeYf(ticker)

    now = int(dt.datetime.now(tz=dt.timezone.utc).timestamp())
    since_ts = now - 90 * 86400
    await feed.fetch_historical_candles("RY", "1d", since_ts, now)

    assert len(ticker.calls) == 1
    requested_start = ticker.calls[0]["start"]
    assert requested_start.timestamp() == pytest.approx(since_ts, abs=1)


@pytest.mark.asyncio
async def test_yfinance_feed_fetch_recent_requests_prepost_and_respects_limit():
    frame = _frame(
        ("2024-01-08 08:00:00-05:00", 1.0), ("2024-01-08 08:01:00-05:00", 2.0), ("2024-01-08 08:02:00-05:00", 3.0)
    )
    ticker = _FakeTicker([frame])
    feed = YFinanceDataFeed()
    feed._yf = _FakeYf(ticker)

    recent = await feed.fetch_recent_candles("RY", "1m", limit=2)

    assert ticker.calls[0]["prepost"] is True  # the 8am range is pre-market -- see the class docstring
    assert [c.close for c in recent] == [2.0, 3.0]
