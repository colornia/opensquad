# OpenSquad v0.1

A Minecraft Java Edition teammate for private and local servers, built with TypeScript and Mineflayer. It follows players, gathers resources, shares inventory items, and guards against nearby hostile mobs. Commands, text chat, and persistent player memories work without an LLM API key.

## Quick start

Install Node.js 22 or newer. From this repository directory:

```sh
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux). Set `MC_HOST`, `MC_PORT`, and optionally `MC_VERSION` to your Java server. Start the server first, then:

```sh
npm run dev
```

For a compiled run use `npm run build` followed by `npm start`. The bot prints a connection message and announces `Ready! Use !bot help.` in game. No API account or key is required. Run one bot process per memory file.

For the simplest offline test server, use a private Java server with `online-mode=false` and bind it to `127.0.0.1` in `server.properties`. For a server using account authentication, set `MC_AUTH=microsoft` and `MC_USERNAME` to the bot account identifier; follow Mineflayer's first-run Microsoft sign-in instructions in the terminal. The account must have Java Edition access and be permitted by the server whitelist. Offline mode is intended for an isolated local server. A single-player world opened to LAN also works: use its displayed LAN port, which changes between sessions.

Use a Java version supported by the installed Mineflayer release, rather than assuming the newest game release is supported. Leave `MC_VERSION` empty to detect the protocol or specify the server version exactly. The included network smoke test uses **1.18.2**. It is a temporary protocol-compatible server, not the official Mojang Java server; real vanilla/Paper gameplay and newer versions still need manual acceptance testing.

## Playing together

Enter these messages in game. Prefix every command or conversation with `!bot`, or address the bot as `OpenSquad: follow me`. Unaddressed chat is ignored. Set `ALLOWED_PLAYERS=YourName,FriendName` to restrict who can direct the bot; empty permits any player in the private server.

| Message                                  | Behavior                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| `!bot follow me`                         | Follow the issuing player at about two blocks distance.         |
| `!bot stop`                              | Cancel collection/navigation and stop guarding or fighting.     |
| `!bot come here`                         | Walk to the issuing player's current position.                  |
| `!bot collect oak_log 3`                 | Gather up to three additional items; default quantity is one.   |
| `!bot give me oak_log 3`                 | Walk to you and toss up to three inventory items for pickup.    |
| `!bot protect me`                        | Follow and target nearby hostile mobs around you until stopped. |
| `!bot attack nearby hostile mobs`        | Target nearby hostile mobs around the bot until stopped.        |
| `!bot remember I prefer exploring caves` | Persist an explicit player preference.                          |
| `!bot memory`                            | Show preferences and the last three shared action events.       |
| `!bot how are you?`                      | Chat with the mock brain or configured LLM.                     |
| `!bot help`                              | Show commands.                                                  |

The movement commands also accept `跟着我`, `停下`, `过来`, `保护我`, and `攻击`. Use Minecraft registry item names for collection and giving; spaces are converted to underscores. Collection supports `oak_log`, `birch_log`, `spruce_log`, `dirt`, `sand`, `cobblestone`, `coal`, `raw_iron`, and `diamond`. It mines source blocks and picks up drops; it does not craft or smelt. Give accepts any exact inventory item name. Give supplies available items even when fewer than requested, and reports the actual number tossed. Pickup by the intended player is not guaranteed if another entity is beside the drop.

Stay within visible, loaded chunks. Give the bot an appropriate pickaxe before requesting ores; missing tools, unreachable paths, unknown resources, and absent players produce chat feedback. Collection searches 32 blocks by default and caps a request at 16 items (configurable). One source block can yield more than one item. Attempts are bounded, so incomplete collection reports the actual quantity. During collection, pathfinding can break only the resource's source block types; it may break those while navigating. Ordinary follow/navigation does not dig. Single finite actions time out after 45 seconds. Follow and guard are ongoing modes until `stop` or another action replaces them. A finite action in progress rejects additional requests except `stop`.

Combat is deliberately basic: a fixed hostile allowlist, bounded range, pursuit, and a 650 ms attack interval. It uses the currently held item (or punches), never deliberately targets players or passive animals, and has no advanced shielding, armor management, healing, creeper avoidance, or guaranteed survival. Some conditionally hostile mobs such as spiders are included; neutral endermen and zombified piglins are excluded. The network smoke checks that combat modes start and stop, not combat success against live mobs.

## Architecture and LLM configuration

`src/brain` contains the provider-neutral `Brain.reply(context, signal)` interface, deterministic `MockBrain`, and an OpenAI-compatible HTTP implementation. To use another provider, implement the interface and select it in `createBrain`. Set `BRAIN_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` to enable the bundled HTTP provider. Requests time out after ten seconds and fall back to mock replies on missing keys, transport failures, or invalid responses. A configured external provider receives addressed conversational text, the player name, and that player's saved preferences/events. Deterministic action commands do not call the LLM.

`src/planner/router.ts` parses explicit intents; `controller.ts` handles scheduling, interruption, results and memory. `src/skills` defines the game action contract. `src/minecraft/adapter.ts` implements it with Mineflayer, Pathfinder and CollectBlock. `src/memory/store.ts` stores at most 20 preferences and 50 timestamped action events per player in `data/memory.json`, with atomic file replacement. Memories survive restarts. Invalid memory files fail startup rather than silently overwriting saved data. Delete that file to reset memories. No hidden game actions are inferred from model output.

Configuration is in `.env.example` with defaults in `src/config.ts`. Numeric settings are range-validated. The bot exits on disconnect; restart it after correcting a port/version/authentication problem. There is no automatic reconnect loop.

## Verification

```sh
npm run check
npm run smoke
```

`check` compiles strict TypeScript and runs tests for deterministic routing, prefix boundaries, persisted/bounded memory, action failure feedback and interruption. `smoke` starts an ephemeral localhost Flying Squid server and two real Mineflayer clients, then checks inbound player chat, outbound bot responses, follow/stop/come/guard/attack routing, actual dirt collection into inventory, item tossing, and memory reload. It requires no Java installation, external server, credentials, or LLM API. The fixture explicitly sends surrounding chunks to make loading deterministic and shuts down afterward. Flying Squid is a development-only dependency.

For manual acceptance on your Java server: connect the bot and your player in survival mode, issue follow while walking, stop, come, collect logs, give the logs back, then test protection against a nearby zombie. Restart the bot and verify `!bot memory`. Also test a missing pickaxe, unreachable resource, and stopping during collection. External LLM calls are not covered by the local network smoke.

Mineflayer's authentication dependencies currently include moderate-severity advisories. Run `npm audit` to review the findings for your installed dependency versions. This release is intended for private and local servers.

Upstream API references: [Mineflayer](https://github.com/PrismarineJS/mineflayer), [Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), and [CollectBlock](https://github.com/PrismarineJS/mineflayer-collectblock).
