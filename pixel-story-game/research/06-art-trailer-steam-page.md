# 06: Art Direction, Readability, Trailers, Steam Page and Tech for a Pixel-Art Story Game

*Research date: 2026-10-29. This covers research only. It contains no design decisions for our game.*

**How this was researched and how much to trust it.** All of this comes from WebSearch result summaries. WebFetch could not reach howtomarketagame.com, indiedb.com, steampageanalyzer.com or pushtotalk.gg because those hosts are outside this session's network allowlist. The session's shared web-search budget also ran out before resolution, audio and accessibility were searched. Claims marked **(unverified)** come from general industry knowledge and were not re-checked this session. Every other claim has a source URL inline.

---

## 1. Pixel art directions in 2025–2026: what stands out, what reads, what it costs

| Direction | Exemplars | How it reads in a capsule, thumbnail or vertical feed | Relative cost |
|---|---|---|---|
| **Hi-bit / HD pixel with modern lighting** | Sea of Stars, Eastward, Blasphemous | Best "wow per frame" in trailers. Busy detail turns to mush at thumbnail size unless the composition is simple. | **High** |
| **HD-2D** (pixel sprites in lit 3D dioramas) | Octopath Traveler, Triangle Strategy | Very strong in 16:9 trailers. The tilt-shift look reads as "premium". | **Very high** (3D environment art and lighting work) |
| **Pixel + 3D hybrid pipeline** | Dead Cells, Dave the Diver (unverified) | Smooth, fluid motion, which helps in short-form clips | High setup cost, then cheaper per animation |
| **Limited palette / Game Boy / GBC** | Mina the Hollower (unverified) | Very readable at small size, with an instant nostalgia hook | **Low** |
| **1-bit / 2-colour** | World of Horror, Obra Dinn (dithered 3D) (unverified) | Highest contrast, so it pops in feeds. It fits horror and mystery. It can look "small" | **Lowest** |
| **PC-98 / anime-retro** | VA-11 Hall-A, World of Horror (unverified) | Big character portraits sell the story. Readable faces suit thumbnails | Medium (portrait-heavy) |

Evidence on the high-cost end:

- **Sea of Stars.** One person, Jeakim Hamel, worked on the dynamic lighting from 2018 onward. Creative director Thierry Boulanger said that *"all of the production and assets have to meet the technical needs of the dynamic lighting"* ([MobileSyrup](https://mobilesyrup.com/2023/09/11/sea-of-stars-level-design-sabotage-studio-thierry-boulanger-interview/)). He described the game as *"doing things that 2D sprite games shouldn't do with lighting"* ([Nintendo Life](https://www.nintendolife.com/news/2020/03/hands_on_first_impressions_of_sea_of_stars_the_next_project_from_the_messenger_dev_sabotage)).
- **Eastward.** Pixpil described the look as *"retro-pixel + 3D lighting"*, aiming for the feel of 90s Japanese animation ([Game Developer, Road to the IGF](https://www.gamedeveloper.com/disciplines/road-to-the-igf-pixpil-s-i-eastward-i-); [80.lv](https://80.lv/articles/eastward-charming-chinese-pixel-art-adventure)).
- **Octopath Traveler (HD-2D).** The look combines dynamic lighting, depth of field and tilt-shift ([Wikipedia: HD-2D](https://en.wikipedia.org/wiki/HD-2D)). It was built in UE4 with a core team of only about six people at peak, and the look alone took about 1.5 months to get right ([Unreal Engine spotlight](https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true)). Square Enix trademarked the term "HD-2D" ([COGconnected](https://cogconnected.com/2019/01/square-trademarks-octopath-hd-2d-style/)).
- **Dead Cells.** Characters were modelled and animated in 3ds Max, then batch-converted to pixel art by an in-house tool. No paint-over was needed, and backgrounds stayed hand-drawn. The stated reason was to get "great looking pixel art, without having to hand draw each and every retake" ([Dead Cells art deep dive](https://www.jikguard.com/news/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-dead-cells); [80.lv](https://80.lv/articles/interview-with-the-developers-of-dead-cells)).
- **Blasphemous.** The team animated traditionally, frame by frame, and made only a few pixel cutscenes because doing so is *"really crazy"* ([Gamereactor](https://www.gamereactor.eu/the-game-kitchen-on-blasphemous-ambiguous-story/); [Hollywood Reporter](https://www.hollywoodreporter.com/heat-vision/blasphemous-designer-purist-approach-games-pixel-art-style-1238370)).

**Cost per minute of content.** No public per-minute benchmark exists. The figures below are freelance asking prices, not market data.

- Pixel animation runs **about $5–25 per frame**, or $25–100 per basic animation and $100–500+ per complex one ([Twine](https://www.twine.net/blog/cost-of-2d-game-animation-and-how-to-budget-smartly)). Fiverr listings scale with sprite size: roughly $6–10 per frame at 32px and $15–20 per frame at 64–128px.
- What drives cost is sprite size × frames × number of unique characters and locations, plus a fixed tax for any lighting or 3D layer.
- **Our estimate:** a 1-bit or GB-palette story game costs roughly a third to a quarter as much per minute of new content as hi-bit with dynamic lighting. HD-2D adds a whole 3D environment pipeline on top.

**Readability rule for small screens.** On Steam, a 920×430 capsule was shown at about half size, and the fine pixel detail blurred. The developer concluded that art pixels need to be **at least about 4×4 screen pixels** to survive at that size ([IndieDB devlog](https://www.indiedb.com/news/devlog-pixel-art-capsules)). The same logic applies to YouTube thumbnails and phone feeds: big shapes, a high-contrast palette and one dominant character.

## 2. Native resolution trade-offs

How each base resolution scales to common screens. Numbers are the scale factor; "non-integer" means the image will not scale to whole pixels.

| Base | 720p (Switch 1 handheld) | 1080p (Switch 2 handheld*) | 1440p | 4K | Steam Deck (1280×800) |
|---|---|---|---|---|---|
| **320×180** | ×4 | ×6 | ×8 | ×12 | ×4 = 1280×720, plus 80px letterbox |
| **384×216** | non-integer | ×5 | non-integer | ×10 | ×3 = 1152×648, with heavy borders |
| **480×270** | non-integer | ×4 | non-integer | ×8 | ×2 = 960×540, or non-integer |
| **640×360** | ×2 | ×3 | ×4 | ×6 | ×2 = 1280×720, plus 80px letterbox |

\*Switch 2 handheld is 1080p and docked output goes up to 4K (unverified).

- **Who uses what.** Celeste runs internally at 320×180, and Sea of Stars and Eastward at 640×360, according to a community comment rather than an official statement ([Reddit mirror](https://reddit.sentinel-team.org/posts/1rby5a9/snapshots/2026-02-23T01%3A44%3A04.199078Z)). 320×180 multiplies cleanly to 1080p (×6) and to 4K (×12) ([Summer Engine](https://www.summerengine.com/es/blog/how-to-make-a-pixel-art-game)).
- **The trade-off.** 320×180 forces small, iconic sprites, which are cheap and readable but limited in detail. 640×360 integer-scales to every common target and allows hi-bit detail and expressive faces, but each asset costs more. 384×216 and 480×270 fail at 720p and on the Deck unless you accept non-integer "sharp-bilinear" scaling or borders.
- **16:10 handhelds (Deck).** A common technique is to render slightly taller than 16:9 (for example 320×200 instead of 320×180) and keep the HUD inside the 16:9 safe area. That fills 1280×800 at ×4 instead of letterboxing (unverified practice).
- **Vertical video.** A 9:16 crop of a 16:9 frame keeps only **31.6% of the width** (81/256). At 320×180 that is about 101×180 art pixels. Pixel games need a dedicated portrait capture mode or framing, otherwise the character becomes tiny in TikTok and Shorts feeds. Mobile portrait ports have the same problem.

## 3. Distinctiveness: recognizable from a single frame

Most hits own **one palette, one silhouette and one UI frame**. These examples are from general knowledge (unverified):

- **Undertale.** A black void, a white-bordered dialogue box and the red heart SOUL.
- **Hyper Light Drifter.** A magenta and teal palette.
- **Celeste.** Madeline's hair changes from red to blue when her dash is spent, so the signature is also gameplay information.
- **OMORI.** Stark monochrome White Space set against crayon-coloured Headspace.
- **Octopath.** The tilt-shift diorama.
- **Eastward.** A warm 90s-anime glow.
- **Blasphemous.** Spanish Catholic iconography and gore.

Eastward's lighting "makes the whole game literally glow" ([80.lv](https://80.lv/articles/eastward-charming-chinese-pixel-art-adventure)), and Nintendo credits its look to the art director's "fantastic sense of color" ([Nintendo](https://www.nintendo.com/us/whatsnew/how-the-developers-began-making-then-remaking-eastward)).

**The test:** a single frame shrunk to 184×69 should still be recognizably *this* game.

## 4. Animation and "juice": what buys the most perceived quality

- **The foundational talks.** "Juice it or Lose it" (Jonasson and Purho, 2012) and "The Art of Screenshake" (Jan Willem Nijman of Vlambeer, 2013) both showed that layering particles, shake, sound and animation onto a plain game makes it feel far better ([crcdng summary](https://crcdng.itch.io/juicy-break); [Kenney](https://kenney.nl/learn/must-see-videos-for-indie-developers)). Practitioners advise keeping shake brief (under about 0.2s) and making it optional ([blog](https://alexhoratiogamedev.blogspot.com/2017/04/quick-and-easy-ways-to-add-game-juice.html)).
- **What matters most for story games: talking characters.** Undertale gives each character its own blip sound and uses text speed and rhythm as "voice". Fans agree on what characters "sound like" even though there is no voice acting ([dialogue analysis](https://thesolarprincess.github.io/blog/en/undertaledialogue.html)). Toby Fox has argued that low-resolution pixels leave room for the player's imagination ([Game Developer excerpt](https://www.gamedeveloper.com/design/book-excerpt-heartache-and-compassion-in-i-undertale-i-)).
- **Priority order by payoff per hour (our synthesis):**
  1. Portrait expressions plus idle blinks and breathing.
  2. Text effects (shake, wave, colour, pauses) and per-character blips.
  3. Character idle loops.
  4. Scene transitions.
  5. Hit-stop, particles and screen shake at story beats.
  6. Full pixel cutscenes. Blasphemous shows these are the most expensive item.

## 5. Trailers for story games

**What Valve and Steam's player do:**

- Valve recommends that the **first trailer be primarily gameplay** ([GameDiscoverCo](https://newsletter.gamediscover.co/p/game-trailers-breaking-down-a-key)).
- Steam autoplays the trailer **muted**, so the opening has to work without sound. The recommended length is 60–90 seconds ([Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-trailer-best-practices)).
- Only two trailers may sit before the screenshots ([PC Gamer](https://www.pcgamer.com/valve-wont-let-devs-frontload-steam-screenshot-galleries-with-a-dozen-trailers-anymore-says-many-dont-know-how-best-to-manage-the-space/)).
- Steam auto-cuts short "microtrailers" from your trailer ([PCGamesN](https://www.pcgamesn.com/steam/steam-labs-micro-trailers)), so strong moments must be spread throughout it.

**Derek Lieu's advice:**

- Hook the viewer within about **10–15 seconds** and never later than the first half. Establish the genre fast ([PushToTalk](https://pushtotalk.gg/p/what-can-aaa-games-marketers-learn-from-indies)).
- Viewers skip logos and slow establishing shots, so put gameplay in the first seconds ([Game World Observer](https://gameworldobserver.com/2022/09/22/common-game-trailer-mistkaes-indie-developers-steam)).
- Do the audio first, and build in highs and lows ([PC Gamer](https://www.pcgamer.com/the-art-of-making-effective-game-trailers)).
- Avoid the **"scattershot story trailer"** of disconnected cutscenes and dialogue. Dialogue lines should connect and build an idea ([Derek Lieu](https://derek-lieu-yrd2.squarespace.com/blog/2022/5/9/the-scattershot-story-trailer-dont-do-this)).
- His GDC 2024 talk argues for making the trailer *before* the game, as a prototype of the hook ([GDC](https://schedule.gdconf.com/session/independent-games-summit-make-the-trailer-before-the-game-a-marketing-first-way-to-prototype/900472)).

**How story games avoid spoilers (synthesis).** Sell the premise and the question, never the answer. Show first-act situations, a few loaded lines of dialogue that work as captions, mechanics with emotional stakes, and a montage of locations. End on an unresolved line plus the logo and a wishlist call to action.

**Viral examples:**

- A Game About Digging a Hole: its first trailer passed 5M TikTok views, and the game reached 82k wishlists in 4 weeks ([Spilled](https://spilled.gg/a-game-about-digging-a-hole)).
- Randwerk: organically viral YouTube trailers brought about 150k wishlists ([GameDiscoverCo](https://newsletter.gamediscover.co/p/why-did-this-games-trailer-spawn)).
- Icy Tower: a pixel-art reveal reached 50k views in a week ([Apskeppet](https://buttondown.com/apskeppet/archive/icy-tower-reveal-round-up-and-faq)).

**Risk:** a vocal minority dislikes pixel art on sight ([Game Developer](https://www.gamedeveloper.com/game-platforms/trailer-trouble-dealing-with-pixel-art-backlash)). Upload pixel trailers at 4K with integer upscaling (nearest-neighbour), because YouTube compresses lower resolutions harder (unverified practitioner norm).

## 6. Steam page conversion

**Should the capsule be pixel art? Mostly no. This is verified directionally.**

- Chris Zukowski: *do not do your own capsule art*. The capsule is the first thing to spend money on with a small budget ([HTMAG](https://howtomarketagame.com/2022/03/08/what-should-you-spend-money-on-if-you-have-a-small-marketing-budget/)). One new capsule image increased sales 20× ([HTMAG](https://howtomarketagame.com/2020/04/13/how-one-new-image-increased-sales-by-20x/)).
- His capsule-trend reviews reportedly found only two pixel-art capsules among top sellers, Neon Abyss and Undermine ([HTMAG trends](https://howtomarketagame.com/2020/07/27/five-trends-in-steam-capsule-art/)). That figure comes from a search summary; I could not open the page to verify it.
- At half-size display, fine pixel detail fails, and one developer moved to rendered capsule art for that reason ([IndieDB](https://www.indiedb.com/news/devlog-pixel-art-capsules)).
- From memory (unverified): Celeste, Dead Cells, Sea of Stars, Eastward, Blasphemous and Octopath all use **illustrated key art**. The exceptions, Stardew Valley, Vampire Survivors and Animal Well, use **very chunky** pixels or a minimal logo.
- A snapshot of 98 top sellers (July 2026) found that only 20 capsules show a readable face, 44 use dark backgrounds, 18 fail a 120px legibility test, and 97 of 98 include title text ([Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-capsule-trends-data)).
- **Sizes:** header 920×430, main 1232×706, vertical 748×896, small 462×174 (the small capsule auto-generates 120×45 and 184×69), library 600×900. Valve says the logo must be readable at the smallest size ([Steamworks](https://partner.steamgames.com/doc/store/assets/standard)).
- Capsule **overrides** allow time-limited variants, which can be used for rough testing ([Steamworks](https://partner.steamgames.com/doc/store/assets/overrides)).

**Description GIFs.** GIFs have been allowed in the "About" section since 2018 ([report](https://www.jikguard.com/news/steam-store-pages-now-officially-support-animated-gifs)). Put 3–5 second gameplay GIFs at the top. Do not use GIFs that mimic clicking the wishlist button ([Presskit](https://presskit.gg/field-guides/steam-description-guide)). Keep the total under about 15MB, and do not advertise other Steam products ([Steamworks](https://partner.steamgames.com/doc/store/page/description)).

**Tags and short description.**

- Make the top five tags describe your sub-genre, and keep "Indie" out of them. Tags also drive the "More like this" recommendations.
- The short description should use **specific verbs** for the core loop, not "save the world" ([HTMAG checklist](https://howtomarketagame.com/wp-content/uploads/2020/03/SteamPageChecklistv1.pdf)).

**Benchmarks.**

- The median visit-to-wishlist rate is about **8–12%** (8–15% for Coming Soon pages), and **under 5% is poor** ([Steam Page Analyzer](https://www.steampageanalyzer.com/blog/steam-store-page-conversion-benchmarks)).
- Genre moves this from about 5% (retro arcade) to 15–20% (factory sims) ([by genre](https://www.steampageanalyzer.com/blog/steam-conversion-rate-by-genre)).
- In the February 2026 Next Fest data, pre-fest wishlists predicted fest wishlists with **r = 0.825** ([Ziva](https://ziva.sh/blogs/steam-next-fest-2026); [HTMAG SNF tool](https://howtomarketagame.com/wp-content/uploads/tools/snf-score-tool.html)).

## 7. Short-form content: what the data shows

| Case | Reach | Wishlist effect | Wishlists per 1,000 views |
|---|---|---|---|
| Mortal Rite (TikTok, 640k followers) | 120M views | 60k+ wishlists ([Game Developer](https://www.gamedeveloper.com/game-platforms/this-game-used-tiktok-to-get-120m-views-60k-steam-wishlists-)) | about 0.5 |
| Single viral TikTok | about 7M views | 400 to about 20k wishlists ([Game Developer](https://www.gamedeveloper.com/game-platforms/from-400-to-20-000-wishlists-with-1-video-how-tiktok-can-make-your-game-go-viral)) | about 3 |
| Visual novel on TikTok | 571k views | about 2,900 wishlists ([HTMAG](https://howtomarketagame.com/2022/02/07/seven-great-tips-for-marketing-your-indie-game-on-tiktok/)) | about 5 |
| X tweets reposted by IndieGameJoe (n=8) | (varied) | views–wishlists **r = 0.95** ([HTMAG 2026](https://howtomarketagame.com/2026/05/07/2026-tips-for-making-your-tweets-go-viral/)) | about 7 |
| YAPYAP announcement on TikTok | 1.5M views | 3rd most-played Next Fest demo ([Presskit](https://presskit.gg/field-guides/tiktok-indie-game-marketing)) | n/a |
| Pirate Software (Heartbound, a pixel story game) | one Short at 14M+ views ([KYM](https://knowyourmeme.com/memes/people/pirate-software)) | creator fame did not translate into proportional game traction | n/a |

- **Polden Publishing's estimate:** vertical-video creators on TikTok, Instagram and YouTube drive about **35% of indie wishlists** ([WN Hub](https://wnhub.io/news/stores-and-publishing/item-51014)).
- **"My indie game for 15 seconds".** This X trend started on 30 January 2025 with TAMASHIKA ([KYM](https://knowyourmeme.com/memes/my-indie-game-for-15-seconds)). Fifteen seconds was enough to show the core loop ([PushToTalk](https://www.pushtotalk.gg/p/tamashika-viral-tweet); [GamesRadar](https://www.gamesradar.com/platforms/pc-gaming/my-steam-wishlist-is-bigger-than-ever-thanks-to-the-indie-devs-flooding-social-media-with-15-second-clips-explaining-their-games)).
- **Formats that perform:**
  - A 15-second core loop with a text hook in the first second.
  - Seamless loops, which count as extra views on TikTok.
  - Narration plus subtitles. One developer reported going from 500 to 6k wishlists after adding them.
  - Before/after art progressions.
  - "Satisfying" juice moments.
  - X favours pixel art and GIFs.
- **Lead quality.** Reddit and X wishlists reportedly convert to purchases better than impulsive TikTok wishlists ([GameTyrant](https://gametyrant.com/news/social-media-as-a-wishlist-building-tool-what-works-and-what-doesnt)). This is anecdotal.

## 8. Engines and porting

**Engine share on Steam.**

- Godot made up **7.1% of 2025 Steam releases** (0.9% in 2020) but only **4.1% of games earning over $500k** ([GameDiscoverCo](https://newsletter.gamediscover.co/p/hows-pc-game-engine-usage-changing)).
- 2024 releases: Unity 51%, Unreal 28%, Godot 5%. Custom engines earned 41% of all revenue ([VGI](https://gamedevreports.substack.com/p/video-game-insights-game-engines)).

**By engine:**

- **GameMaker.**
  - Hits: Undertale, Hotline Miami, Hyper Light Drifter ([GameBusiness.jp](https://www.gamebusiness.jp/article/2017/03/10/12987.html)), plus Deltarune, Katana ZERO and Pizza Tower (unverified).
  - Consoles need the **Enterprise** tier plus platform approval ([GameMaker](https://gamemaker.io/en/blog/export-with-gamemaker)). Switch 2 support was announced in April 2025 ([Gamespress](https://gamespress.com/fr/GameMaker-Announces-Support-for-Nintendo-Switch-2)).
  - The new runtime, GMRT, becomes **free for commercial use from 1 January 2027** on PC, mobile and web. Console still needs Enterprise ([Game Developer](https://www.gamedeveloper.com/programming/gamemaker-s-gmrt-runtime-will-soon-be-free-for-all-commercial-devs); [GamingOnLinux](https://www.gamingonlinux.com/2026/10/gamemaker-announce-their-next-gen-runtime-gmrt-will-be-free-for-commercial-use/)).
- **Godot.**
  - Slay the Spire 2 (Godot, after a move from Unity) sold **3M copies in a week** after early access opened on 5 March 2026 ([GamingOnLinux](https://gamingonlinux.com/2026/03/the-godot-powered-slay-the-spire-2-has-already-hit-over-3-million-sales)). Its consoles are planned for the 1.0 release in 2027 ([Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire_II)).
  - Consoles go through third parties. W4 Games added a Switch 2 beta in October 2025, included in its All-Platforms plan ([W4](https://www.w4games.com/blog/w4-games-news-1/w4-consoles-beta-support-for-the-nintendo-switch-2-87)). Pineapple Works ports to Switch 1 and 2, Xbox and PS5 ([Godot docs](https://docs.godotengine.org/fr/4.5/_sources/tutorials/platform/consoles.rst.txt)).
  - Pixel hits include Brotato, Cassette Beasts and Dome Keeper (unverified).
- **Unity.**
  - The Runtime Fee was cancelled in September 2024 ([GamingOnLinux](https://www.gamingonlinux.com/2024/09/unity-cancels-the-stupid-runtime-fee)). In a GDC survey, 51% of developers said they were *interested* in Godot ([WN Hub](https://wnhub.io/news/engines/item-42759)).
  - Unity is still the most proven console path. Sea of Stars, Chained Echoes and Blasphemous use it (unverified).
- **Unreal.** This is the HD-2D route ([Unreal](https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true)).
- **Custom engines.** Celeste (XNA/FNA), Dead Cells (Haxe/Heaps), Stardew Valley (MonoGame) and Eastward all run on custom tech (unverified).
- **RPG Maker.**
  - OMORI passed **1M copies** by December 2022 ([Famitsu](https://www.famitsu.com/news/202212/31288489.html)) after a Kickstarter that hit 4× its goal ([CGM](https://www.cgmagonline.com/news/indie-rpg-omori-four-times-kickstarter-goal/)).
  - To the Moon even sold at retail ([Steam forum](https://steamcommunity.com/app/220700/discussions/0/618463738384517825)).
  - The stigma comes from a flood of "Earthbound-inspired RPGs about depression" ([Indie Hell Zone](https://indiehellzone.com/2021/12/06/rpg-maker-visibility-iceberg-part-1)). Hits beat it with fully custom art and UI.
  - Console ports of MV/MZ games usually need a porting house or a rewrite (unverified).

## 9. Audio (mostly unverified: no searches were left)

**Styles.**

- Chiptune signals "retro" but caps emotional range.
- Hybrid (chip or synth plus live instruments) is the dominant choice in hit story games: Undertale, Celeste (Lena Raine) and Hyper Light Drifter (Disasterpeace).
- Orchestral music signals "premium" (Octopath). Sea of Stars brought in Yasunori Mitsuda as a guest composer, which doubled as marketing.

**Other points.**

- **Text-blip voices.** Per-character pitch and timbre, synced to text speed (see §4), are cheap and very characterful.
- **Dynamic music.** Vertical layering, adding or removing stems as story tension changes, gives the most for the money.
- **Composer costs.** Indie freelance rates commonly run from a few hundred dollars to about $2,000 per finished minute. Check the annual [GameSoundCon survey](https://www.gamesoundcon.com/survey) (not opened this session).
- **Soundtrack as revenue.** A memorable leitmotif is a trailer and short-form asset, and an OST DLC adds revenue. OMORI sells its soundtrack as Steam DLC ([listing](https://gamegeeker.com/pl/dlc/omori-soundtrack-1508300)).

## 10. Accessibility that widens the market (mostly unverified)

- **Proven precedents.** Celeste's Assist Mode (game speed, invincibility) earned wide praise and broadened its audience. Sea of Stars uses optional "Relics" as difficulty modifiers.
- **Pixel-specific needs:**
  - A **readable or high-resolution font toggle**, because pixel fonts fail on 7–8" screens. Valve's Deck guidance asks for legible text at 1280×800, with about 9px minimum and 12px recommended (verify in Steamworks).
  - Text-speed, instant-text and auto-advance options, a dialogue backlog, and skip for already-seen text.
  - Toggles for screen shake and flashes, which are already best practice per §4.
  - A colour-blind-safe palette check, full remapping, and save-anywhere.
- **Steam listing.** Steam store pages can now list accessibility features (verify the current fields). Declaring them helps with filtering and with reviews.

---

## 12 production and presentation rules, ranked by impact on sales

1. **Commission an illustrated (non-pixel or ultra-chunky) capsule from a specialist.** The logo must read at 120×45. Test variants with capsule overrides. The capsule is the highest-leverage asset, and pixel detail dies at capsule scale.
2. **Lock a single-frame signature before production.** That means one palette, one silhouette and one UI frame or icon. Test it by shrinking a screenshot to 184×69 and to a phone-feed thumbnail.
3. **Make the trailer playable-looking in 3–5 seconds and readable when muted.** Keep it to 60–90 seconds. Tell the story through two or three connected dialogue lines about the premise, not plot reveals. Put strong moments throughout, because microtrailers cut from the whole video.
4. **Build a vertical capture or framing mode early.** Ship 15-second core-loop clips, looped, with a text hook and subtitles. Track wishlists per 1,000 views (expect about 0.5–7).
5. **Optimise the Steam page.** Put 3–5 second GIFs at the top of the description, make the top five tags your sub-genre, and write the short description with specific verbs. Aim for **10% or more visit-to-wishlist**, and treat under 5% as an alarm.
6. **Spend animation money on talking faces first.** Portrait expressions, blinks, text effects and per-character blips give the most perceived quality per dollar in a story game.
7. **Get "wow per frame" from a lighting and shader layer** over sprites (the Eastward and Sea of Stars approach) rather than full HD-2D, unless the budget supports 3D environments.
8. **Design for handhelds from day one.** Text must be legible at 1280×800, the UI must work with a controller, and you should pursue Deck Verified status. Pixel games over-index on Deck and Switch.
9. **Choose a base resolution that integer-scales to 720p, 1080p, 1440p and 4K.** 320×180 and 640×360 do. Plan for 16:10 by expanding the view rather than letterboxing.
10. **Pick an engine with a priced console route.** Options are GameMaker Enterprise, Godot through W4 or Pineapple Works, or Unity's native support. Budget for Switch and Switch 2 from the start.
11. **Treat music as a marketing asset.** Write one hummable leitmotif for the trailer and clips, and release an OST DLC.
12. **Ship and declare accessibility features.** Include assist or story mode, a readable font, text controls and shake and flash toggles, then list them on Steam to widen the audience and protect review scores.
