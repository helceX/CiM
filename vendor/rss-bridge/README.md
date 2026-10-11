# RSS-Bridge reference snapshot

Selected upstream source, not a full installation and not executable by Mediaory.

- Upstream: https://github.com/RSS-Bridge/rss-bridge
- Commit: `2e131a9754eec9e4788e7b36892e89626e0bc779`
- License: Unlicense, preserved verbatim in `UNLICENSE`.
- File: `bridges/TelegramBridge.php`, preserved verbatim for its public-channel input contract.
- Retrieved: 2026-10-11.

Mediaory's native TypeScript builder implements the bridge's `username` parameter and RSS-Bridge's `action=display&bridge=Telegram&format=Atom` interface. There is no PHP dependency, scraping process or new hosting service. An operator must supply an existing authorised HTTPS bridge. The resulting feed is processed by the normal SSRF-protected source test and crawl pipeline. The default upstream one-page collection should be retained by bridge operators.

This selected snapshot cannot be deployed alone: a complete RSS-Bridge installation has its own dependencies and resource costs. `vendor/` is excluded from production Docker build contexts. No public third-party bridge is selected automatically.
