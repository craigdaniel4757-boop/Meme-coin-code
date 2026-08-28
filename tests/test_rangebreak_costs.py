from rangebreak.costs import eod_fill, entry_fill, from_ticks, round_to_tick, stop_fill, target_fill, to_ticks
from rangebreak.models import BacktestConfig


def test_to_ticks_and_back():
    assert to_ticks(100.03, 0.01) == 10003
    assert from_ticks(10003, 0.01) == 100.03
    assert round_to_tick(100.034999, 0.01) == 100.03


def test_entry_fill_is_adverse_to_direction():
    cfg = BacktestConfig(tick_size=0.01, spread_ticks=2.0, slippage_ticks=1.0)  # 2 ticks adverse total
    assert entry_fill(100.00, is_long=True, cfg=cfg) == 100.02
    assert entry_fill(100.00, is_long=False, cfg=cfg) == 99.98


def test_stop_fill_is_adverse_to_direction():
    cfg = BacktestConfig(tick_size=0.01, spread_ticks=2.0, slippage_ticks=1.0)
    assert stop_fill(100.00, is_long=True, cfg=cfg) == 99.98  # long stop sells lower
    assert stop_fill(100.00, is_long=False, cfg=cfg) == 100.02  # short stop buys back higher


def test_target_fill_has_no_adverse_slippage():
    cfg = BacktestConfig(tick_size=0.01, spread_ticks=4.0, slippage_ticks=3.0)
    assert target_fill(100.00, cfg=cfg) == 100.00


def test_eod_fill_is_adverse_like_entry():
    cfg = BacktestConfig(tick_size=0.01, spread_ticks=2.0, slippage_ticks=1.0)
    assert eod_fill(100.00, is_long=True, cfg=cfg) == 99.98
    assert eod_fill(100.00, is_long=False, cfg=cfg) == 100.02


def test_zero_cost_config_fills_at_nominal_price():
    cfg = BacktestConfig(tick_size=0.01, spread_ticks=0.0, slippage_ticks=0.0)
    assert entry_fill(50.00, True, cfg) == 50.00
    assert stop_fill(50.00, False, cfg) == 50.00
