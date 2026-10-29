# 03 — Business & Monetization: Premium Pixel Story Game

*Research date: 2026-10-29. Analyst brief for an original, premium pixel-art story game.*

**Legend:** **[V]** = verified via web search this session (URL inline) · **[E]** = estimate/model (my math or a third-party tracker) · **[BK]** = widely reported industry fact from background knowledge, not re-verified this session.

> **Limitations:** WebFetch could not reach `newsletter.gamediscover.co` or `steampageanalyzer.com` (blocked by the session's network allowlist), so GameDiscoverCo figures come from search summaries and secondary coverage. The shared web-search budget ran out before I could verify Undertale/OMORI sales, Apple Arcade/Netflix deal terms, or TikTok conversion data. Those items are marked [BK] or flagged as gaps.

---

## 0. Key takeaways

1. **The market is brutal and top-heavy.** About 19,000 Steam releases in 2025, and nearly half got fewer than 10 reviews. The #500 new game of 2024 grossed about $457k [V].
2. **Wishlists are inflated.** The median first-week conversion is about **0.10–0.15× launch wishlists**, roughly half the 2020–22 rate [V]. Target **50k+ wishlists** at launch.
3. **Price at $19.99.** The median price of top-selling new Steam games fell from $19.50 to $15.64 (2023–2025), and Carless says ">$25 is getting trickier" [V].
4. **The 2-hour refund rule punishes short games.** Ship 8–12 hours [V].
5. **Simplified Chinese plus Japanese at launch.** Chinese is about 24–34% of Steam users, roughly level with English [V].
6. **No Early Access for linear story** [V]. **Keep the IP.** Merch, sequels and licensing are where fandom hits compound.

---

## 1. Steam economics

**Revenue split.** Valve takes 30% on a title's first $10M of gross, 25% on $10M–$50M, and 20% above $50M. Soundtrack and DLC revenue counts toward those thresholds ([Neowin](https://www.neowin.net/news/valve-introduces-new-revenue-share-tiers-for-steam-promising-bigger-cuts-for-studios/), [Steamworks](https://partner.steamgames.com/doc/store/application/soundtrackapp)) [V]. GameDiscoverCo puts Valve's blended 2025 cut at about 24%, skewed by megahits ([GameDiscoverCo](https://newsletter.gamediscover.co/p/revealed-the-numbers-behind-steams)) [V]. **Plan on 30%.**

**From list price to developer net [E].** Tracker data implies developer net of about **41% of (units × USD list price)** over a lifetime, after discounts, regional pricing, refunds, VAT and the platform cut:
- *Look Outside*: about 638k units at $9.99, about $2.6M net.
- *Vampire Survivors*: about 13.6M units at $4.99, $28.2M net ([gamerevenuedata](https://gamerevenuedata.pages.dev/games/look-outside/), [VS](https://gamerevenuedata.pages.dev/games/vampire-survivors)).

**At $19.99, that is about $8.40 net per unit.**

| Market metric | Value |
|---|---|
| Steam releases 2023 / 2024 / 2025 | 14,111 / 18,558 / ~19,000+; ~49% of 2025 games had ≤10 reviews ([GamingOnLinux](https://www.gamingonlinux.com/2025/12/over-19000-games-have-released-on-steam-in-2025-with-nearly-half-seeing-fewer-than-10-reviews)) [V] |
| Games grossing >$100k on Steam in 2025 | 5,863 (Valve, GDC 2026) ([Spilled](https://spilled.gg/valve-games-steam)) [V] |
| 2024 new games, year-end gross: #250 / #500 / #1000 | $1.43M / $457k / $118k ([GameDiscoverCo](https://newsletter.gamediscover.co/p/the-shape-of-the-pc-new-game-market)) [V] |
| Median release | ~$249 gross (VG Insights/Alinea, secondary). Other methods give about $1k lifetime ([SPA](https://www.steampageanalyzer.com/blog/median-steam-game-2026)) [V, conflicting] |
| Steam total gross 2025 | ~$16–17.7B ([80.lv](https://80.lv/articles/steam-earned-usd16b-in-2025-but-nearly-half-of-19-000-games-got-under-10-reviews)) [V] |

**Wishlist conversion.**
- **GameDiscoverCo (Sept 2024–Sept 2025 launches):** the median first-week multiple is **0.15×** wishlists for games with over 25k wishlists, and about **0.10×** for games priced over $10 ([summary](https://gamedevreports.substack.com/p/gamediscoverco-the-state-of-steam), [original](https://newsletter.gamediscover.co/p/the-state-of-steam-wishlist-conversions)) [V].
- **Zukowski (cited secondhand):** first-month sales per wishlist fell from about 0.45 (2020–22) to 0.22 (2023–25). Wishlists lost value but still predict sales ([InvenGlobal](https://www.invenglobal.com/articles/27273/steam-wishlist-inflation-value-of-1-wishlist-cut-in-half-but-predictive-power-remains-unchanged)) [V].

**Popular Upcoming.** Valve publishes no threshold. Zukowski's older rule of thumb was **about 7–10k wishlists** for front-page placement on launch day, and velocity matters too [BK]. In 2026, Steam leaned on a personal release calendar for wishlisted games ([GameDiscoverCo](https://newsletter.gamediscover.co/p/how-steams-personal-calendar-is-supercharging)) [V headline]. **Targets [E]:** 30k wishlists is the floor, 50k is healthy, and 100k+ makes a breakout possible.

**Reviews and the algorithm.**
- **Score labels:** a game shows no score below 10 reviews. "Very Positive" needs 50+ reviews at 80%+, and "Overwhelmingly Positive" needs 500+ at 95%+ ([FirstLook](https://firstlook.gg/blog/how-many-steam-reviews-does-your-game-need-at-launch)) [V].
- **What drives recommendations:** the better-supported view is that Discovery Queue, More Like This and New & Trending respond to **revenue and wishlist/purchase velocity**. Review labels mostly change how buyers convert.
- **Zukowski's markers:** **about 250 reviews in month one and 1,000 in year one** to keep getting promoted ([80.lv](https://80.lv/articles/indie-game-should-have-1-000-reviews-to-get-promoted-by-steam)) [V]. A common heuristic is 30–60 sales per review [BK].

**Next Fest and demos.**
- **Volume:** 2,600+ demos in June 2025 ([GWO](https://gameworldobserver.com/2025/06/19/gamediscoverco-named-the-games-with-the-most-wishlists-following-the-june-2025s-steam-next-fest)) [V].
- **Valve's own data (2020):** the median game got **+292% converting wishlists** from Next Fest, with lower per-wishlist conversion (0.75×). The gain comes from volume ([GameDiscoverCo](https://newsletter.gamediscover.co/p/steam-demo-showcases-officially-good)) [V].
- **Who gains:** games mostly stay in their pre-fest tier, and gains accelerate above **2,000 pre-fest wishlists** ([HTMAG](https://howtomarketagame.com/2025/03/26/archive-january-2026-benchmarks-how-many-wishlists-can-i-get-from-steam-next-fest/)) [V].
- **Demo players to wishlists:** about 5 demo players per wishlist, and many shoppers wishlist without playing ([HTMAG Oct 2024](https://howtomarketagame.com/2024/11/04/how-was-the-october-2024-steam-next-fest/), [demo study](https://howtomarketagame.com/2024/06/24/do-demos-help-earn-wishlists-steam-next-fest-june-2024/)) [V].
- **For a story game:** release the demo **before** Next Fest and end it on a cliffhanger.

**Refunds (2 hours / 14 days).** The rule applies to every game regardless of length. The $3 *Paddle Paddle Paddle* reports a 21% refund rate (more than 55k refunds) despite 90% positive reviews, because players finished inside 2 hours ([TweakTown](https://tweaktown.com/news/112505/indie-developer-asks-valve-to-change-its-2-hour-refund-policy-as-55000-players-refunded-his-game-after-finishing-it/index.html)) [V]. The industry norm is under about 10% ([80.lv](https://80.lv/articles/steams-refund-rate-is-out-of-control/)) [V]. **Design rule:** no complete arc within 2 hours, a 6–12 hour main path, and a hook in the first 30–60 minutes.

**Discounts and calendar.**
- **Launch discount:** 10–20% is the norm [BK].
- **Cooldown:** 30 days between discounts ([Steamworks](https://partner.steamgames.com/doc/marketing/discounts)) [BK]. The launch discount must clear 30 days before a seasonal sale.
- **Winter Sale 2026:** Dec 17 to Jan 4 2027 ([GamesRadar](https://www.gamesradar.com/games/rpg/valve-just-revealed-the-steam-sales-and-events-for-the-rest-of-2026-and-besides-the-discounts-im-looking-at-the-party-based-rpg-fest-to-help-satisfy-those-post-clair-obscur-expedition-33-cravings)) [V].
- **2027:** Next Fest Feb 22–Mar 1 (register by Jan 10) and Jun 14–21 (register by Apr 25), plus an October edition. Summer Sale Jun 24–Jul 8 ([Feb](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027), [Jun](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027), [PC Gamer](https://www.pcgamer.com/games/steam-reveals-all-the-sale-dates-and-themed-events-for-the-first-half-of-2027/)) [V].
- **Themed fests** (2026 had a party-based RPG fest) are free visibility for games that fit.

**Regional pricing.** Valve's suggestions are optional and were raised in 2022 (+18% EU) ([Steamworks](https://partner.steamgames.com/doc/store/pricing), [PC Gamer](https://pcgamer.com/steams-recommended-prices-go-way-up-in-many-countries-18-in-europe-485-in-argentina)) [V]. The CNY price typically lands 40–60% below USD [E]. Use Valve's suggestions: cross-region leakage is negligible at indie scale, and regional pricing is what unlocks China and Brazil.

---

## 2. Pricing

**Market drift.** GameDiscoverCo's median price for the top 50 new Steam games by units went from **$19.50 (Feb 2023) to $15.64 (Oct 2025)**, while the mean barely moved ($21.80 to $21.41) ([GamesRadar](https://www.gamesradar.com/games/the-median-price-of-best-selling-new-games-on-steam-has-dropped-in-the-past-2-years-research-finds-charging-usd25-is-getting-trickier-as-players-compare-value-to-the-usd10-usd15-indie-titles), [GameDevReports](https://gamedevreports.substack.com/p/gamediscoverco-people-are-spending)) [V]. Zukowski's advice is that indies underprice: price about 20% above comparable hits ([premortem.games](https://premortem.games/?p=4989)) [V].

| Price | Pixel story/RPG comparables and outcomes |
|---|---|
| $9.99 | *Look Outside* (Devolver, 2025): 200k by Oct 2025, then **500k+ by Aug 2026** ([Niche Gamer](https://nichegamer.com/look-outside-tops-200k-copies-sold), [Techora](https://techora.ru/news/tirazh-khorror-rpg-look-outside-prevysil-2026-08-09)) [V]. *Undertale*, *To the Moon* [BK] |
| $14.99 | *Stardew Valley*: **50M+ units, all platforms (Feb 2026)** ([VGChartz](https://www.vgchartz.com/article/467162/stardew-valley-sales-top-50-million-units/)) [V]. *Balatro*: 5M by Jan 2025 [V] |
| $19.99 | *Dave the Diver*: **5M by Nov 2024** ([Gematsu](https://www.gematsu.com/2024/11/dave-the-diver-sales-top-five-million)) [V]. *OMORI*, *Celeste*, *Hollow Knight: Silksong* [BK] |
| $24.99 | *Deltarune* Ch. 1–4 (Jun 2025): Steam #1, about **1.3–1.38M Steam units** (trackers) ([SteamPulse](https://steampulse.org/game/1671210)) [E]. *Chained Echoes*, *Eastward*, *Animal Well*, *UFO 50* [BK] |
| $34.99 | *Sea of Stars*: 250k in launch week; **6M+ players** including Game Pass and PS Plus ([VGChartz](https://www.vgchartz.com/article/463140/sea-of-stars-tops-6-million-players/)) [V] |

**Length vs. price [E]:**
- Under 3 hours: $5–10, with high refund risk.
- 4–8 hours: $12.99–17.99.
- **8–15 hours: $19.99.**
- 20+ hours with RPG systems: $24.99.

Above $25, a pixel game needs JRPG scope or an existing franchise.

**Psychology:**
- Use .99 endings.
- A launch discount triggers wishlist notification emails.
- A $19.99 base keeps $11.99–13.99 sale prices healthy for years. A $9.99 base drops to $4.99.

**2025–26 context [BK]:**
- AAA moved to $70–80 (Mario Kart World $79.99).
- Xbox, PS5 (US) and Switch 1 hardware prices rose in 2025, and Switch 2 launched at $449.
- Game Pass Ultimate rose to $29.99 a month.

Indies at $15–25 now read as strong value, and players compare $25+ games against $10–15 indies [V].

---

## 3. Platforms

**Revenue mix evidence:**
- **Stardew** (Dec 2024): 26M of 41M on PC (~63%) and 7.9M on Switch (~19%). The rest is mobile, PlayStation and Xbox ([GamesRadar](https://www.gamesradar.com/games/simulation/cozy-farming-sim-stardew-valley-has-sold-over-41-million-copies-as-of-right-now-with-over-half-on-pc-and-almost-8-million-on-the-switch)) [V].
- **Balatro:** jumped 3.5M to 5M in one month after the mobile launch. Mobile net is estimated at $9.3M+ (AppMagic), excluding Apple Arcade ([GWO](https://gameworldobserver.com/2025/01/21/balatro-another-1-5-million-copies-total-5m-units), [PocketGamer.biz](https://www.pocketgamer.biz/balatro-exceeds-5-million-in-sales-on-all-platforms)) [V].
- **Vampire Survivors:** free-to-play mobile with ads and IAP, about 3M early downloads ([GWO](https://gameworldobserver.com/2023/01/17/vampire-survivors-mobile-3-million-downloads-appmagic)) [V]. That model fits loops, not stories.
- **Dave the Diver:** a staggered rollout, Steam (2023) → Switch (Oct 2023) → PlayStation (Apr 2024), with sales stepping 1M → 3M → 4M → 5M. Each port was a new launch [V].
- **Deltarune:** a simultaneous multi-platform launch that **led Switch 2 eShop digital units** in that console's launch window ([TweakTown](https://www.tweaktown.com/news/106614/toby-foxs-indie-rpg-deltarune-sold-more-digital-copies-on-switch-2-than-mario-kart-minecraft/index.html)) [V].
- **Dungeon Antiqua 2** (Japanese pixel RPG): 22.7k PC units in 9 months against **15.1k console units in 1.5 months** ([note.com](https://note.com/frenchbread/n/na2b3a4805a42?hl=en)) [V].
- **Counterpoints:** Darkest Dungeon's Switch revenue was about 7% of lifetime ([PC Gamer](https://www.pcgamer.com/indie-veterans-on-the-state-of-indie-games-on-nintendo-switch-versus-steam/)). Indie console sales are in a "meh" phase ([GameDiscoverCo](https://newsletter.gamediscover.co/p/its-ok-the-meh-ening-of-indie-console)), and the eShop is opaque and hit-driven ([MCV](https://www.mcvuk.com/business-news/i-literally-cannot-sell-units-on-switch-its-heartbreaking-and-it-makes-me-really-sad-for-the-eshop-why-indies-are-struggling-to-be-seen-on-the-switch-eshop/)) [V].

**Working mix for a pixel story game [E]:** Steam 55–70%, Switch/Switch 2 15–25%, PlayStation 8–15%, Xbox 3–8%, premium mobile 0–10%.

**Port timing.** Ports cost about $30–80k per platform including QA and certification [E]. Ship simultaneously if a partner funds it, since that concentrates marketing. Otherwise stagger ports 3–12 months apart for repeat launch moments.

**Subscriptions:**
- **Game Pass:** deals are "all over the place", combining a flat fee with engagement payments, and indie deal sizes **shrank in 2024** ([GWO](https://gameworldobserver.com/2024/03/29/game-pass-epic-exclusive-deals-reduced-for-indie-devs)) [V]. ID@Xbox reports more than $5B paid to indies over 12 years ([WN Hub](https://wnhub.io/news/stores-and-publishing/item-47371)) [V].
- **PS Plus:** Sony uses guaranteed buyouts. *Sword of the Sea*'s day-one PS Plus Extra deal "saved the game" ([Push Square](https://www.pushsquare.com/news/2025/09/it-saved-the-game-sword-of-the-sea-dev-praises-sony-explains-ps-plus-deal)) [V].
- **Gap:** Apple Arcade and Netflix terms are undisclosed. Netflix pared back licensed indies in 2024–25 [BK].
- **Verdict:** a finite story is consumed once, so subscriptions **do cannibalize**. Accept a deal only if the guarantee is at least the modeled lost platform sales, it is time-limited, and Steam is excluded. These deals work best as **dev funding** or a **year-2+ revival**.

**Steam Deck.** More than 25,000 games are Verified or Playable, and indies dominated Deck playtime in 2025 ([GamingOnLinux](https://www.gamingonlinux.com/2026/01/steam-deck-hits-25000-games-valve-have-rated-playable-or-verified), [Notebookcheck](https://www.notebookcheck.net/New-Valve-data-highlights-Steam-Deck-games-that-dominated-playtime-in-2025.1193955.0.html)) [V]. One indie game saw 10% of players on Deck at launch [V, anecdote]. Verified status is nearly free for a 2D game (controller UI, text readable at 800p), so make it mandatory.

---

## 4. Funding and publishing

**Publisher terms:**
- **Typical deal:** recoup-then-split on **net** revenue. Before recoup the split runs about 60/40 to 70/30 in the publisher's favor. After recoup it runs **50/50 to 70/30 for the developer**, averaging about 60/40.
- **Term (Voyer Law, 100+ deals, 2017–2025):** an average of 6.84 years with an advance and 4.18 years without ([GameDevReports/Voyer](https://gamedevreports.substack.com/p/voyer-law-publishing-agreements-in), [PC Gamer](https://pcgamer.com/what-a-good-and-bad-indie-game-publishing-deal-looks-like)) [V].
- **Red flags:** cross-collateralization, IP assignment, sequel lock-ins, and uncapped recoupable marketing ([Promise Legal](https://blog.promise.legal/game-publisher-agreements-indie-studios/)) [V].

A publisher earns its share when it brings funding, a proven genre audience (Devolver took the $10 jam-born *Look Outside* to 500k+), ports, localization, or China/Japan reach. **Hybrid [E]:** self-publish on PC in the West, license console or Asia rights to specialists, and always keep the IP.

**Kickstarter:**
- **Volume:** 441 successful game campaigns raised about **$26M in 2024**, against a 2013 peak of $51M ([GamesMarket](https://www.gamesmarket.global/the-creative-by-kickstarter-441-successful-video-game-kickstarter-campaigns-raised-dollar26-million-in-2024-7408bb999bd4538ef18ca1c62bbf0778/), [GameDevReports](https://gamedevreports.substack.com/p/kickstarter-in-2025-and-before)) [V].
- **Top 2025 game:** *Elestrals Awakened*, a pixel creature RPG, at about $1.1–1.4M ([GamesRadar](https://www.gamesradar.com/games/rpg/former-pokemon-caster-creates-the-most-funded-kickstarter-video-game-of-2025-raising-over-usd1-1-million-for-his-creature-collector-team-thanks-supporters-for-helping-us-make-this-dream-a-reality)) [V].
- **Earlier pixel RPGs [BK]:** Sea of Stars about $1.6M and Eiyuden Chronicle about $4.8M, both in 2020.
- **Verdict:** for a new IP, Kickstarter is validation and community-building more than funding. Expect $50–250k, minus 15–25% for fees and rewards [E].

**Early Access for story games: avoid.**
- In 2025, median release-month revenue was **40% of the median first Early Access month**, and only 20% of games out-earned their Early Access debut ([WN Hub](https://wnhub.io/news/stores-and-publishing/item-49521)) [V].
- Story fans wait for the finished game, and spoilers leak. *Spire of Sorcery* and *Sunless Skies* are cautionary cases ([GameDiscoverCo](https://newsletter.gamediscover.co/p/lessons-from-a-disappointing-game), [Boss Rush](https://bossrush.net/2026/02/boss-rush-banter-should-we-really-put-narrative-games-in-early-access/)) [V].
- Use a **free prologue** instead: Deltarune's Chapters 1–2 were free in 2018 and 2021 [BK].

---

## 5. Ancillary revenue

| Stream | Evidence | Expectation [E] |
|---|---|---|
| Soundtrack (Steam and Bandcamp) | Median attach about 2.8%. Median OST revenue about $3.3k for mid-tier games and $66k for top-tier ([SPA](https://www.steampageanalyzer.com/blog/steam-bundle-strategy)) [V, 3rd-party]. Bandcamp takes 15%, falling to 10% after $5k ([Spilled](https://spilled.gg/video-game-composers-soundtracks-bandcamp-streaming-platforms), [AV Club](https://www.avclub.com/bandcamp-video-game-soundtracks)) [V] | 1–4% of revenue. Always do it |
| Deluxe bundle (OST, artbook, commentary) | Steam bundles lift average revenue per user. OST revenue counts toward Steam's revenue tiers [V] | +3–8% |
| Merch (Fangamer, Makeship, own shop) | Fangamer is an estimated $10–25M-a-year business [unverified]. Undertale orders spiked so hard the team "thought Shopify glitched"; Fangamer also makes Hollow Knight merch ([EGM](https://egmnow.com/how-fangamer-leveled-up-gaming-merch/), [Wikipedia](https://en.wikipedia.org/wiki/Fangamer)) [V] | Under 1% for most games. Meaningful for character-fandom hits (Undertale, OMORI, Hollow Knight). Mascot plushies lead [BK] |
| Physical editions | Limited Run Games finances the print run, sized to sell out ([Wikipedia](https://en.wikipedia.org/wiki/Limited_Run_Games)) [V] | $20–150k on 3–10k runs. No risk |
| DLC / expansion | Works when the world is loved | 10–25% of base revenue at $5–10 |
| Chapters (Deltarune model) | Free Ch. 1–2, then a paid $24.99 Ch. 1–4 bundle with future chapters free ([Automaton](https://automaton-media.com/en/?p=46652)) [V] | For a new IP: **free prologue → paid full game**. Paid episodes split sales and reviews |
| Sequels and licensing (TV, comics, board games) | Silksong; Stardew's board game, concerts and cookbook [BK] | Only after 500k+ units. Requires owning 100% of the IP |
| Twitch drops | Built for live-service games | Skip |

---

## 6. Localization ROI

**Steam language share:**
- **Full-year 2024 (Valve, GDC 2025):** Simplified Chinese **33.7%**, English 33.5%, Russian 8.2% ([SPA](https://www.steampageanalyzer.com/blog/steam-localization-languages)) [V].
- **Sept 2026 survey month:** English 34.2%, Simplified Chinese 31.4%, Russian 9.1%, Spanish 4.1%. Monthly swings are large; Feb 2026 showed an anomalous 54.6% Chinese ([iXBT](https://ixbt.games/en/news/2026/10/02/valve-nazvala-samye-populiarnye-videokarty-steam-v-sentiabre-2026-goda-i-podtverdila-vaznost-russkoi-lokalizacii.html), [GamingOnLinux](https://www.gamingonlinux.com/2026/03/steam-survey-for-february-2026-shows-a-big-swing-to-simplified-chinese)) [V].

**Proof points:**
- *Hidden Folks*: Chinese players were 41% of Steam units and 30% of revenue from a plain translation ([Game Developer](https://www.gamedeveloper.com/business/china-is-kind-of-a-big-deal-for-indie-games)) [V].
- Translated store pages correlate with about +50% wishlists ([WN Hub](https://wnhub.io/news/stores-and-publishing/item-18823)) [V].
- *Look Outside* drew Japanese press ([Denfaminicogamer](https://news.denfaminicogamer.jp/news/2606152i)) [V].
- Undertale, Deltarune and OMORI have huge Japanese fandoms, and *The Coffin of Andy & Leyley* broke out in China [BK].

**Cost.** Game vendors charge **$0.11–0.13 per word** for Simplified Chinese and **$0.13–0.15** for Japanese and Traditional Chinese ([Allcorrect](https://allcorrectgames.com/localization-pricing/)). The industry average is about $0.14. Proofreading adds about 50%, and LQA runs $31–48 an hour ([LocalizeDirect](https://localizedirect.com/posts/which-languages)) [V].

**Worked example [E]:** a 100k-word script costs about **$16–23k per language** all-in, or $90–120k for 5–6 languages. Japanese needs transcreation for humor.

**Priority:**

| Tier | Languages | Notes |
|---|---|---|
| Launch | EN, **zh-CN**, **JA**, KO | |
| +3 months | pt-BR, ES-LATAM | |
| +6 months, if data supports | DE, FR, RU, zh-TW | Russian: large user share, but low prices and payment friction [BK] |

Translate the store page and trailer subtitles into 12+ languages on day one. Build CJK fonts and string tables from the start, because retrofitting is what blows up localization budgets.

---

## 7. Marketing

**What works:**
- **Steam itself:** an early store page, Next Fest, themed fests, and the demo.
- **Trailer plus showcases:** Wholesome Direct, Day of the Devs, Future Games Show.
- **Organic YouTube and Twitch:** design shocking, shareable story moments for streamers.
- **Organic social:** pixel GIFs and clips on TikTok/Shorts, Reddit (r/IndieGaming, r/PixelArt, r/JRPG), and Bluesky/X #screenshotsaturday.
- **Chinese-language platforms:** Bilibili/Weibo through a local partner.
- **Timing over spend:** Zukowski says marketing "is not pay-to-win that much… it's about when you time certain activities" ([Unity](https://unity.com/blog/tips-strategies-for-marketing-indie-games)) [V].

**What usually doesn't:**
- Paid social ads for premium PC games, which have poor cost per wishlist [BK].
- Paid streamer sponsorships and mass key services, which give low lift and leak keys to gray markets ([Game Developer](https://gamedeveloper.com/blogs/avoiding-ineffective-or-scam-discovery-interactions-with-influencers)) [V].
- Press releases on their own.

**Budget [E]:** 10–20% of the dev budget, or $50–150k:

| Item | Cost |
|---|---|
| Trailers | $5–20k |
| Key art | $3–10k |
| PR agency around launch | $15–40k |
| Optional physical booths | $5–20k each |
| Store page localization | $2–5k |

**Timeline:**

| When | Milestone | Wishlist target [E] |
|---|---|---|
| T-24 to 18 months | Announce; Steam page live | — |
| T-18 to 6 months | Showcases, social, Discord, CN/JP pages | 10–20k |
| T-6 to 4 months | Demo live | 20–30k |
| T-4 to 1 months | Next Fest | 40–60k+ |
| T-0 | Launch, Tue–Thu, 10am PT | — |

Avoid Next Fest week, seasonal sales, and tentpole launches.

---

## 8. Budget benchmarks

The fully loaded cost is **$40–60k per person per year** in low/mid-cost setups and **$80–110k** in the US or Western Europe [E]. This is consistent with guides citing small teams at $10–30k+ a month ([SPA](https://www.steampageanalyzer.com/blog/indie-game-development-costs), [GamesRadar](https://www.gamesradar.com/games/most-players-have-no-idea-how-much-games-cost-to-make-and-everythings-more-expensive-than-people-think-devs-say-as-indie-hits-like-balatro-are-the-exception)) [V].

External costs come on top: music $10–40k, localization $50–120k, ports $30–80k per platform, marketing $50–150k, and legal/ratings $5–15k.

| Team | Duration | All-in budget [E] | Break-even units at $19.99 (≈$8.40 net, self-published) |
|---|---|---|---|
| 1 | 2 yrs | $100–250k | 12–30k |
| 3 | 3 yrs | $450k–1.1M | 55–130k |
| 5 | 3 yrs | $750k–1.8M | 90–215k |
| 10 | 4 yrs | $2–4.5M | 240–540k |

A publisher share roughly doubles the units needed. For comparison, the 2024 cohort's #500 game grossed $457k in its launch year [V]. A 3–5 person team therefore needs a **top-300 to top-500 annual outcome** plus ports and a long tail to break even.

---

## 9. Risks that kill profit

1. **AI-art backlash.**
   - Steam has required AI disclosure since Jan 2024.
   - Even false accusations get games review-bombed: *Shrine's Legacy*, Dec 2025 ([PC Gamer](https://www.pcgamer.com/games/rpg/rpg-dev-pushes-back-against-steam-review-ai-accusations-we-poured-years-of-our-lives-into-this-game-and-only-worked-with-real-human-artists-on-everything)).
   - *Heartopia* sits at 66% positive after its disclosure ([Kotaku](https://kotaku.com/heartopia-ai-steam-animal-crossing-cozy-sim-2000661394)) [V].
   - An unverified claim says games with the disclosure get 53% fewer reviews ([Cinevva](https://app.cinevva.com/signals/2026-07-02-the-ai-scarlet-letter)).
   - **Mitigation:** fully human art, music and writing, documented publicly with timelapses.
2. **Refunds on short content** (Section 1).
3. **Launch bugs.** The first 48 hours of reviews set the score label every later buyer sees. Budget 10–15% of schedule for QA and Deck testing.
4. **Overscoping.** Lock the word count, which also drives localization cost. Ship 8–12 hours, not 40.
5. **Underpricing** [V].
6. **A crowded launch week.** Indies moved their dates away from Silksong's Sep 2025 launch [BK]. Check SteamDB's upcoming list 6–8 weeks out.
7. **No CJK at launch.** That forfeits the spike from the largest Steam language group.
8. **Early Access for a linear story**, or **cheap subscription deals**.
9. **IP giveaways in contracts**, which kill merch, licensing and sequel upside.

---

## 10. Recommended commercial blueprint

**Product:** an original pixel narrative RPG/adventure.
- **Length:** 8–12 hour main path, 15+ hours for completionists.
- **Hook and refund safety:** a hook within 30 minutes and no complete arc within 2 hours.
- **Fandom design:** mascot-able characters, built for merch and sequels.
- **Shareability:** twist and choice moments that make good streamer clips.
- **Craft:** 100% human-made.

**Price:** **$19.99** with Valve's regional suggestions and a **15% launch discount**. Deluxe Edition at $29.99 (OST, digital artbook, commentary). OST at $9.99 on Steam and Bandcamp. Keep sale prices at about $11.99–13.99 in years 1–2 and go deeper afterwards.

**Platforms and sequence:**
1. **Launch:** Steam (Deck Verified). Add Switch/Switch 2 if a partner funds the port.
2. **+3–6 months:** PS5 and Switch if not done at launch. Physical edition via Limited Run Games, Fangamer or Super Rare.
3. **+12 months:** Xbox. Consider Game Pass only with a guarantee at or above modeled Xbox sales.
4. **+18–24 months:** premium mobile at $9.99, or an Apple Arcade/Netflix flat fee if large. Story DLC or sequel announcement.

**Languages:** EN, zh-CN, JA and KO at launch. pt-BR and ES-LATAM at +3 months. DE, FR, RU and zh-TW at +6 months if data supports. Budget about $100–130k [E].

**Launch sequence:**
1. **Prototype:** test hook clips on TikTok and Reddit.
2. **Announce:** Steam page 18–24 months before launch.
3. **Showcases:** submit twice a year.
4. **Prologue demo:** free, 60–90 minutes, live 4–6 months before launch.
5. **Next Fest:** the edition 1–4 months before launch.
6. **Launch:**
   - Jan–Mar or May–early June, Tue–Thu.
   - At least 30 days before a seasonal sale.
   - CN and JP press pushes in parallel.
   - Creator embargo lifts at launch.
7. **Post-launch:** patch within 72 hours, a "second launch" for each port, and a merch drop at about 1,000 reviews.

**Ancillary plan:**
- **Day one:** OST and the Deluxe bundle.
- **Months 3–6:** Fangamer or Makeship plush.
- **Months 6–12:** physical edition, and vinyl if sales pass 100k.
- **Year 2:** DLC or prequel.
- **Throughout:** keep 100% of the IP.

**Revenue scenarios** (developer net, about 5-year lifetime; $19.99 at ≈42% realized ≈ $8.40 per unit; self-published) [E]:

| | Conservative | Base | Breakout |
|---|---|---|---|
| Launch wishlists | 30k | 100k | 300k+ |
| Week-1 Steam units (0.10–0.20×) | 3k | 12k | 60k |
| Year-1 Steam units (~3.5× week 1) | 10k | 45k | 400k |
| Lifetime Steam units | 20k | 100k | 1.0M |
| Console/mobile uplift | +50% → 30k | +60% → 160k | +80% → 1.8M |
| Game net | **~$250k** | **~$1.35M** | **~$14–15M** |
| Ancillary | $10–20k | $80–150k | $1–3M+ |
| Optional platform deals | — | $100–300k | Opportunistic |
| **Total developer net** | **~$0.26M** | **~$1.5–1.8M** | **~$15–18M+** |
| Approx. annual rank | top ~1,000–1,500 | top ~250–400 | top ~20–40 |
| Comparable | Solid debut | Mid-hit pixel RPG | Look Outside, Dave the Diver, Deltarune tier |

**Assumptions:** 85%+ positive reviews, core languages at launch, and a clean launch. Breakout also needs streamer virality and traction in Asia.

**Reading the scenarios:**
- **Conservative** covers a solo developer's budget but is a loss for a 3-person, 3-year team.
- **Base** returns about 1.5–3× a 3–5 person budget.
- **Breakout** is perhaps a 2–5% outcome even with good execution [E].

The median Steam release earns far below Conservative. **Size the studio so the Conservative case is survivable:**
- 3–5 people.
- 2.5–3 years.
- $0.6–1.0M all-in.
- De-risk through regional or platform-rights deals, or a funding-only advance, never by giving up the IP.
