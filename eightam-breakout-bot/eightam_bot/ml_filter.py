"""Optional statistical confidence filter for retest entries.

Not required for the strategy to work -- every rule in docs/STRATEGY.md is
fully mechanical, and the bot trades identically with this disabled (the
default: `ml_filter.enabled: false`). What this adds: a small classifier
trained on your OWN backtested trade history that scores each new setup's
probability of reaching target before stop, using only features knowable at
the moment of the breakout (no lookahead). If enabled and a setup's score
falls below `ml_filter.min_confidence`, the live/paper runner skips that
day's trade instead of taking it -- see cli.py.

Train it with `python -m eightam_bot train-filter` after running a backtest
with enough history -- see README. Logistic regression, not a deeper model,
is a deliberate choice: at one trade per symbol per day, realistic training
sets are small (dozens to low hundreds of rows even over a long backtest),
and a simple, low-variance model is far less likely to just memorize noise
on a set that size than a more expressive one would be. `RetestFilter.train`
prints an explicit warning below a recommended minimum sample size rather
than silently handing back an overfit model with no indication of how thin
the data behind it was.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

from eightam_bot.models import Bias, BreakoutEvent, SessionRange
from eightam_bot.strategy import DayState
from eightam_bot.timeutils import to_ny

logger = logging.getLogger(__name__)

MIN_TRAINING_SAMPLES = 40
FEATURE_NAMES = ["range_width_pct", "breakout_strength_pct", "minutes_to_breakout", "bias_is_long", "day_of_week"]


@dataclass(slots=True)
class SetupFeatures:
    range_width_pct: float  # the 8am range's width relative to its own midpoint -- a tight vs. wide day
    breakout_strength_pct: float  # how far the breakout candle closed beyond the range boundary
    minutes_to_breakout: float  # minutes after 9:30 the breakout happened -- earlier vs. later in the window
    bias_is_long: float  # 1.0 / 0.0 -- kept numeric for sklearn rather than a Bias enum member
    day_of_week: float  # 0=Mon .. 4=Fri

    def as_row(self) -> list[float]:
        return [
            self.range_width_pct, self.breakout_strength_pct, self.minutes_to_breakout,
            self.bias_is_long, self.day_of_week,
        ]


def extract_features(
    range_: SessionRange, breakout: BreakoutEvent, session_date: date, tz: ZoneInfo
) -> SetupFeatures | None:
    """Takes the raw pieces (rather than a whole `DayState`) so the live
    runner can call this straight off a `BreakoutDetected` event's own
    fields, with no dependency on strategy.py's internal state beyond the
    small, already-public event types. `build_training_set` below is the
    other caller, unpacking a completed backtest's `DayState`s into the
    same three arguments."""
    if range_.midpoint == 0:
        return None

    breakout_local = to_ny(breakout.breakout_ts, tz)
    window_open = breakout_local.replace(hour=9, minute=30, second=0, microsecond=0)
    minutes_to_breakout = max((breakout_local - window_open).total_seconds() / 60, 0.0)
    boundary = range_.high if breakout.bias is Bias.LONG else range_.low

    return SetupFeatures(
        range_width_pct=range_.width / range_.midpoint * 100,
        breakout_strength_pct=(abs(breakout.breakout_price - boundary) / boundary * 100) if boundary else 0.0,
        minutes_to_breakout=minutes_to_breakout,
        bias_is_long=1.0 if breakout.bias is Bias.LONG else 0.0,
        day_of_week=float(session_date.weekday()),
    )


def build_training_set(days: list[DayState], tz: ZoneInfo) -> tuple[list[SetupFeatures], list[int]]:
    """One row per day that actually reached a *closed* trade -- days that
    never broke out, never retested, or whose trade is still open (shouldn't
    happen after a finished backtest, but guarded anyway) contribute nothing
    to label the model can learn from."""
    features: list[SetupFeatures] = []
    labels: list[int] = []
    for day in days:
        if day.trade is None or day.trade.realized_pnl_usd is None:
            continue
        if day.session_range is None or day.breakout is None:
            continue
        feats = extract_features(day.session_range, day.breakout, day.session_date, tz)
        if feats is None:
            continue
        features.append(feats)
        labels.append(1 if day.trade.realized_pnl_usd > 0 else 0)
    return features, labels


class RetestFilter:
    """Thin wrapper around a trained sklearn `LogisticRegression`. sklearn
    is only imported inside `train`/`load` -- everything else in this
    project works without it installed, and it's only needed at all when
    `ml_filter.enabled: true`."""

    def __init__(self, model=None) -> None:
        self._model = model

    @classmethod
    def train(cls, features: list[SetupFeatures], labels: list[int]) -> "RetestFilter":
        if len(features) < MIN_TRAINING_SAMPLES:
            logger.warning(
                "Training the retest filter on only %d example(s) -- recommended minimum is %d. "
                "A model built on this little data is at real risk of just memorizing noise. Treat "
                "any confidence score it produces with proportional skepticism, and prefer backtesting "
                "over a longer window (more symbols, more history) before actually relying on it.",
                len(features), MIN_TRAINING_SAMPLES,
            )
        if len(set(labels)) < 2:
            raise ValueError(
                "Every training example has the same outcome (all wins or all losses) -- "
                "a classifier can't learn anything from that. Backtest over a longer window."
            )

        from sklearn.linear_model import LogisticRegression

        model = LogisticRegression(max_iter=1000)
        model.fit([f.as_row() for f in features], labels)
        return cls(model)

    def predict_confidence(self, features: SetupFeatures) -> float:
        """Probability (0-1) this setup reaches target before stop, per the
        trained model."""
        if self._model is None:
            raise RuntimeError("RetestFilter has no trained model loaded")
        proba = self._model.predict_proba([features.as_row()])[0]
        classes = list(self._model.classes_)
        return float(proba[classes.index(1)])

    def save(self, path: str) -> None:
        import joblib

        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self._model, path)
        logger.info("Saved retest filter model to %s", path)

    @classmethod
    def load(cls, path: str) -> "RetestFilter":
        import joblib

        return cls(joblib.load(path))
