# Pulse: an Instagram-style news feed

Pulse turns RSS/Atom news feeds into a photo feed like Instagram's: big images, short captions, stories and an explore grid. It's for following **news** on tech, AI, gaming, science, space, security and dev. It has no video channels and no friends-and-family posts.

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # restarts on file changes
npm test
```

Requires Node 18.17+. The only dependency is `fast-xml-parser`.

## What it looks like

| Instagram | Pulse |
|---|---|
| Home feed | Posts from the sources you follow, newest first, with an image (or a styled title card), a bold headline and a two-line caption with **more** |
| Stories | One circle per topic or hashtag you follow. Tap to flip through the top headlines full-screen. The rings go grey once you've seen them |
| Double-tap to like | Same. Likes and saves are kept on your device |
| Explore | A grid of posts from the whole catalog, filtered by topic, with search |
| Profiles | Every source has a profile page with a post grid, its feed and a Follow button |
| Hashtags | `#Nintendo`, `#OpenAI` and so on. Following one gives you a live news search for it |
| Suggested for you | A side panel on wide screens with sources and hashtags you don't follow yet |

## Ways to add content

Open **Follow feeds** (the ⊕ tab) and type any of these:

- **A website** (`theverge.com`): Pulse finds its RSS/Atom feed from the page, or by trying common paths like `/feed`.
- **A feed URL** (`https://hnrss.org/newest?q=LLM`): any RSS, Atom or RDF feed.
- **A #hashtag** (`#Steam Deck`): a live news search through Bing News RSS, which comes with thumbnails.
- **A subreddit** (`r/MachineLearning`): the subreddit's top posts of the day.
- **OPML import**: bring your subscriptions from another reader. YouTube/Twitch entries are skipped. Export works too.
- **The curated catalog**: about 35 hand-picked sources across 7 topics, with **Follow all** per topic. Edit `server/catalog.js` to change it.

YouTube, youtu.be and Twitch URLs are refused everywhere (catalog, discovery and individual feed items).

## Performance

- **Server cache**: each feed is cached for 10 minutes (`FEED_TTL_MS`). Stale feeds are served right away and refreshed in the background. Up to 8 feeds are fetched in parallel, and duplicate stories are dropped.
- **Images on demand**: when a feed has no picture, the browser asks `/api/preview` for the article's `og:image` only as the post scrolls near the screen. Results are cached on the server and in the browser.
- **Instant start**: the last timeline is kept in `localStorage` and drawn immediately. New posts show up behind a "↑ N new posts" pill instead of the page jumping.
- **Light page**: no framework and no build step. Posts are added 10 at a time as you scroll, with `content-visibility` and lazy images. Responses are gzipped and use ETags.
- **Safety**: only http(s) URLs. Private and loopback addresses are blocked on every redirect hop. Requests have timeouts and size caps.

## Project layout

```
server/
  index.js     HTTP server: static files + JSON API
  feeds.js     RSS/Atom/RDF parsing, image extraction, caching, merging
  discover.js  website → feed discovery, #hashtags, r/subreddits, og:image previews
  catalog.js   curated sources, topics and suggested hashtags
  net.js       safe fetch (SSRF guard, timeouts, size limits), LRU, concurrency
public/
  index.html, app.css, app.js   the single-page app (hash routes: #/ #/explore #/following #/saved #/source/:id #/tag/:tag)
test/          node:test suites with feed fixtures
```

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/catalog` | Topics, curated sources, suggested hashtags |
| POST | `/api/feed` | `{ feeds: [{ id, url }] }` → merged `{ items, errors }` |
| GET | `/api/discover?q=` | Website, feed URL, `#tag` or `r/sub` → feeds you can follow |
| GET | `/api/preview?url=` | Article `og:image` and description |

Environment variables: `PORT` (3000), `HOST`, `FEED_TTL_MS`, and `ALLOW_PRIVATE_HOSTS=1` (only for local feeds during development).
