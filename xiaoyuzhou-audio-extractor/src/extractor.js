const { URL } = require("node:url");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const EXTRACTION_METHODS = {
  NEXT_MEDIA_SOURCE: "next_data.media.source.url",
  NEXT_ENCLOSURE: "next_data.enclosure.url",
  OG_AUDIO: "meta.og:audio",
};

class ExtractorError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = "ExtractorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeEpisodeUrl(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ExtractorError("INVALID_URL", "episode_url must be a valid URL", 400);
  }

  const allowedHosts = new Set(["www.xiaoyuzhoufm.com", "xiaoyuzhoufm.com"]);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new ExtractorError("INVALID_URL", "episode_url must be a xiaoyuzhou episode URL", 400);
  }

  const match = parsed.pathname.match(/^\/episode\/([A-Za-z0-9]+)$/);
  if (!match) {
    throw new ExtractorError("INVALID_URL", "episode_url must match /episode/<episode_id>", 400);
  }

  return {
    rawUrl: input,
    canonicalUrl: `https://www.xiaoyuzhoufm.com/episode/${match[1]}`,
    episodeId: match[1],
  };
}

async function fetchEpisodeHtml(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } catch (error) {
    throw new ExtractorError("FETCH_FAILED", `failed to fetch episode page: ${error.message}`, 502);
  }

  if (response.status === 404) {
    throw new ExtractorError("EPISODE_NOT_FOUND", "episode page not found", 404);
  }

  if (!response.ok) {
    throw new ExtractorError(
      "FETCH_FAILED",
      `episode page returned unexpected status ${response.status}`,
      502
    );
  }

  return response.text();
}

function extractMetaContent(html, propertyName) {
  const pattern = new RegExp(
    `<meta\\s+[^>]*property=["']${escapeRegex(propertyName)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match ? match[1] : null;
}

function extractNextDataJson(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
  );
  if (!match) {
    throw new ExtractorError("PARSE_FAILED", "__NEXT_DATA__ not found in episode page", 422);
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    throw new ExtractorError("PARSE_FAILED", "__NEXT_DATA__ is not valid JSON", 422);
  }
}

function inferMimeType(...urls) {
  for (const candidate of urls) {
    if (!isNonEmptyString(candidate)) {
      continue;
    }
    const lowered = candidate.toLowerCase();
    if (lowered.endsWith(".mp3")) {
      return "audio/mpeg";
    }
    if (lowered.endsWith(".m4a")) {
      return "audio/mp4";
    }
  }
  return null;
}

function parseEpisodePage(html, inputUrl) {
  const normalized = normalizeEpisodeUrl(inputUrl);
  const nextData = extractNextDataJson(html);
  const episode = nextData?.props?.pageProps?.episode;

  if (!episode) {
    throw new ExtractorError("PARSE_FAILED", "episode payload not found in __NEXT_DATA__", 422);
  }

  if (episode.isPrivateMedia === true) {
    throw new ExtractorError("EPISODE_NOT_PUBLIC", "episode media is private", 422);
  }

  const audioCandidates = [
    {
      url: episode?.media?.source?.url,
      method: EXTRACTION_METHODS.NEXT_MEDIA_SOURCE,
    },
    {
      url: episode?.enclosure?.url,
      method: EXTRACTION_METHODS.NEXT_ENCLOSURE,
    },
    {
      url: extractMetaContent(html, "og:audio"),
      method: EXTRACTION_METHODS.OG_AUDIO,
    },
  ];

  const winner = audioCandidates.find((item) => isNonEmptyString(item.url));
  if (!winner) {
    throw new ExtractorError("AUDIO_NOT_FOUND", "audio url not found from episode page", 422);
  }

  return {
    ok: true,
    episode_id: episode?.eid || normalized.episodeId,
    show_id: episode?.pid || null,
    show_title: episode?.podcast?.title || null,
    episode_title: episode?.title || null,
    published_at: episode?.pubDate || null,
    audio_url: winner.url,
    final_audio_url: winner.url,
    backup_audio_url: episode?.media?.backupSource?.url || null,
    mime_type:
      episode?.media?.mimeType ||
      inferMimeType(winner.url, episode?.media?.backupSource?.url, episode?.enclosure?.url),
    duration_sec: typeof episode?.duration === "number" ? episode.duration : null,
    is_private_media: false,
    extraction_method: winner.method,
  };
}

async function resolveFinalAudioUrl(audioUrl, maxHops = 3) {
  if (!isNonEmptyString(audioUrl)) {
    return null;
  }

  let current = audioUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    let response;
    try {
      response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
        },
      });
    } catch {
      return current;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!isNonEmptyString(location)) {
        return current;
      }
      current = new URL(location, current).toString();
      continue;
    }

    return current;
  }

  return current;
}

async function extractEpisodeAudio(inputUrl) {
  const normalized = normalizeEpisodeUrl(inputUrl);
  const html = await fetchEpisodeHtml(normalized.rawUrl);
  const parsed = parseEpisodePage(html, normalized.rawUrl);
  const finalAudioUrl = await resolveFinalAudioUrl(parsed.audio_url);

  return {
    ...parsed,
    final_audio_url: finalAudioUrl || parsed.audio_url,
  };
}

module.exports = {
  EXTRACTION_METHODS,
  ExtractorError,
  extractEpisodeAudio,
  fetchEpisodeHtml,
  normalizeEpisodeUrl,
  parseEpisodePage,
  resolveFinalAudioUrl,
};
