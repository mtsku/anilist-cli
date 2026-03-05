# AniList CLI

AniList CLI for search, discovery, airing schedules, social views, and list updates via GraphQL.

## Install

Global install:

```bash
npm install -g @mtsku/anilist-cli
anilistcli --help
```

Repository/local runner:

```bash
npm install
npm run build
./scripts/anilistcli --help
```

Use `anilistcli` on `PATH` when available. Use `./scripts/anilistcli` only when running from this repository.

## Authentication

Token precedence:

1. `--token <token>`
2. `ANILIST_TOKEN` or `ANILIST_ACCESS_TOKEN`
3. `~/.config/anilist-cli/config.json`

```bash
anilistcli auth set-token "<token>"
anilistcli auth where
anilistcli whoami
```

## Command Groups

```bash
anilistcli search <anime|manga|character|staff|user> "<query>" -n 5
anilistcli discover seasonal --season WINTER --year 2026 -n 20
anilistcli discover upcoming -n 15
anilistcli airing upcoming --hours 48 -n 25
anilistcli airing next "<title>"
anilistcli airing mine --hours 72 --limit 50
anilistcli mine summary --hours 72 -n 10
anilistcli media recs "<title>" -n 10
anilistcli media relations "<title-or-url>"
anilistcli profile [username]
anilistcli user <username>
anilistcli friends [username] -n 50
anilistcli followers [username] -n 50
anilistcli following [username] -n 50
anilistcli list view --type anime --status-in "CURRENT,PLANNING"
anilistcli planning add "<title>"
anilistcli status set "<title>" CURRENT
anilistcli progress set "<title>" 12
```

`planning` also supports alias `watchlater`.

## JSON and Dry Run

```bash
anilistcli --json discover upcoming -n 5
anilistcli --json airing mine --hours 48 -n 20
anilistcli --json mine summary --hours 48 -n 8
anilistcli --dry-run status set "<title>" PAUSED --json
```
