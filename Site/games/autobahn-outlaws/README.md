# Autobahn Outlaws

An open-world crime action game set across **all of Germany**, playable in any modern desktop browser.
Steal cars, race down the Autobahn with no speed limit, fly helicopters over the Alps, take boats
through Hamburg harbour and try to survive a five-star police pursuit from Kiel to the Zugspitze.

Everything — the map, buildings, vehicles, people, sound effects and the three radio stations — is
generated procedurally at load time. There are no external asset files, so the game is small
(about 1 MB including three.js) and works offline once loaded.

## Features

- **Germany as the map**: a scaled-down but recognisable Germany with the real border outline, North Sea and
  Baltic coasts, the Rhine, Elbe, Danube, Main, Weser, Mosel, Neckar, Spree and Isar, lakes like the Müritz and
  Chiemsee, the Harz, Black Forest, Bavarian Forest and the Alps with the Zugspitze.
- **34 cities and towns** (Berlin, Hamburg, München, Köln, Frankfurt, Stuttgart, Dresden, Leipzig, …) connected by
  **46 Autobahn links** with lane markings, guard rails, bridges, blue direction signs and yellow city-entry signs.
- **Landmarks**: Brandenburger Tor, Fernsehturm, Reichstag, Kölner Dom, Elbphilharmonie and Hamburg's container
  harbour, Frankfurt's skyline, Munich's Frauenkirche and stadium, Dresden's Frauenkirche, the Völkerschlachtdenkmal,
  Nürnberg's Kaiserburg, Schloss Neuschwanstein, the Brocken and the Zugspitze summit cross.
- **Vehicles**: 16 types — hatchbacks, saloons, estates, a sports car, the "Rennpappe 601", taxis, vans, lorries,
  city buses, motorbikes, police cars, SEK vans, ambulances, speedboats and helicopters. Arcade physics with drifting,
  jumps, crash damage, smoke, fire and explosions.
- **Weapons**: fists, pistol, SMG, shotgun, assault rifle, sniper rifle with scope, Panzerfaust rocket launcher and
  grenades, with hit-scan ballistics, headshots, tracers and muzzle flashes. Drive-by shooting from vehicles.
- **Living world**: pedestrians walking city sidewalks and villages who flee, cower or fight back; AI traffic that
  follows lanes, turns at junctions, brakes and honks; day/night cycle with lit windows and street lamps; rain.
- **Police & wanted system**: 1–5 stars, patrol cars, SEK vans and helicopters, cops who try to arrest you at low
  levels and shoot at higher ones, line-of-sight based evasion, BUSTED and WASTED.
- **Story**: 10 missions across Hamburg, Bremen, Hannover, Berlin, Frankfurt, München and Neuschwanstein.
- **Side activities**: taxi fares, four Autobahn races with best times, 30 hidden garden gnomes (Gartenzwerge).
- **Shops & services**: Waffenladen (gun shop), Lackiererei (respray to lose the police), Krankenhaus, Tankstelle
  (Currywurst & repairs), safehouses for saving.
- **Radio**: procedural Berlin techno, Bavarian brass band, classical and synthwave stations.
- Minimap with GPS routing, full-screen map with waypoints, save/load, settings (quality, draw distance,
  sensitivity, audio), gamepad support.

## Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move / drive | W A S D | Left stick, RT/LT |
| Look / aim | Mouse | Right stick |
| Shoot | Left click | RT |
| Aim | Right click (hold) | LT |
| Sprint / heli descend | Shift | L3 (sprint), B (heli descend) |
| Jump / handbrake / heli climb | Space | A |
| Enter, exit, steal vehicle | F | Y |
| Interact, start mission, skip dialogue | E | X |
| Reload | R | B |
| Select weapon | 1–8, mouse wheel (0 = fists) | LB / RB |
| Horn / radio / camera | H / Q / C | L3 / D-pad up / R3 |
| Police siren (police vehicles) | N | D-pad left |
| Taxi job | J | D-pad down |
| Map | M | Back |
| Pause | Esc or P | Start |

## Running locally

The game uses native ES modules, so it has to be served over HTTP (opening `index.html` straight from disk will
not work in most browsers). From this folder run any static web server, for example:

```sh
npx http-server -c-1 .
# or
python3 -m http.server 8000
```

and open the printed address. Inside the Zaluea site it is listed on the Games page.

## Publishing

- **itch.io (HTML5)**: run `npm run package:game` in the repository root. It creates
  `dist/autobahn-outlaws.zip` with `index.html` at the top level. Upload it as an HTML game, tick
  "This file will be played in the browser", set the viewport to 1280×720 and enable the fullscreen button.
- **GitHub Pages / any static host**: upload this folder as-is. No build step and no server-side code are needed.

## Technical notes

- Rendering: [three.js](https://threejs.org) r186 (MIT licence, see `lib/THREE_LICENSE.txt`), bundled locally in
  `lib/three.module.min.js`.
- World generation takes one to three seconds on a desktop PC. Graphics quality defaults to *Medium*; *High* adds
  sun shadows on trees and a higher resolution, *Low* disables shadows and antialiasing for older laptops.
- Saves and settings are stored in the browser's `localStorage`.
- Source layout: `src/geo.js` (Germany data), `terrain.js`, `roads.js`, `city.js`, `landmarks.js`, `nature.js`
  (world), `vehicle.js`, `vehicles.js`, `traffic.js`, `character.js`, `peds.js`, `police.js`, `weapons.js`,
  `player.js` (gameplay), `missions.js`, `hud.js`, `ui.js`, `save.js`, `audio.js`, `sky.js`, `effects.js`, `main.js`.

## Legal

All characters, companies, vehicles and brands in the game are fictional. Real places are used only as
locations. This project is not affiliated with or endorsed by Rockstar Games or any other publisher.
