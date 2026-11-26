// Curated "accounts" you can follow, grouped by topic. All are article feeds — no video channels.
// Each source: id, name, url (RSS/Atom), site, topic. Add your own here or from the app UI.

export const TOPICS = [
  { id: 'tech', name: 'Tech', emoji: '💻', color: '#3b82f6' },
  { id: 'ai', name: 'AI', emoji: '🤖', color: '#8b5cf6' },
  { id: 'gaming', name: 'Gaming', emoji: '🎮', color: '#ef4444' },
  { id: 'science', name: 'Science', emoji: '🔬', color: '#10b981' },
  { id: 'space', name: 'Space', emoji: '🚀', color: '#0ea5e9' },
  { id: 'security', name: 'Security', emoji: '🔐', color: '#f59e0b' },
  { id: 'dev', name: 'Dev', emoji: '⌨️', color: '#ec4899' },
];

const s = (id, name, topic, url, site) => ({ id, name, topic, url, site });

export const SOURCES = [
  // Tech
  s('verge', 'The Verge', 'tech', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com'),
  s('arstechnica', 'Ars Technica', 'tech', 'https://feeds.arstechnica.com/arstechnica/index', 'https://arstechnica.com'),
  s('techcrunch', 'TechCrunch', 'tech', 'https://techcrunch.com/feed/', 'https://techcrunch.com'),
  s('wired', 'WIRED', 'tech', 'https://www.wired.com/feed/rss', 'https://www.wired.com'),
  s('engadget', 'Engadget', 'tech', 'https://www.engadget.com/rss.xml', 'https://www.engadget.com'),
  s('9to5mac', '9to5Mac', 'tech', 'https://9to5mac.com/feed/', 'https://9to5mac.com'),
  s('9to5google', '9to5Google', 'tech', 'https://9to5google.com/feed/', 'https://9to5google.com'),
  s('hackernews', 'Hacker News', 'tech', 'https://hnrss.org/frontpage?points=150', 'https://news.ycombinator.com'),

  // AI
  s('mittr-ai', 'MIT Tech Review · AI', 'ai', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'https://www.technologyreview.com'),
  s('verge-ai', 'The Verge · AI', 'ai', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'https://www.theverge.com'),
  s('venturebeat-ai', 'VentureBeat · AI', 'ai', 'https://venturebeat.com/category/ai/feed/', 'https://venturebeat.com'),
  s('ars-ai', 'Ars Technica · AI', 'ai', 'https://arstechnica.com/ai/feed/', 'https://arstechnica.com'),
  s('huggingface', 'Hugging Face Blog', 'ai', 'https://huggingface.co/blog/feed.xml', 'https://huggingface.co'),
  s('google-ai', 'Google AI', 'ai', 'https://blog.google/technology/ai/rss/', 'https://blog.google'),
  s('openai', 'OpenAI News', 'ai', 'https://openai.com/news/rss.xml', 'https://openai.com'),

  // Gaming
  s('ign', 'IGN', 'gaming', 'https://feeds.feedburner.com/ign/all', 'https://www.ign.com'),
  s('polygon', 'Polygon', 'gaming', 'https://www.polygon.com/rss/index.xml', 'https://www.polygon.com'),
  s('pcgamer', 'PC Gamer', 'gaming', 'https://www.pcgamer.com/rss/', 'https://www.pcgamer.com'),
  s('rps', 'Rock Paper Shotgun', 'gaming', 'https://www.rockpapershotgun.com/feed', 'https://www.rockpapershotgun.com'),
  s('eurogamer', 'Eurogamer', 'gaming', 'https://www.eurogamer.net/feed', 'https://www.eurogamer.net'),
  s('gamespot', 'GameSpot', 'gaming', 'https://www.gamespot.com/feeds/mashup/', 'https://www.gamespot.com'),
  s('kotaku', 'Kotaku', 'gaming', 'https://kotaku.com/rss', 'https://kotaku.com'),

  // Science
  s('quanta', 'Quanta Magazine', 'science', 'https://www.quantamagazine.org/feed/', 'https://www.quantamagazine.org'),
  s('newscientist', 'New Scientist', 'science', 'https://www.newscientist.com/feed/home/', 'https://www.newscientist.com'),
  s('sciencedaily', 'ScienceDaily', 'science', 'https://www.sciencedaily.com/rss/top/science.xml', 'https://www.sciencedaily.com'),
  s('ars-science', 'Ars Technica · Science', 'science', 'https://feeds.arstechnica.com/arstechnica/science', 'https://arstechnica.com'),

  // Space
  s('nasa', 'NASA', 'space', 'https://www.nasa.gov/news-release/feed/', 'https://www.nasa.gov'),
  s('spacecom', 'Space.com', 'space', 'https://www.space.com/feeds/all', 'https://www.space.com'),
  s('spacenews', 'SpaceNews', 'space', 'https://spacenews.com/feed/', 'https://spacenews.com'),

  // Security
  s('krebs', 'Krebs on Security', 'security', 'https://krebsonsecurity.com/feed/', 'https://krebsonsecurity.com'),
  s('bleeping', 'BleepingComputer', 'security', 'https://www.bleepingcomputer.com/feed/', 'https://www.bleepingcomputer.com'),
  s('thehackernews', 'The Hacker News', 'security', 'https://feeds.feedburner.com/TheHackersNews', 'https://thehackernews.com'),

  // Dev
  s('github-blog', 'The GitHub Blog', 'dev', 'https://github.blog/feed/', 'https://github.blog'),
  s('smashing', 'Smashing Magazine', 'dev', 'https://www.smashingmagazine.com/feed/', 'https://www.smashingmagazine.com'),
  s('devto', 'DEV Community', 'dev', 'https://dev.to/feed', 'https://dev.to'),
];

/** Hashtags offered as one-tap follows in the app. They become live news searches. */
export const SUGGESTED_TAGS = ['OpenAI', 'Anthropic', 'Nvidia', 'Nintendo', 'PlayStation', 'Xbox', 'Steam', 'SpaceX', 'Apple', 'Android', 'Robotics', 'Quantum computing', 'Cybersecurity', 'Linux'];

export function catalog() {
  return { topics: TOPICS, sources: SOURCES, suggestedTags: SUGGESTED_TAGS };
}
