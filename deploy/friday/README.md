# Deploying FRIDAY (phone-only)

FRIDAY runs as a container on an always-on host. You never need a laptop: the deploy button
is the **FRIDAY Deploy** workflow in the GitHub mobile app, and every other control is a chat
command. See `docs/contracts/phone-only.md` for why.

## One-time setup (from the phone)

You need: a GitHub account (you have one — this repo), and a host that can run Docker
(see "Choosing a host" below).

1. **Turn on the image.** On GitHub, open this repo → Settings → Actions → General →
   Workflow permissions → select **Read and write permissions**. This lets the deploy
   workflow publish the image to the GitHub Container Registry (GHCR). Save.

2. **Build the first image.** GitHub mobile app → this repo → Actions → **FRIDAY Deploy**
   → Run workflow. Wait for the green tick (~10–20 min the first time; it builds the whole
   engine). Open the run and copy the image reference from the summary, e.g.
   `ghcr.io/benardprince-m/friday:main`.

3. **Put FRIDAY on the host.** On the host, create a folder, copy
   `deploy/friday/docker-compose.yml` and `deploy/friday/.env.friday.example` into it, rename
   the example to `.env`, and set `FRIDAY_IMAGE` to the reference from step 2. Then start it
   with `docker compose up -d` (this one command is run on the host — see "Choosing a host"
   for how to do it without a laptop).

4. **Enable the plugin and set your owner id.** Edit `state/openclaw.json` (created on first
   run) to enable FRIDAY and set `ownerIds`, then restart the service:

   ```json
   {
     "plugins": {
       "entries": {
         "friday": {
           "enabled": true,
           "config": {
             "ownerIds": ["telegram:<your-telegram-user-id>"],
             "lockedDown": false
           }
         }
       }
     }
   }
   ```

   Until `ownerIds` is set, FRIDAY admits **no one** (fail-closed). See
   `OWNER_REQUIREMENTS.md` for what each value is.

5. **Give FRIDAY its Telegram token — from chat.** Once the Telegram channel is configured,
   send `/secret TELEGRAM_BOT_TOKEN <token>` in your chat with FRIDAY. FRIDAY stores it and
   deletes your message. The value never appears in the reply.

## Everyday control (all from chat)

| You want to            | Do this                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| Deploy a new version   | Tap **FRIDAY Deploy** in the GitHub app, then restart on the host.   |
| Check health           | Send `/doctor` — the only health window you need.                    |
| Stop non-essential use | Send `/lockdown`; resume with `/unlock`.                             |
| Add a credential       | Send `/secret NAME value`; FRIDAY stores it and deletes the message. |
| Record a task          | Send `/task <what to do>`; `/tasks` lists them.                      |
| See spend              | Send `/spend`.                                                       |

## Choosing a host

Any always-on machine that runs Docker works. In rough order of phone-friendliness:

- **A managed container host with a web UI** (Fly.io, Railway, Render class): you deploy and
  watch logs from the phone's browser. Fly.io also reads `deploy/fly.private.toml` in this
  repo directly.
- **A small VPS** (e.g. Hetzner, DigitalOcean) with an SSH app on the phone (Termius, JuiceSSH)
  — one `docker compose up -d`, then never again.
- **A home mini-PC / Raspberry Pi** on your network — cheapest, but you must keep it powered.

The host choice is yours to make (it is a §12-class decision). Whatever you pick, the workflow
above does not change.

## If something breaks

- **No reply from FRIDAY?** Send `/doctor`. It reports what is up or down.
- **Deploy workflow red?** Open the failed run in the GitHub app; the log says which step
  failed. Send me the run URL in chat and I will read it.
- **Host down?** Restart the container from the host's own web UI or SSH app
  (`docker compose restart`). FRIDAY also restarts itself on crash (`restart: unless-stopped`).
