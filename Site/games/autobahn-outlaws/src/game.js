// Shared game context. Filled in by main.js at boot so every system can reach
// the others without circular import problems.
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  world: null,
  physics: null,
  input: null,
  audio: null,
  player: null,
  vehicles: null,
  peds: null,
  police: null,
  weapons: null,
  fx: null,
  hud: null,
  missions: null,
  ui: null,
  sky: null,
  settings: null,
  state: 'boot', // boot | menu | play | pause | dead | cutscene
  time: 0, // real seconds of gameplay
  dt: 0,
  clock: 8.5, // in-game hour 0..24
  money: 0,
  stats: { kills: 0, copsKilled: 0, carsStolen: 0, distance: 0, missions: 0, gnomes: 0, wantedMax: 0, deaths: 0, arrests: 0, topSpeed: 0 },
  flags: {},
};

export const SAVE_KEY = 'autobahn-outlaws-save-v1';
export const SETTINGS_KEY = 'autobahn-outlaws-settings-v1';
