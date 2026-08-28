"""Unit tests for the Yahoo provider's parsing/error handling, using a
mocked httpx.get -- no real network access, so these run the same
everywhere (including sandboxes where finance.yahoo.com is blocked)."""

from __future__ import annotations

from datetime import datetime

import httpx
import pytest

from rangebreak.data.yahoo import YahooDataError, YahooProvider
from rangebreak.timeutils import ET


class _FakeResponse:
    def __init__(self, *, status_code: int = 200, json_body=None, text: str = "", raise_on_json: Exception | None = None):
        self.status_code = status_code
        self._json_body = json_body
        self.text = text
        self._raise_on_json = raise_on_json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        if self._raise_on_json:
            raise self._raise_on_json
        return self._json_body


def _chart_payload(timestamps, opens, highs, lows, closes, volumes):
    return {
        "chart": {
            "result": [{
                "timestamp": timestamps,
                "indicators": {"quote": [{"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes}]},
            }],
            "error": None,
        }
    }


def test_span_too_wide_raises_without_making_a_request(monkeypatch):
    def boom(*a, **kw):
        raise AssertionError("should not have made a request")

    monkeypatch.setattr(httpx, "get", boom)
    provider = YahooProvider()
    start = datetime(2026, 1, 1, tzinfo=ET)
    end = datetime(2026, 2, 1, tzinfo=ET)  # 31 days, way over the ~8 day cap
    with pytest.raises(YahooDataError, match="only reliably covers"):
        provider.get_1m_candles("RY.TO", start, end)


def test_non_json_response_raises_clear_error(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(text="<html>please verify you're human</html>", raise_on_json=ValueError("no JSON")))
    provider = YahooProvider()
    start, end = datetime(2026, 3, 2, tzinfo=ET), datetime(2026, 3, 3, tzinfo=ET)
    with pytest.raises(YahooDataError, match="non-JSON response"):
        provider.get_1m_candles("RY.TO", start, end)


def test_chart_error_field_raises(monkeypatch):
    payload = {"chart": {"result": None, "error": {"code": "Not Found", "description": "No data found, symbol may be delisted"}}}
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(json_body=payload))
    provider = YahooProvider()
    start, end = datetime(2026, 3, 2, tzinfo=ET), datetime(2026, 3, 3, tzinfo=ET)
    with pytest.raises(YahooDataError, match="Not Found"):
        provider.get_1m_candles("NOTAREALTICKERXYZ", start, end)


def test_empty_result_list_returns_no_candles(monkeypatch):
    payload = {"chart": {"result": [], "error": None}}
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(json_body=payload))
    provider = YahooProvider()
    start, end = datetime(2026, 3, 2, tzinfo=ET), datetime(2026, 3, 3, tzinfo=ET)
    assert provider.get_1m_candles("RY.TO", start, end) == []


def test_null_bars_are_skipped_and_valid_bars_parsed_and_sorted(monkeypatch):
    ts = [1740000060, 1740000000, 1740000120]  # deliberately out of order
    opens = [101.0, 100.0, None]  # the third bar is a null (no trades that minute) -- must be skipped
    highs = [101.5, 100.5, 999]
    lows = [100.5, 99.5, 1]
    closes = [101.2, 100.2, 500]
    volumes = [10, None, 5]  # a missing volume must default to 0.0, not crash
    payload = _chart_payload(ts, opens, highs, lows, closes, volumes)
    monkeypatch.setattr(httpx, "get", lambda *a, **kw: _FakeResponse(json_body=payload))

    provider = YahooProvider()
    start, end = datetime(2026, 3, 2, tzinfo=ET), datetime(2026, 3, 3, tzinfo=ET)
    candles = provider.get_1m_candles("RY.TO", start, end)

    assert len(candles) == 2  # the null-open bar was dropped
    assert [c.ts.timestamp() for c in candles] == sorted(ts[:2])
    assert candles[0].volume == 0.0  # None volume defaulted, not crashed
    assert candles[1].open == 101.0 and candles[1].close == 101.2
