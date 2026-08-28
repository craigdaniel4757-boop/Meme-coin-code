from fastapi.testclient import TestClient

from rangebreak.app import build_app

client = TestClient(build_app())


def test_instruments_endpoint():
    res = client.get("/api/instruments")
    assert res.status_code == 200
    assert "SPY" in res.json()["demo_tickers"]


def test_backtest_endpoint_synthetic_default():
    res = client.get("/api/backtest", params={"ticker": "spy", "start": "2026-03-02", "end": "2026-03-27", "source": "synthetic"})
    assert res.status_code == 200
    body = res.json()
    assert body["ticker"] == "SPY"  # normalized to uppercase
    assert len(body["days"]) == 20
    assert body["summary"]["days_analyzed"] == 20
    assert "win_rate_pct" in body["summary"]


def test_backtest_endpoint_rejects_end_before_start():
    res = client.get("/api/backtest", params={"ticker": "SPY", "start": "2026-03-27", "end": "2026-03-02"})
    assert res.status_code == 400


def test_backtest_endpoint_rejects_bad_date():
    res = client.get("/api/backtest", params={"ticker": "SPY", "start": "not-a-date", "end": "2026-03-27"})
    assert res.status_code == 400


def test_backtest_endpoint_rejects_unknown_source():
    res = client.get("/api/backtest", params={"ticker": "SPY", "start": "2026-03-02", "end": "2026-03-27", "source": "bogus"})
    assert res.status_code == 400


def test_day_endpoint_returns_candles_and_trade():
    res = client.get("/api/day", params={"ticker": "SPY", "date": "2026-03-02", "source": "synthetic"})
    assert res.status_code == 200
    body = res.json()
    assert body["trade"]["date"] == "2026-03-02"
    assert len(body["candles"]) == 540
    assert set(body["candles"][0].keys()) == {"t", "o", "h", "l", "c", "v"}
    assert "range_start" in body["windows"]


def test_day_endpoint_cost_params_affect_result():
    base = client.get("/api/day", params={"ticker": "SPY", "date": "2026-03-02", "source": "synthetic"}).json()
    zero_cost = client.get(
        "/api/day",
        params={"ticker": "SPY", "date": "2026-03-02", "source": "synthetic", "spread_ticks": 0, "slippage_ticks": 0, "commission_per_share": 0},
    ).json()
    if base["trade"]["entry_price"] is not None:
        assert base["trade"]["entry_price"] != zero_cost["trade"]["entry_price"]


def test_index_page_served():
    res = client.get("/")
    assert res.status_code == 200
    assert "rangebreak" in res.text.lower()


def test_vendored_chart_library_served():
    res = client.get("/static/vendor/lightweight-charts.standalone.production.js")
    assert res.status_code == 200
    assert b"LightweightCharts" in res.content
