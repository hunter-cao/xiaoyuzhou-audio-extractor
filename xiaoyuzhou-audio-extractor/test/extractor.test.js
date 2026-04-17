const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EXTRACTION_METHODS,
  ExtractorError,
  normalizeEpisodeUrl,
  parseEpisodePage,
} = require("../src/extractor");

const sampleHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta property="og:audio" content="https://fallback.example.com/audio.mp3" />
  </head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"episode":{"eid":"69c89d89302f387cfd9a3cb9","pid":"66379a314b7d3b5d3b2d5b0d","title":"测试节目标题","duration":4595,"pubDate":"2026-03-29T03:23:55.000Z","isPrivateMedia":false,"enclosure":{"url":"https://enclosure.example.com/audio.mp3"},"media":{"mimeType":"audio/mpeg","source":{"url":"https://source.example.com/audio.mp3"},"backupSource":{"url":"https://backup.example.com/audio.mp3"}},"podcast":{"title":"测试播客"}}}}}</script>
  </body>
</html>`;

const ogOnlyHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta property="og:audio" content="https://fallback.example.com/audio.m4a" />
  </head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"episode":{"eid":"abc123","pid":"pid123","title":"仅 meta","duration":10,"pubDate":"2026-03-29T03:23:55.000Z","isPrivateMedia":false,"media":{},"podcast":{"title":"测试播客"}}}}}</script>
  </body>
</html>`;

test("normalizeEpisodeUrl strips query while preserving episode id", () => {
  const normalized = normalizeEpisodeUrl(
    "https://www.xiaoyuzhoufm.com/episode/69c89d89302f387cfd9a3cb9?s=foo"
  );

  assert.equal(normalized.episodeId, "69c89d89302f387cfd9a3cb9");
  assert.equal(
    normalized.canonicalUrl,
    "https://www.xiaoyuzhoufm.com/episode/69c89d89302f387cfd9a3cb9"
  );
});

test("parseEpisodePage prefers __NEXT_DATA__ media source", () => {
  const result = parseEpisodePage(
    sampleHtml,
    "https://www.xiaoyuzhoufm.com/episode/69c89d89302f387cfd9a3cb9"
  );

  assert.equal(result.audio_url, "https://source.example.com/audio.mp3");
  assert.equal(result.final_audio_url, "https://source.example.com/audio.mp3");
  assert.equal(result.backup_audio_url, "https://backup.example.com/audio.mp3");
  assert.equal(result.show_title, "测试播客");
  assert.equal(result.extraction_method, EXTRACTION_METHODS.NEXT_MEDIA_SOURCE);
});

test("parseEpisodePage falls back to og:audio", () => {
  const result = parseEpisodePage(
    ogOnlyHtml,
    "https://www.xiaoyuzhoufm.com/episode/abc123"
  );

  assert.equal(result.audio_url, "https://fallback.example.com/audio.m4a");
  assert.equal(result.mime_type, "audio/mp4");
  assert.equal(result.extraction_method, EXTRACTION_METHODS.OG_AUDIO);
});

test("parseEpisodePage rejects private media", () => {
  const privateHtml = `<!DOCTYPE html>
  <html>
    <body>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"episode":{"eid":"private1","isPrivateMedia":true,"podcast":{"title":"测试播客"}}}}}</script>
    </body>
  </html>`;

  assert.throws(
    () => parseEpisodePage(privateHtml, "https://www.xiaoyuzhoufm.com/episode/private1"),
    (error) => {
      assert.equal(error instanceof ExtractorError, true);
      assert.equal(error.code, "EPISODE_NOT_PUBLIC");
      return true;
    }
  );
});
