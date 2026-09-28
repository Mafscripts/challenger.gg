# Ranked voice proxy

The production site must forward WebSocket upgrades for
`/api/ranked-voice` to the Node API server.

1. Add the location block from `topfragg-ranked-voice.conf` to the HTTPS
   `server` block for `www.topfragg.gg`.
2. Validate the configuration with `sudo nginx -t`.
3. Apply it with `sudo systemctl reload nginx`.

A working endpoint accepts the WebSocket upgrade. Without these headers,
Nginx forwards the request as a normal HTTP GET and Express returns 404.
