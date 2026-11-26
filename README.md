# flight-game-01

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/J4n4n/flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/J4n4n/flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Albatross Run** — a bush-plane flight game in a procedural river valley, built for make.fun's "Make the best flight game" bounty. Take off from the runway in a true behind-the-tail chase view — high wing, tail fin and tundra tires, the whole valley rolling with your bank — thread glowing target rings through five missions (first flight, river run, mountain pass, storm ridge with rain and crosswind, and a final leg that ends by landing on the next strip), dodge balloons and striped radio towers, and mind the fuel — green rings refuel you and landing on any of the four airstrips tops the tank up. The HUD shows a compass tape, score and rings on top, and a lit instrument panel (artificial horizon, altimeter, airspeed with redline, zero-centred vertical speed, throttle lever, damage, fuel gauge with a LOW FUEL warning pill, and a live mini-map with the river, strips, town and next ring). Damage, stalls and hard landings end the sortie; the best score saves in your browser. All art is drawn in code and all sound is synthesized with WebAudio — no files, no network.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Keyboard + mouse/touch: Arrow keys or WASD to pitch and roll, Shift to throttle up, Q to throttle down, drag the on-screen throttle lever or hold the pointer to steer, Space or click to start, P to pause, M to mute.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3tzzsqtz&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
