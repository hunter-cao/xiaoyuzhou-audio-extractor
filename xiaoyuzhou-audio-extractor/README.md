# Xiaoyuzhou Audio Extractor

Zero-dependency Node service for extracting public audio metadata from Xiaoyuzhou episode pages.

## Run

```powershell
$env:PORT=3000
$env:HOST="0.0.0.0"
$env:XIAOYUZHOU_EXTRACTOR_API_KEY="replace-me"
node src/server.js
```

If `XIAOYUZHOU_EXTRACTOR_API_KEY` is not set, the server runs without API-key enforcement for local development.

You can also copy `.env.example` into your deployment platform's environment variables.

## API

`POST /extract-xiaoyuzhou-audio`

Request:

```json
{
  "episode_url": "https://www.xiaoyuzhoufm.com/episode/69c89d89302f387cfd9a3cb9"
}
```

Success response:

```json
{
  "ok": true,
  "episode_id": "69c89d89302f387cfd9a3cb9",
  "show_id": "66379a314b7d3b5d3b2d5b0d",
  "show_title": "毕不了业",
  "episode_title": "91|停止内耗 打破僵局：职场脱困的屠龙之术",
  "published_at": "2026-03-29T03:23:55.000Z",
  "audio_url": "https://tk.wavpub.com/....mp3",
  "final_audio_url": "https://media-archived.wavpub.com/....mp3",
  "backup_audio_url": "https://media.xyzcdn.net/....mp3",
  "mime_type": "audio/mpeg",
  "duration_sec": 4595,
  "is_private_media": false,
  "extraction_method": "next_data.media.source.url"
}
```

## Endpoints

- `GET /healthz`
- `POST /extract-xiaoyuzhou-audio`

## Deploy

Recommended environment variables:

- `PORT=3000` or platform-provided port
- `HOST=0.0.0.0`
- `XIAOYUZHOU_EXTRACTOR_API_KEY=<strong-random-key>`

The service is deployment-ready for standard Node web-service hosts such as Render or Railway.

## Test

```powershell
node test/extractor.test.js
```
