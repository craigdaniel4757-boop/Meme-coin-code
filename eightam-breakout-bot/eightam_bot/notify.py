"""Optional Telegram / Discord alerts.

Best-effort: a failed notification is logged and swallowed rather than
allowed to interrupt the trading loop -- alerting should never be able to
take down trading.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)


async def send_telegram_message(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url, json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
            )
            resp.raise_for_status()
    except (httpx.TransportError, httpx.HTTPStatusError) as exc:
        logger.warning("Telegram notification failed: %s", exc)


async def send_discord_message(text: str) -> None:
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json={"content": text[:2000]})
            resp.raise_for_status()
    except (httpx.TransportError, httpx.HTTPStatusError) as exc:
        logger.warning("Discord notification failed: %s", exc)


async def notify(text: str, cfg) -> None:
    """`cfg` is a NotificationsConfig (or anything with matching bool attrs)."""
    if getattr(cfg, "telegram_enabled", False):
        await send_telegram_message(text)
    if getattr(cfg, "discord_enabled", False):
        await send_discord_message(text)
