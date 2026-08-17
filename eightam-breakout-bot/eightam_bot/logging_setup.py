"""Central logging configuration."""

from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    if level.upper() != "DEBUG":
        # ccxt's underlying HTTP stack is chatty at INFO about every single
        # request, which drowns out the bot's own range/breakout/trade log lines.
        for noisy in ("ccxt", "urllib3", "aiohttp"):
            logging.getLogger(noisy).setLevel(logging.WARNING)
