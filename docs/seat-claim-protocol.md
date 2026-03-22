# v1 seat-claim protocol

Related docs:

- `docs/README.md`
- `docs/identity.md`
- `docs/database-schema.md`
- `docs/session-lifecycle.md`
- `docs/testing.md`

## recommendation

Use one explicit seat-claim contract with 5 browser operations only:

1. list seats for a role link
2. claim or recover a seat onto a new browser
3. reclaim an already-owned seat on the same browser
4. explicitly take over an in-use seat
5. heartbeat the active claim

Keep claim ownership separate from LiveKit transport state.

The seat claim is the app-level source of truth for:

- which browser owns a seat
- which browser may mint or refresh the LiveKit token for that seat
- which browser may call recording and upload endpoints for that seat

A LiveKit room connection alone never proves seat ownership.

Identity meaning, role model, and LiveKit identity mapping live in `docs/identity.md`.
This doc owns the claim state machine, liveness, and wire contract.

## scope

This doc defines the browser ↔ session-server contract for:

- role-link validation
- seat picker state
- initial claim
- same-browser reclaim after refresh/restart
- disconnected-seat recovery on a new browser
- active-seat takeover
- claim liveness and disconnect timeout
- connection replacement and old-session eviction

It does **not** define:

- recording start/stop or clock sync
- chunk upload semantics
- control-plane session provisioning

## seat-claim state model

`seat_claims.state` is the durable app-level claim state for one seat:

- `unclaimed`: no browser currently owns the seat
- `active`: exactly one browser owns the seat
- `disconnected`: the last owning browser is gone or timed out, but the seat remains reserved for reclaim or recovery

`seat_claims.claim_version` is the stale-claim guard:

- increment it on every new claim-secret issuance
- do **not** increment it for heartbeat refreshes or same-secret reconnects
- reject any request that proves an old claim secret after the version moved forward

`seat_claims.current_connection_id` is the best known live-session connection handle for the active owner:

- set it when the browser first heartbeats with a room/app connection id
- update it when the same owner reconnects with a replacement connection
- clear it when the seat moves to `disconnected`

## liveness model

The browser must heartbeat its active claim every **10 seconds** while the session page is open.

The session server must mark an `active` seat as `disconnected` when either is true:

- it has not received a successful claim heartbeat for **30 seconds**, or
- it explicitly observes that the owning browser/session connection closed and no replacement heartbeat arrives within **5 seconds**

Rules:

- short LiveKit transport flaps are **not** a claim loss by themselves
- the claim remains `active` during the heartbeat grace window
- a claim heartbeat updates `last_seen_at`
- moving to `disconnected` clears `current_connection_id`
- `disconnected` does **not** rotate the claim secret by itself

## seat picker states

The seat picker exposes these UI states:

- `available`
- `you`
- `in_use`
- `rejoin_available`

Mapping rules:

- `available` = no claim row yet, or `state = 'unclaimed'`
- `you` = this browser proves the current claim secret for that seat
- `in_use` = `state = 'active'` and this browser does not own it
- `rejoin_available` = `state = 'disconnected'` and this browser does not own it

If the browser already owns a seat for the current role link, the app should skip the picker and reclaim it automatically.

## endpoints

All examples use `/api/v1/...`.

### 1. list seats for a role link

`POST /api/v1/join/seat-picker`

Validates the role link and returns the seat list for that role.

### request body

```json
{
  "session_id": "sess_01hr...",
  "role": "guest",
  "join_key": "raw_join_secret"
}
```

### request rules

- `role` must be `host` or `guest`
- `join_key` must match the stored hash for that `session_id` + `role`
- only seats for that role are returned
- the server may use the claim cookie, if present, to mark one seat as `you`

### success response

```json
{
  "session_id": "sess_01hr...",
  "role": "guest",
  "seats": [
    {
      "participant_seat_id": "seat_01hr_a",
      "display_name": "Guest A",
      "picker_state": "you"
    },
    {
      "participant_seat_id": "seat_01hr_b",
      "display_name": "Guest B",
      "picker_state": "rejoin_available"
    },
    {
      "participant_seat_id": "seat_01hr_c",
      "display_name": "Guest C",
      "picker_state": "available"
    }
  ],
  "owned_seat_id": "seat_01hr_a"
}
```

### response rules

- `owned_seat_id` is null when this browser does not already own a seat for that role link
- the app should auto-reclaim `owned_seat_id` when present
- do not expose claim versions, claim hashes, or raw secrets

### 2. claim or recover a seat

`POST /api/v1/seat-claims/claim`

Claims an `available` seat or recovers a `rejoin_available` seat onto the current browser.

### request body

```json
{
  "session_id": "sess_01hr...",
  "role": "guest",
  "join_key": "raw_join_secret",
  "participant_seat_id": "seat_01hr..."
}
```

### request rules

- the join key must match the requested session + role
- the requested seat must belong to that same session + role
- allowed when the seat is `available`
- allowed when the seat is `rejoin_available`
- reject with `409` when the seat is currently `in_use`

### successful behavior

If the seat is `available` or `rejoin_available`, the server must:

- mint a fresh claim secret
- hash and store it
- increment `claim_version`
- set `state = 'active'`
- set `last_seen_at`
- clear or replace `current_connection_id`
- set the secure claim cookie
- mint and return the LiveKit token for that seat

Recovering a disconnected seat is a new-owner operation. It always rotates the claim secret.

### success response

- `201 Created`

```json
{
  "session_id": "sess_01hr...",
  "participant_seat_id": "seat_01hr...",
  "role": "guest",
  "claim_state": "active",
  "claim_version": 3,
  "livekit": {
    "room": "sess_01hr...",
    "participant_identity": "seat_01hr...",
    "token": "eyJ..."
  }
}
```

### 3. reclaim your existing seat

`POST /api/v1/seat-claims/reclaim`

Reactivates the already-owned seat for the current browser using the claim cookie.

### request body

```json
{
  "session_id": "sess_01hr...",
  "role": "guest",
  "join_key": "raw_join_secret"
}
```

### request rules

- the browser must present a valid claim cookie
- the join key must still match the session + role link the browser opened
- the claim cookie must resolve to a seat in that same session + role
- allowed when the seat claim row is `active` or `disconnected`

### successful behavior

On success, the server must:

- keep the existing claim secret
- keep the existing `claim_version`
- set `state = 'active'`
- update `last_seen_at`
- keep or replace `current_connection_id` on the next heartbeat
- mint and return a fresh LiveKit token for the same seat identity

### success response

- `200 OK`

```json
{
  "session_id": "sess_01hr...",
  "participant_seat_id": "seat_01hr...",
  "role": "guest",
  "claim_state": "active",
  "claim_version": 3,
  "livekit": {
    "room": "sess_01hr...",
    "participant_identity": "seat_01hr...",
    "token": "eyJ..."
  }
}
```

### 4. take over an in-use seat

`POST /api/v1/seat-claims/takeover`

Forces ownership of an `in_use` seat onto a new browser.

### request body

```json
{
  "session_id": "sess_01hr...",
  "role": "guest",
  "join_key": "raw_join_secret",
  "participant_seat_id": "seat_01hr..."
}
```

### request rules

- the join key must match the requested session + role
- the requested seat must currently be `in_use`
- the UI must only call this after explicit user confirmation
- do **not** allow silent automatic takeover

### successful behavior

On success, the server must:

- mint a fresh claim secret
- replace the stored claim hash
- increment `claim_version`
- set `state = 'active'`
- set `last_seen_at`
- clear or replace `current_connection_id`
- set the new secure claim cookie
- mint and return the LiveKit token for that seat
- explicitly evict the previous live-session connection if `current_connection_id` is known
- reject the old browser on its very next claim-authenticated request

### success response

- `200 OK`

Response body matches `claim`.

### takeover rules

- takeover keeps the same `participant_seat_id`
- takeover keeps the same LiveKit participant identity value for the new browser
- takeover invalidates the old browser immediately; there is never a valid two-owner window
- any unfinished pre-takeover track segments from the old browser may later become `abandoned` per `docs/recording-upload-protocol.md`

### 5. claim heartbeat

`POST /api/v1/seat-claims/heartbeat`

Refreshes liveness for the currently claimed seat.

### request body

```json
{
  "current_connection_id": "lk_conn_01hr..."
}
```

### request rules

- the browser must present a valid claim cookie
- `current_connection_id` is optional until the browser actually joins the live room
- once the browser has a live-session connection id, it should include it on every heartbeat

### successful behavior

On success, the server must:

- verify the claim cookie against the current stored claim hash
- set `state = 'active'`
- update `last_seen_at`
- if `current_connection_id` differs from the stored value for the same claim, update it and evict the old live-session connection when possible

### success response

- `200 OK`

```json
{
  "participant_seat_id": "seat_01hr...",
  "claim_state": "active",
  "claim_version": 3,
  "last_seen_at": "2026-03-18T18:02:14.123456Z"
}
```

## transition rules

The full state machine is:

- `unclaimed -> active` on successful `claim`
- `active -> active` on successful `reclaim` or `heartbeat`
- `active -> disconnected` on liveness timeout or observed disconnect without timely replacement
- `disconnected -> active` on successful `reclaim`
- `disconnected -> active` on successful `claim` by a new browser, with secret rotation
- `active -> active` on successful `takeover`, with secret rotation and old-owner eviction

There is no general-purpose user release endpoint in v1.

Reason: releasing a seat during reconnect, drain, or backlog upload is too easy to get wrong. Closing the page naturally moves the seat to `disconnected`, and another browser can recover or take it over explicitly.

## auth and invalidation rules

- recording control endpoints authenticate only with the active claim cookie
- upload endpoints authenticate only with the active claim cookie
- a stale claim cookie must fail with `401`
- a role link without a valid claim cookie must fail with `401` on recording/upload endpoints
- changing the role link alone does **not** preserve seat ownership
- a seat claim is scoped to one `session_id` and one `participant_seat_id`

## error contract

### status codes

- `400 Bad Request` → malformed JSON, bad enum, missing field
- `401 Unauthorized` → invalid join key, missing/invalid claim cookie, or stale rotated claim
- `403 Forbidden` → role link does not grant access to that seat
- `404 Not Found` → session or seat does not exist
- `409 Conflict` → seat already in use, invalid reclaim target, or idempotency mismatch
- `500 Internal Server Error` → unexpected server failure

### error body

```json
{
  "error": {
    "code": "seat_in_use",
    "message": "seat seat_01hr... is already owned by another browser; explicit takeover is required"
  }
}
```

## canonical flows

### first join

1. browser opens a role link
2. browser lists seats for that role link
3. user selects an `available` seat
4. browser calls `claim`
5. server issues claim cookie + LiveKit token
6. browser joins the room
7. browser heartbeats every 10 seconds

### refresh or crash recovery on the same browser

1. browser reloads the same role link with the same claim cookie
2. browser lists seats and sees `owned_seat_id`
3. browser auto-calls `reclaim`
4. server reactivates the same seat without rotating the claim secret
5. browser rejoins the room with the same seat identity

### new-device recovery after disconnect

1. old browser disappears and claim times out to `disconnected`
2. new browser opens the same role link
3. seat picker shows `rejoin_available`
4. user selects that seat
5. browser calls `claim`
6. server rotates the claim secret and reassigns the same seat identity

### explicit takeover of an active seat

1. new browser opens the same role link
2. seat picker shows `in_use`
3. user explicitly confirms takeover
4. browser calls `takeover`
5. server rotates the claim secret, evicts the old connection, and reassigns the same seat identity
6. old browser starts receiving `401` on claim-authenticated requests

## non-goals for v1

- multiple active browsers per seat
- silent automatic takeover
- seat release semantics that bypass disconnect/recovery
- claim auth based on LiveKit presence alone
- background reclaim without the role link still being valid
