import type { Feed } from "./types";

/**
 * Default feeds/tags loaded into KV the first time the app runs
 * (i.e. when the `feeds-config` key doesn't exist yet).
 */
export const SEED_FEEDS: Feed[] = [
  // Tech Art
  {
    id: "80-level",
    name: "80 Level",
    url: "https://80.lv/feed",
    tags: ["Tech Art"],
  },
  {
    id: "creative-applications",
    name: "CreativeApplications.Net",
    url: "https://www.creativeapplications.net/feed/",
    tags: ["Tech Art"],
  },
  {
    id: "acm-siggraph-blog",
    name: "ACM SIGGRAPH Blog",
    url: "https://blog.siggraph.org/feed/",
    tags: ["Tech Art"],
  },
  {
    id: "two-minute-papers",
    name: "Two Minute Papers",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg",
    tags: ["Tech Art"],
  },

  // Cinema
  {
    id: "mubi-notebook",
    name: "MUBI Notebook",
    // mubi.com/notebook.atom (the URL originally requested) now 404s; this is
    // the current feed URL per the <link rel="alternate" type="application/atom+xml">
    // on https://mubi.com/notebook.
    url: "https://mubi.com/notebook/posts.atom",
    tags: ["Cinema"],
  },
  {
    id: "criterion-current",
    name: "The Criterion Collection – The Current",
    url: "https://www.criterion.com/current.rss",
    tags: ["Cinema"],
  },
  {
    id: "eastern-kicks",
    name: "EasternKicks",
    url: "https://www.easternkicks.com/feed",
    tags: ["Cinema"],
  },
  {
    id: "senses-of-cinema",
    name: "Senses of Cinema",
    url: "https://www.sensesofcinema.com/feed/",
    tags: ["Cinema"],
  },
  {
    id: "accented-cinema",
    name: "Accented Cinema",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCH_VqR5rFFhgjZmM31xA3Ag",
    tags: ["Cinema"],
  },
  {
    id: "every-frame-a-painting",
    name: "Every Frame a Painting",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCjFqcJQXGZ6T6sxyFB-5i6A",
    tags: ["Cinema"],
  },
  {
    id: "nerdwriter1",
    name: "Nerdwriter1",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCJkMlOu7faDgqh4PfzbpLdg",
    tags: ["Cinema"],
  },

  // Science
  {
    id: "veritasium",
    name: "Veritasium",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
    tags: ["Science"],
  },
  {
    id: "numberphile",
    name: "Numberphile",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCoxcjq-8xIDTYp3uz647V5A",
    tags: ["Science"],
  },
  {
    id: "kurzgesagt",
    name: "Kurzgesagt – In a Nutshell",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q",
    tags: ["Science"],
  },
  {
    id: "nightshift-kurzgesagt",
    name: "Nightshift – Kurzgesagt After Dark",
    // Only a handle page is known for this one; resolved to a canonical
    // videos.xml feed URL lazily on first refresh (see youtubeResolve.ts).
    url: "https://www.youtube.com/@nightshift_kurzgesagt",
    tags: ["Science"],
  },
];

export const SEED_TAGS: string[] = ["Tech Art", "Cinema", "Science"];
