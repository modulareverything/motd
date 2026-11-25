# motd

Match of the day: today's best matches, with a link straight to the video, without seeing a score.

```
$ motd cs
1. ★ LIVE                Team Vitality vs MOUZ
                          BLAST Rivals Fall 2026 · Playoffs - Bo3
2.   FINISHED Wed 11:00   Ninjas in Pyjamas vs Team Liquid
                          PGL Major Singapore 2026 · Round 3 - Bo3
3.   UPCOMING 19:00      HEROIC vs FaZe Clan
                          PGL Major Singapore 2026 · Round 4 - Bo3

Watch which? (number, Enter to quit)
```

Type a number and the video opens in your browser:

- **Finished:** the full VOD at the start of Map 1. If there's no VOD yet, a video found on YouTube, which may be highlights; you're told which before it opens.
- **Live:** the stream, from the start.
- **Upcoming:** the stream's channel.

The list never shows a score, a winner or how many maps were played. YouTube's own page still shows the video's title and length.

Only Counter-Strike (`cs`) exists so far.

## What it lists

Matches from S-tier and A-tier events, plus every match of the teams you support (marked ★), from the last 36 hours, live now, or starting later today. It shows the top 5; `--all` shows the rest.

Your teams come first. The others are ranked by:

- the event's tier;
- the stage, from grand final down to groups;
- both teams' places in [Valve's Regional Standings](https://github.com/ValveSoftware/counter-strike_regional_standings);
- for finished matches, the video's views per hour since upload, compared with the other videos in the list. Videos under 3 hours old don't count.

## Setup

1. Install [Bun](https://bun.sh).
2. Clone and install:

   ```sh
   git clone https://github.com/<owner>/motd.git
   cd motd
   bun install
   bun link
   ```

   `bun link` puts `motd` on your PATH.

3. Optional: add a YouTube API key, which lets motd use view counts and find videos Liquipedia hasn't linked yet.
   1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
   2. In **APIs & Services → Library**, enable **YouTube Data API v3**.
   3. In **APIs & Services → Credentials**, choose **Create credentials → API key**. Edit the key and restrict it to YouTube Data API v3.
   4. `cp env.example .env` and paste the key after `YOUTUBE_API_KEY=`.

   motd reads the `.env` in its own folder, wherever you run it from. A 1Password Environments `.env` mounted there works too.

4. Run `motd cs`. The first run asks for:
   - **a contact email**, which Liquipedia's API terms ask every client to send;
   - **the teams you support**, checked against Liquipedia, so `vitality` is saved as `Team Vitality`.

   Run `motd setup cs` to change your teams later. Settings live in `~/.config/motd/config.json`.

## Usage

```
motd cs             top 5
motd cs --all       every match
motd cs --refresh   skip the 10-minute cache
motd setup cs       choose your teams
```

## Where the data comes from

- [Liquipedia](https://liquipedia.net/counterstrike): matches, tiers, stages and VOD links. Content is [CC-BY-SA 3.0](https://liquipedia.net/api-terms-of-use). motd keeps to its rate limits (one request every 2 seconds, one page render every 30) and caches responses for 10 minutes in `~/.cache/motd`. So a run straight after `--refresh` can wait up to 30 seconds.
- [Valve Regional Standings](https://github.com/ValveSoftware/counter-strike_regional_standings): team rankings, cached for a day.
- YouTube Data API: view counts and searches, if you've set a key.

## Development

```sh
bun test
bun run typecheck
```

`src/core` is the command: arguments, setup, config, cache, ranking the list and opening links. Each game is one folder under `src/games` that exports a `Game` (`src/core/game.ts`) and is added to the map in `src/cli.ts`.
