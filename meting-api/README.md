# Meting API

Small Node API used by the Astro music player.

## Local Run

```bash
pnpm install
pnpm start
```

Default local endpoint:

```txt
http://127.0.0.1:4010/api?server=netease&type=playlist&id=14164869977
```

Useful environment variables:

```txt
PORT=4010
METING_MAX_TRACKS=80
METING_CACHE_TTL_MS=600000
METING_ENRICH_CONCURRENCY=4
METING_BITRATE=320
METING_PIC_SIZE=300
```

The frontend reads `PUBLIC_METING_API` at build time. For production, set it to:

```txt
/api/meting?server=:server&type=:type&id=:id&auth=:auth&r=:r
```

On Vercel, the deployable function is `api/meting.js`, so the API is available
from the same domain as the blog.
