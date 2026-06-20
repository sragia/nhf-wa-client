# External API

Read-only HTTP API for pulling boss roster data and generated assignment notes into external tools (bots, spreadsheets, WeakAuras helpers, etc.).

All endpoints live under `/api/external/v1` and use **Bearer token** authentication. They do not use Discord session cookies.

---

## Authentication

### Creating an API key

1. Log in as an **officer** for the team.
2. Open **Settings → External API**.
3. Enter a name (e.g. `Raid bot`) and click **Generate API key**.
4. **Copy the key immediately** — it is only shown once.

Keys look like: `nhf_<random>` (prefix `nhf_`).

### Using an API key

Send the key on every request:

```http
Authorization: Bearer nhf_your_key_here
```

The key is tied to the team it was created for. You do not pass `teamId` in the URL; the server resolves the team from the token.

Keys are stored as SHA-256 hashes. Revoking a key in Settings invalidates it immediately.

### Errors

| Status | Meaning                                                          |
| ------ | ---------------------------------------------------------------- |
| `401`  | Missing header, malformed `Bearer` value, or invalid/revoked key |
| `500`  | Server error                                                     |

Error body: `{ "error": "..." }`

---

## Base URL

Use your deployment’s backend origin, for example:

- Local dev: `http://localhost:5000`
- Production: your public API host (same origin that serves `/api/*`)

---

## Query parameters

| Parameter  | Required | Description                                                                                        |
| ---------- | -------- | -------------------------------------------------------------------------------------------------- |
| `seasonId` | No       | Raid season id (e.g. `midnight-s1`). If omitted, uses the team’s **current season** from Settings. |

---

## Endpoints

### GET `/api/external/v1/seasons`

Returns the team’s **current season** (from Settings → Raid season) and the full list of **available seasons** from `seasons.json`.

No query parameters.

#### Example request

```bash
curl -s \
  -H "Authorization: Bearer nhf_your_key_here" \
  "https://your-host/api/external/v1/seasons"
```

#### Example response

```json
{
  "teamId": "uuid",
  "currentSeasonId": "midnight-s1",
  "currentSeason": {
    "id": "midnight-s1",
    "name": "Season 1",
    "shortLabel": "S1",
    "expansion": "Midnight",
    "expansionLogo": "/images/wow-midnight-12.png",
    "journalPath": "/journal/midnight-s1.json"
  },
  "defaultSeasonId": "midnight-s1",
  "seasons": [
    {
      "id": "midnight-s1",
      "name": "Season 1",
      "shortLabel": "S1",
      "expansion": "Midnight",
      "expansionLogo": "/images/wow-midnight-12.png",
      "journalPath": "/journal/midnight-s1.json"
    },
    {
      "id": "midnight-s2",
      "name": "Season 2",
      "shortLabel": "S2",
      "expansion": "Midnight",
      "expansionLogo": "/images/wow-midnight-12.png",
      "journalPath": "/journal/midnight-s2.json"
    }
  ]
}
```

#### Notes

- **`currentSeasonId`** is the season the team has selected in Settings. If unset or invalid, falls back to `defaultSeasonId`.
- **`currentSeason`** is the matching entry from `seasons`, for convenience.
- Use `currentSeasonId` as the `seasonId` query param on `/rosters` and `/assignment-notes` when you want the team’s active season.

---

### GET `/api/external/v1/rosters`

Returns the boss roster for the team/season, with **one object per boss**. Each boss includes raid slots/bench and **group setup** from the primary (lowest-order, non-hidden) assignment page for that boss, when configured.

#### Example request

```bash
curl -s \
  -H "Authorization: Bearer nhf_your_key_here" \
  "https://your-host/api/external/v1/rosters?seasonId=midnight-s1"
```

#### Example response

```json
{
  "teamId": "uuid",
  "seasonId": "midnight-s1",
  "roster": {
    "id": "uuid",
    "name": "Raid Date 1/12/25",
    "displayName": "Raid Date 1/12/25",
    "raidDate": "2025-01-12",
    "updatedAt": "2025-06-17T12:00:00.000Z"
  },
  "bosses": [
    {
      "bossId": "boss-uuid",
      "bossName": "Fyrakk",
      "journalEncounterId": 12345,
      "imageUrl": "https://your-host/images/chimaerus.png",
      "slots": [
        {
          "playerId": "...",
          "characterId": "...",
          "playerName": "CharName",
          "className": "Mage",
          "spec": "Fire"
        }
      ],
      "bench": [],
      "piAssignments": [],
      "groupSetup": {
        "groupCount": 4,
        "groups": [
          [
            {
              "playerName": "CharName",
              "className": "Mage",
              "spec": "Fire"
            },
            {}
          ]
        ],
        "raidLeader": {
          "playerName": "RaidLeadChar",
          "className": "Warrior",
          "spec": "Protection"
        },
        "raidAssistants": [
          {
            "playerName": "AssistChar",
            "linkedTo": {
              "componentId": "comp-uuid",
              "componentTitle": "Groups",
              "row": 0,
              "col": 2
            }
          }
        ]
      },
      "reminders": [
        {
          "forEveryone": false,
          "players": [
            {
              "playerName": "CharName",
              "className": "Mage",
              "spec": "Fire"
            }
          ],
          "mainText": "Soak left",
          "subText": "Group 1",
          "iconFileId": 4638520
        },
        {
          "forEveryone": true,
          "players": [],
          "mainText": "Stack for mechanic",
          "iconFileId": 136243
        },
        {
          "forEveryone": false,
          "roles": ["tank", "healer"],
          "players": [],
          "mainText": "Use defensives",
          "subText": "Phase 2"
        }
      ],
      "assignmentId": "assignment-uuid"
    }
  ]
}
```

#### Notes

- If no roster exists for the season, `roster` is `null` and `bosses` is `[]`.
- **`imageUrl`** is a full absolute URL to the boss portrait (`/images/…` on the app host), resolved from the linked journal boss (via `dungeonEncounterId` / encounter map). Empty string when no image is available. Custom roster `imageUrl` values are returned as absolute URLs when set.
- **`groupSetup`** is included when the linked assignment has group setup data (including partial setups). Empty slots are `{}`. Linked slots include `linkedTo` instead of (or in addition to) resolved player fields.
- **`reminders`** is included when the primary linked assignment has reminder data. Each reminder has **`mainText`**, optional **`subText`**, and optional **`iconFileId`** (WoW icon file data ID from the journal). Audience targeting:
  - **`forEveryone: true`** — reminder applies to everyone; **`players`** is `[]`.
  - **`roles`** — optional array of `"tank"`, `"healer"`, and/or `"dps"` when targeting by role; **`players`** is `[]`.
  - Otherwise — **`forEveryone: false`** with resolved **`players`** (character names only — no component or link IDs), each with optional **`className`** and **`spec`**.
- **`playerName`** on slots, bench, group setup, and PI assignments is always the **character name** (or `customText` when manually entered). Account/player names are not exposed in this field.
- **`groupCount`** is `4` for Mythic assignments, `6` otherwise (matches in-app group setup).
- Secret boss filtering from the raider UI does **not** apply — API keys are officer-managed and receive full roster data.

---

### GET `/api/external/v1/assignment-notes`

Returns **generated addon notes** (same format as **Get note** in the app), grouped **by boss**. Each boss can have multiple assignment pages.

#### Example request

```bash
curl -s \
  -H "Authorization: Bearer nhf_your_key_here" \
  "https://your-host/api/external/v1/assignment-notes?seasonId=midnight-s1"
```

#### Example response

```json
{
  "teamId": "uuid",
  "seasonId": "midnight-s1",
  "bosses": [
    {
      "bossId": "boss-uuid",
      "bossName": "Fyrakk",
      "journalEncounterId": 12345,
      "assignments": [
        {
          "assignmentId": "assignment-uuid",
          "assignmentName": "Fyrakk Assignments",
          "encounterId": 67890,
          "difficulty": "Mythic",
          "note": "EncounterID:67890;Name:Fyrakk Assignments;Difficulty:Mythic;\ntime:10;ph:1;tag:PlayerName;text:Soak;spellid:123456;"
        }
      ]
    }
  ]
}
```

#### Notes

- Only **non-hidden** assignment pages are included.
- **`encounterId`** is resolved from the roster boss’s journal link when possible, otherwise falls back to the stored assignment encounter id.
- **`note`** is the full NSRT/WA string. Empty assignments produce an empty `note` string but are still listed.
- Bosses are sorted alphabetically by `bossName`.
- CD assignment linked notes are **not** merged here (assignment page notes only). Use the in-app note modal if you need the combined output.

For NSRT line syntax, see [NSRT Note Explanation](../docs/NSRT_Note_Explanation.md).

---

## Managing keys (officers, in-app)

| Action     | Method   | Path                                                    |
| ---------- | -------- | ------------------------------------------------------- |
| List keys  | `GET`    | `/api/team-settings/api-keys` (session auth)            |
| Create key | `POST`   | `/api/team-settings/api-keys` body: `{ "name": "..." }` |
| Revoke key | `DELETE` | `/api/team-settings/api-keys/:id`                       |

List responses include `id`, `name`, `prefix` (first part of the token for identification), `createdAt`, and `lastUsedAt`. The full token is returned only on create.

---

## Typical integration flow

1. **Seasons** — Call `/seasons` to get `currentSeasonId` and valid `seasonId` values.
2. **Rosters** — Poll `/rosters` to get per-boss slot lists and raid groups for dashboards or TS/discord bots.
3. **Notes** — Poll `/assignment-notes` before raid night; pick the `note` for each boss (or each `assignments[]` entry if multiple pages exist) and push to your addon/import pipeline.
4. Use `seasonId` when testing a non-default season; omit it on roster/notes calls to follow the team’s current season (or pass `currentSeasonId` from `/seasons`).

---

## Security checklist

- Treat API keys like passwords; do not commit them to git or expose them in client-side code.
- Revoke unused keys in Settings.
- Keys grant read access to roster and assignment note data for the whole team.
- Prefer server-to-server calls over exposing keys in browser JavaScript.
