# OpenSquad

A teammate for your Minecraft world.

[简体中文](README.md) · [Setup and development](docs/development.en.md)

OpenSquad joins your private Minecraft Java server as another player. Ask it to follow you, gather nearby materials, share inventory items, or guard against nearby hostile mobs through in-game text chat. Basic commands and saved preferences work without an LLM API key. An optional model provider adds free-form conversation.

This is an early release. Movement, chat, dirt collection, and item tossing have been checked against a local protocol server. Full gameplay on vanilla/Paper servers and combat against live mobs still need manual testing. There is no voice chat, autonomous building, healing, or advanced combat strategy yet.

## Get started

Install Node.js 22 or newer and start a private/local Minecraft Java server. From the project folder, run `npm ci`, copy `.env.example` to `.env`, and set `MC_HOST` and `MC_PORT`. Start the bot with `npm run dev`. For authenticated servers use `MC_AUTH=microsoft` and follow the terminal sign-in instructions with a Java-enabled account. Offline authentication is for an isolated local test server.

```text
!bot follow me
!bot collect oak_log 3
!bot give me oak_log 3
!bot protect me
!bot stop
```

Stay close to the bot and provide a suitable pickaxe before requesting ores. `!bot help` lists commands. `!bot remember I like exploring caves` saves a preference; `!bot memory` recalls preferences and recent shared events. `!bot forget me` removes your local record.

## Data and contributions

Preferences and successful action events live in `data/memory.json`, which is excluded from Git. Ordinary chat is not saved. With an external model enabled, addressed free-form chat, player name, and saved memory are sent to the configured provider. Local deletion does not remove copies held by that provider. Do not include credentials or private server details in issue reports.

OpenSquad uses Mineflayer and is licensed under MIT. See the [development guide](docs/development.en.md) for provider integration and tests. Report reproducible problems through [Issues](https://github.com/colornia/opensquad/issues).
