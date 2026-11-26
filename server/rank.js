// Timeline ranking: drops ads/promo posts and mixes sources so one prolific feed can't flood the feed.

// --- Spam filter -----------------------------------------------------------------------------------
// Titles and categories are checked against all patterns; the longer excerpt only against the
// unambiguous ones, so an article that merely mentions a sale in passing is kept.

const STRONG = [
  /\bpromo(tional)?[\s-]?codes?\b/i,
  /\bcoupon(s|[\s-]?codes?)?\b/i,
  /\b(discount|voucher|referral|redeem)[\s-]?codes?\b/i,
  /\buse (the )?code\b/i,
  /\bsponsored( (post|content|by))?\b/i,
  /\bpaid (post|partnership|promotion|content)\b/i,
  /\bpartner content\b/i,
  /\badvertorial\b/i,
  /\b(this|the) (post|article) (contains|includes) affiliate links\b/i,
];

const TITLE_ONLY = [
  /\b\d{1,2}\s?% off\b/i,
  /\b(save|get) (up to )?[$£€]\s?\d/i,
  /[$£€]\s?\d[\d,.]*\s?off\b/i,
  /\b(best|top|early|biggest|hottest|great|epic|lightning|daily|weekend) deals?\b/i,
  /\bdeals? (of the (day|week)|alert|roundup)\b/i,
  /\b(black friday|cyber monday|prime day|boxing day|labou?r day|memorial day|presidents'? day) (deals?|sales?|discounts?|offers?)\b/i,
  /\b(all[\s-]time|record|new) low(est)? price\b/i,
  /\blowest price (ever|yet)\b/i,
  /\bprice drop\b/i,
  /\b(on|for) sale (now|today|for)\b/i,
  /\bbuy (it )?now\b/i,
  /\blimited[\s-]time (offer|deal|sale)\b/i,
  /\bshop (the|our|these)\b/i,
  /\bgiveaway\b/i,
];

const SPAM_CATEGORIES = /^(deals?|sales?|coupons?|sponsored|sponsor|promoted|promotion|advertorial|advertisement|commerce|shopping|affiliate|partner(ed)? content|brand ?studio|gift guides?)$/i;
const SPAM_PATH = /\/(deals?|coupons?|promo(-codes?)?|sponsored|partner-content|shopping|commerce)(\/|$|-)/i;

export function isSpam(item) {
  const title = item.title || '';
  if (STRONG.some((re) => re.test(title)) || TITLE_ONLY.some((re) => re.test(title))) return true;
  if ((item.categories || []).some((c) => SPAM_CATEGORIES.test(String(c).trim()))) return true;
  if (STRONG.some((re) => re.test(item.excerpt || ''))) return true;
  try {
    if (SPAM_PATH.test(new URL(item.link).pathname)) return true;
  } catch { /* unparsable link: keep */ }
  return false;
}

// --- Source mixing ------------------------------------------------------------------------------
// Each source's posts are ranked newest-first. A post's sort time is pushed back by POST_PENALTY for
// every newer post from the same source, so a source's 10th story of the hour sorts as if it were
// many hours older. A final pass then keeps the same source from appearing twice in a row
// (or within MIN_GAP posts) whenever another source has a post available.

const POST_PENALTY = 90 * 60 * 1000; // 90 minutes per earlier post from the same source
const MIN_GAP = 3; // a source may reappear only after this many posts from others
const LOOKAHEAD = 25;

export function diversify(items) {
  const count = new Map();
  const scored = [...items]
    .sort((a, b) => b.published - a.published)
    .map((it) => {
      const n = count.get(it.sourceId) || 0;
      count.set(it.sourceId, n + 1);
      return { it, score: (it.published || 0) - n * POST_PENALTY };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.it);

  const out = [];
  const pool = scored;
  while (pool.length) {
    const recent = new Set(out.slice(-MIN_GAP).map((it) => it.sourceId));
    let pick = 0;
    const limit = Math.min(pool.length, LOOKAHEAD);
    for (let i = 0; i < limit; i++) {
      if (!recent.has(pool[i].sourceId)) { pick = i; break; }
    }
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}
