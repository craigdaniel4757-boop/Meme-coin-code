"""CLI wiring tests. Mainly the paper/live guard against non-ccxt data
sources: yfinance has no order-execution capability at all, so `_run` (the
shared paper/live entrypoint) must refuse to start rather than silently try
to poll a stock ticker through a crypto exchange.
"""

from __future__ import annotations

import pytest

from eightam_bot.cli import _run
from eightam_bot.config import load_config


@pytest.mark.asyncio
async def test_run_refuses_yfinance_data_source_for_paper_or_live():
    cfg = load_config("config/default.yaml")  # defaults to market.data_source: "yfinance"
    assert cfg.market.data_source == "yfinance"

    with pytest.raises(SystemExit):
        await _run(cfg, live_confirmed=False)


@pytest.mark.asyncio
async def test_run_refuses_yfinance_even_when_live_confirmed():
    cfg = load_config("config/default.yaml")

    with pytest.raises(SystemExit):
        await _run(cfg, live_confirmed=True)  # the risk flag doesn't bypass the data-source check
