# Scotland Yard IRL — Vienna Edition

A real-world "Scotland Yard" hunt. One player is **Mister X** and runs; everyone else
hunts them on foot using riddles, landmarks and power-ups.

React + Vite PWA-ish frontend, Firebase Realtime Database + Storage.

## Run

```bash
npm install
cp .env.example .env      # fill in the Firebase web config
npm run dev               # http://localhost:5173
npm run build             # production build into dist/
npx firebase deploy       # hosting + database rules
```

Routes:

| Route | Who |
|---|---|
| `/` | join screen (hunters + Mister X code) |
| `/team/:gameCode?name=&bigTeam=&subteam=` | hunter phone |
| `/fugitive/:gameCode` | Mister X phone |
| `/admin` | Game Master (`sessionStorage` password gate) |

## How the game model works

- **Big team** = a side ("Red", "Blue"). **Player** = one device (`Red 1`, `Red 2` …).
- Each **player** has their own riddle set (`riddleSets/<player name>`) — progress is never
  shared between devices.
- Each **big team** has one shared search circle at `games/<code>/zones/<bigTeam>`
  (`{ lat, lng, radius }`). Every player of that side sees the exact same circle.
  A solved challenge shrinks it by `challenge reduction ÷ number of players on that side`,
  so a team of N must solve ~N challenges to keep pace with a solo player.
  Floor 30 m, start 2000 m (poem), zone freeze and double-zone power-ups respected.
- Photos (challenge selfies + Mister X's demanded selfie) go to Firebase Storage under
  `photos/<code>/<player>/…`. **If Storage is unavailable** (quota / billing / rules) the
  image is compressed harder and stored in the Realtime Database under
  `photos/<code>/<key>` instead, and the submission keeps a `photoRef` next to `photoUrl`.
  Everything renders through `<PhotoImage>` / `resolvePhoto()`.

## Player-facing behaviour

- **GPS stays on.** The choice is stored on the device and tracking resumes by itself
  after a reload; the browser permission is never asked twice for nothing. A denied
  permission clears the preference again.
- **Item bag.** Landmark rewards and power-up alarms no longer fire instantly — they
  land in `games/<code>/teamItems/<bigTeam>` and the team spends them from the
  "🎒 item bag" card (`live_feed`, `direction_beacon`, `zone_freeze`, `selfie_demand`,
  `double_zone`, `sabotage` with a target picker).
- **Compass beacon.** The arrow is rotated by `bearing − compass heading`, so it points
  where the phone is facing, and it re-computes as the player walks and as Mister X's
  GPS updates. Uses the page's single location subscription; iOS asks once for motion
  access, without it the arrow falls back to north-up.
- **Chat never yanks the page.** Only the message list scrolls, only when the reader is
  already at the bottom; otherwise a "↓ new messages" chip appears. Sending always jumps
  to the end.
- **Photos.** Download goes through the Web Share sheet on phones (iOS drops
  `a.download` after an await) and an anchor on desktop; HEIC is converted and scaled.

## Feature flags

- `STARS_ENABLED` in [`src/data/stars.js`](src/data/stars.js) — the star-hunt mechanic is
  parked (`false`). No star UI, no listeners, no GPS claiming while it is off.

## Tests

Real Firebase, real UI, simulated GPS (Playwright drives four "phones" with mocked
geolocation). Start the dev server first, then:

```bash
npm run test:rules    # database security rules (valid writes pass, garbage denied)
npm run test:zones    # shared zone engine: radius ÷ team size, freeze, recentre, fallbacks
npm run test:e2e      # 4 simulated phones: map, undercover, stars off, photo flow, selfie,
                      # GPS persistence, item bag, compass beacon, chat scrolling, downloads
npm run test:game     # all of the above
```

`test-beacon-probe.mjs` is a focused reproduction for the compass card.

`node test-storage-probe.mjs` explains why a Storage upload is refused (e.g. `402` when the
project's billing account is closed).

## Privacy model (important)

Every device signs in **anonymously** on boot ([`config.js`](src/firebase/config.js:37)), and
every rule requires it. On top of that, access is scoped by the game code.

| Path | Who can reach it |
|---|---|
| whole database | only signed-in devices, and only the paths below |
| `games/<code>` | a signed-in device that knows the 6-character code |
| `games` (the list) | **denied**; the GM dashboard keeps its game list in `localStorage` and can open any code manually — there is no public index to enumerate live games |
| `photos/<code>/<key>` | signed-in device + code + random object key; listing a game's photos is denied |
| `fugitiveCodes/<code>` | single lookup by code (write-once, cannot be listed or overwritten) |
| Storage `photos/<code>/<player>/…` | signed-in device only, < 6 MB per object; everything else in the bucket is denied |

**Photos are encrypted end-to-end at rest.** Files are AES-GCM encrypted on the device with a
key derived from the game code before they ever leave the phone (`photoStore.js`), whether
they go to Storage or into the database. A Storage object, a download URL with its token, or
a database export therefore contains ciphertext only:

```
Storage:  photos/ABC123/Red 1/3_1699….jpg.enc   ← IV ‖ ciphertext, no image header
Database: photos/ABC123/1699…_a1b2c3 = { cipher: "…", iv: "…", createdAt: … }
```

Rendering, GM review, the zip download and the Wrapped screen all decrypt transparently
through `<PhotoImage>` / `resolvePhoto()`.

Anonymous accounts are pruned by Firebase after 30 days of inactivity — harmless here, since
no game data is owned by a uid (everything is addressed by game code).

Other constraints:

- Photo slides in the end-of-game Wrapped screen load on demand; a slow connection shows
  the slide without a photo for a moment.
- `test-auth-probe.mjs`, `test-init-auth.mjs`, `test-auth-browser-probe.mjs` and
  `test-storage-probe.mjs` diagnose the Firebase services (auth, storage, rules).
