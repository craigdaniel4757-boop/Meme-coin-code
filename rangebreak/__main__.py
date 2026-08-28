"""`python -m rangebreak` -- runs the backtester website locally.

Binds 127.0.0.1 by default (not 0.0.0.0), matching `python -m bot web`'s
posture elsewhere in this repo: nothing outside your own machine can reach
it unless you deliberately pass a different --host. This is a backtesting
and visualization tool, not an order-placing bot -- there is no code path
here to a broker or exchange, live or paper.
"""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m rangebreak", description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--reload", action="store_true", help="Auto-reload on source changes (development only).")
    args = parser.parse_args()

    uvicorn.run("rangebreak.app:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
