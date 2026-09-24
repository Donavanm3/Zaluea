// Geography of Germany: projection, border outline, cities, rivers, lakes,
// uplands and the Autobahn network. Real coordinates are projected onto a
// playable scale (about 1:150 horizontally).

export const LAT0 = 51.16;
export const LON0 = 10.45;
export const KZ = 720; // world metres per degree latitude
export const KX = KZ * Math.cos((LAT0 * Math.PI) / 180);
// 1 world metre expressed in real kilometres (for road signs / stats)
export const REAL_KM_PER_M = 111.2 / KZ;

export function ll(lon, lat) {
  return { x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ };
}
export function toLonLat(x, z) {
  return { lon: x / KX + LON0, lat: -z / KZ + LAT0 };
}

// Border outline, clockwise from the Dollart. Third value is the type of the
// edge starting at that vertex: c = sea coast, k = lake shore, l = land border.
const BORDER_LL = [
  // North Sea coast
  [7.2, 53.26, 'c'], [7.2, 53.37, 'c'], [7.03, 53.5, 'c'], [7.15, 53.62, 'c'], [7.35, 53.68, 'c'], [7.58, 53.69, 'c'],
  [7.8, 53.7, 'c'], [8.02, 53.7, 'c'], [8.12, 53.52, 'c'], [8.2, 53.4, 'c'], [8.35, 53.45, 'c'], [8.36, 53.68, 'c'],
  [8.5, 53.6, 'c'], [8.57, 53.53, 'c'], [8.55, 53.78, 'c'], [8.7, 53.87, 'c'], [9.0, 53.82, 'c'], [9.14, 53.9, 'c'],
  [8.95, 54.0, 'c'], [8.86, 54.13, 'c'], [8.85, 54.27, 'c'], [8.6, 54.3, 'c'], [8.62, 54.38, 'c'], [9.03, 54.48, 'c'],
  [8.85, 54.6, 'c'], [8.8, 54.75, 'c'],
  // Denmark
  [8.66, 54.91, 'l'], [9.0, 54.87, 'l'], [9.44, 54.83, 'c'],
  // Baltic coast
  [9.85, 54.76, 'c'], [10.03, 54.68, 'c'], [9.85, 54.47, 'c'], [10.1, 54.48, 'c'], [10.16, 54.4, 'c'], [10.23, 54.43, 'c'],
  [10.7, 54.32, 'c'], [11.0, 54.38, 'c'], [11.1, 54.2, 'c'], [10.82, 54.1, 'c'], [10.87, 53.96, 'c'], [11.2, 54.0, 'c'],
  [11.45, 53.9, 'c'], [11.6, 54.1, 'c'], [11.75, 54.15, 'c'], [12.08, 54.19, 'c'], [12.25, 54.25, 'c'], [12.5, 54.46, 'c'],
  [12.8, 54.44, 'c'], [13.09, 54.33, 'c'], [13.15, 54.5, 'c'], [13.43, 54.68, 'c'], [13.67, 54.52, 'c'], [13.55, 54.3, 'c'],
  [13.4, 54.12, 'c'], [13.77, 54.08, 'c'], [13.95, 54.08, 'c'],
  // Poland (Oder / Neisse)
  [14.22, 53.93, 'l'], [14.27, 53.72, 'l'], [14.41, 53.33, 'l'], [14.28, 53.06, 'l'], [14.14, 52.84, 'l'], [14.63, 52.57, 'l'],
  [14.55, 52.35, 'l'], [14.7, 52.07, 'l'], [14.7, 51.9, 'l'], [14.65, 51.73, 'l'], [14.73, 51.55, 'l'], [14.97, 51.35, 'l'],
  [14.99, 51.15, 'l'],
  // Czech Republic
  [14.83, 50.87, 'l'], [14.6, 50.93, 'l'], [14.28, 50.97, 'l'], [14.15, 50.9, 'l'], [13.85, 50.73, 'l'], [13.5, 50.63, 'l'],
  [13.25, 50.58, 'l'], [12.97, 50.42, 'l'], [12.7, 50.4, 'l'], [12.47, 50.35, 'l'], [12.3, 50.2, 'l'], [12.2, 50.1, 'l'],
  [12.4, 49.93, 'l'], [12.5, 49.8, 'l'], [12.43, 49.7, 'l'], [12.85, 49.33, 'l'], [13.2, 49.12, 'l'], [13.45, 48.98, 'l'],
  // Austria
  [13.84, 48.77, 'l'], [13.72, 48.52, 'l'], [13.46, 48.57, 'l'], [13.43, 48.46, 'l'], [13.04, 48.26, 'l'], [12.83, 48.17, 'l'],
  [12.93, 47.94, 'l'], [12.98, 47.84, 'l'], [13.08, 47.65, 'l'], [13.0, 47.48, 'l'], [12.8, 47.58, 'l'], [12.2, 47.6, 'l'],
  [11.6, 47.58, 'l'], [11.26, 47.43, 'l'], [11.0, 47.39, 'l'], [10.93, 47.42, 'l'], [10.88, 47.47, 'l'], [10.7, 47.55, 'l'], [10.45, 47.55, 'l'],
  [10.23, 47.28, 'l'], [10.1, 47.4, 'l'], [9.95, 47.53, 'l'],
  // Lake Constance (Bodensee) north shore
  [9.7, 47.55, 'k'], [9.48, 47.65, 'k'], [9.27, 47.69, 'k'], [9.16, 47.77, 'k'],
  // Switzerland
  [9.17, 47.66, 'l'], [8.85, 47.7, 'l'], [8.58, 47.8, 'l'], [8.4, 47.68, 'l'], [8.21, 47.62, 'l'], [7.95, 47.55, 'l'],
  // France
  [7.59, 47.59, 'l'], [7.53, 47.8, 'l'], [7.58, 48.03, 'l'], [7.68, 48.3, 'l'], [7.8, 48.57, 'l'], [7.95, 48.72, 'l'],
  [8.23, 48.97, 'l'], [7.95, 49.05, 'l'], [7.64, 49.06, 'l'], [7.4, 49.17, 'l'], [7.0, 49.12, 'l'], [6.73, 49.17, 'l'],
  [6.55, 49.43, 'l'],
  // Luxembourg / Belgium / Netherlands
  [6.37, 49.47, 'l'], [6.5, 49.72, 'l'], [6.44, 49.81, 'l'], [6.22, 49.91, 'l'], [6.13, 50.13, 'l'], [6.4, 50.33, 'l'],
  [6.26, 50.5, 'l'], [6.16, 50.63, 'l'], [6.02, 50.75, 'l'], [6.08, 50.9, 'l'], [5.87, 51.05, 'l'], [6.17, 51.18, 'l'],
  [6.2, 51.37, 'l'], [6.1, 51.6, 'l'], [5.95, 51.8, 'l'], [6.2, 51.85, 'l'], [6.8, 51.97, 'l'], [7.05, 52.23, 'l'],
  [6.7, 52.42, 'l'], [6.7, 52.53, 'l'], [7.05, 52.65, 'l'], [7.2, 53.0, 'l'],
];

export const BORDER = BORDER_LL.map(([lon, lat, t]) => ({ ...ll(lon, lat), t }));

export function insideGermany(x, z) {
  let inside = false;
  const n = BORDER.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = BORDER[i], b = BORDER[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Returns {d (unsigned distance), t (edge type), inside, nx, nz (closest point)}
const _bd = { d: 0, t: 'l', inside: true, x: 0, z: 0 };
export function borderInfo(x, z) {
  let best = Infinity, bt = 'l', bx = 0, bz = 0;
  const n = BORDER.length;
  for (let i = 0; i < n; i++) {
    const a = BORDER[i], b = BORDER[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + dx * t, cz = a.z + dz * t;
    const d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (d < best) { best = d; bt = a.t; bx = cx; bz = cz; }
  }
  _bd.d = Math.sqrt(best); _bd.t = bt; _bd.inside = insideGermany(x, z); _bd.x = bx; _bd.z = bz;
  return _bd;
}

// ---------------- Cities ----------------
// r = radius of the street grid in world metres.
const CITY_LL = [
  { id: 'berlin', name: 'Berlin', lon: 13.405, lat: 52.52, r: 290, state: 'Berlin', tall: 1.3 },
  { id: 'hamburg', name: 'Hamburg', lon: 9.99, lat: 53.55, r: 240, state: 'Freie und Hansestadt Hamburg', tall: 1.1 },
  { id: 'muenchen', name: 'München', lon: 11.575, lat: 48.137, r: 240, state: 'Bayern', tall: 1.0 },
  { id: 'koeln', name: 'Köln', lon: 6.96, lat: 50.94, r: 200, state: 'Nordrhein-Westfalen', tall: 1.0 },
  { id: 'frankfurt', name: 'Frankfurt am Main', lon: 8.68, lat: 50.11, r: 190, state: 'Hessen', tall: 2.6 },
  { id: 'stuttgart', name: 'Stuttgart', lon: 9.18, lat: 48.78, r: 160, state: 'Baden-Württemberg', tall: 1.0 },
  { id: 'dortmund', name: 'Dortmund', lon: 7.47, lat: 51.51, r: 160, state: 'Nordrhein-Westfalen', tall: 1.0 },
  { id: 'leipzig', name: 'Leipzig', lon: 12.37, lat: 51.34, r: 160, state: 'Sachsen', tall: 0.9 },
  { id: 'dresden', name: 'Dresden', lon: 13.74, lat: 51.05, r: 150, state: 'Sachsen', tall: 0.8 },
  { id: 'hannover', name: 'Hannover', lon: 9.73, lat: 52.37, r: 160, state: 'Niedersachsen', tall: 1.0 },
  { id: 'nuernberg', name: 'Nürnberg', lon: 11.08, lat: 49.45, r: 150, state: 'Bayern', tall: 0.8 },
  { id: 'bremen', name: 'Bremen', lon: 8.8, lat: 53.08, r: 140, state: 'Freie Hansestadt Bremen', tall: 0.9 },
  { id: 'kiel', name: 'Kiel', lon: 10.12, lat: 54.265, r: 80, state: 'Schleswig-Holstein', tall: 0.8 },
  { id: 'rostock', name: 'Rostock', lon: 12.12, lat: 54.07, r: 70, state: 'Mecklenburg-Vorpommern', tall: 0.8 },
  { id: 'freiburg', name: 'Freiburg', lon: 7.85, lat: 47.99, r: 100, state: 'Baden-Württemberg', tall: 0.7 },
  { id: 'kassel', name: 'Kassel', lon: 9.48, lat: 51.31, r: 90, state: 'Hessen', tall: 0.8 },
  { id: 'wuerzburg', name: 'Würzburg', lon: 9.93, lat: 49.79, r: 80, state: 'Bayern', tall: 0.6 },
  { id: 'magdeburg', name: 'Magdeburg', lon: 11.63, lat: 52.13, r: 95, state: 'Sachsen-Anhalt', tall: 0.8 },
  { id: 'garmisch', name: 'Garmisch-Partenkirchen', lon: 11.2, lat: 47.62, r: 60, state: 'Bayern', tall: 0.5 },
  { id: 'fuessen', name: 'Füssen', lon: 10.62, lat: 47.7, r: 50, state: 'Bayern', tall: 0.5 },
  { id: 'luebeck', name: 'Lübeck', lon: 10.69, lat: 53.87, r: 75, state: 'Schleswig-Holstein', tall: 0.7 },
  { id: 'ulm', name: 'Ulm', lon: 9.99, lat: 48.4, r: 75, state: 'Baden-Württemberg', tall: 0.7 },
  { id: 'mannheim', name: 'Mannheim', lon: 8.47, lat: 49.49, r: 95, state: 'Baden-Württemberg', tall: 0.9 },
  { id: 'bielefeld', name: 'Bielefeld', lon: 8.53, lat: 52.02, r: 75, state: 'Nordrhein-Westfalen', tall: 0.7 },
  { id: 'osnabrueck', name: 'Osnabrück', lon: 8.05, lat: 52.28, r: 65, state: 'Niedersachsen', tall: 0.6 },
  { id: 'ingolstadt', name: 'Ingolstadt', lon: 11.42, lat: 48.765, r: 65, state: 'Bayern', tall: 0.6 },
  { id: 'augsburg', name: 'Augsburg', lon: 10.9, lat: 48.37, r: 80, state: 'Bayern', tall: 0.7 },
  { id: 'hof', name: 'Hof', lon: 11.92, lat: 50.32, r: 55, state: 'Bayern', tall: 0.5 },
  { id: 'karlsruhe', name: 'Karlsruhe', lon: 8.4, lat: 49.01, r: 85, state: 'Baden-Württemberg', tall: 0.7 },
  { id: 'erfurt', name: 'Erfurt', lon: 11.03, lat: 50.98, r: 80, state: 'Thüringen', tall: 0.6 },
  { id: 'saarbruecken', name: 'Saarbrücken', lon: 6.99, lat: 49.24, r: 75, state: 'Saarland', tall: 0.7 },
  { id: 'koblenz', name: 'Koblenz', lon: 7.6, lat: 50.36, r: 70, state: 'Rheinland-Pfalz', tall: 0.6 },
  { id: 'schwerin', name: 'Schwerin', lon: 11.41, lat: 53.63, r: 60, state: 'Mecklenburg-Vorpommern', tall: 0.5 },
  { id: 'cottbus', name: 'Cottbus', lon: 14.33, lat: 51.76, r: 65, state: 'Brandenburg', tall: 0.6 },
];

export const CITIES = CITY_LL.map((c) => ({ ...c, ...ll(c.lon, c.lat) }));
export const CITY_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c]));

// ---------------- Rivers ----------------
const RIVER_LL = [
  { name: 'Rhein', w: 15, pts: [[7.6, 47.6], [7.56, 48.0], [7.8, 48.6], [8.2, 48.97], [8.45, 49.4], [8.4, 49.8], [8.27, 50.0], [7.95, 50.0], [7.75, 50.12], [7.6, 50.36], [7.35, 50.55], [7.1, 50.73], [6.97, 50.94], [6.8, 51.1], [6.77, 51.23], [6.75, 51.43], [6.6, 51.65], [6.2, 51.85]] },
  { name: 'Elbe', w: 13, pts: [[14.25, 50.88], [14.0, 50.97], [13.74, 51.05], [13.47, 51.16], [13.0, 51.56], [12.65, 51.86], [12.25, 51.87], [11.64, 52.13], [11.9, 52.5], [11.97, 52.64], [11.75, 53.0], [11.0, 53.25], [10.55, 53.37], [9.99, 53.53], [9.5, 53.65], [9.14, 53.88], [8.9, 53.95]] },
  { name: 'Donau', w: 11, pts: [[8.5, 47.95], [9.0, 48.1], [9.55, 48.25], [9.99, 48.4], [10.5, 48.6], [11.0, 48.72], [11.42, 48.76], [11.85, 48.9], [12.1, 49.02], [12.6, 48.85], [13.0, 48.7], [13.46, 48.57], [13.75, 48.52]] },
  { name: 'Main', w: 8, pts: [[11.6, 50.1], [10.9, 49.9], [10.23, 50.05], [9.93, 49.79], [9.6, 49.8], [9.2, 49.97], [8.9, 50.08], [8.68, 50.11], [8.27, 50.0]] },
  { name: 'Weser', w: 9, pts: [[9.65, 51.42], [9.4, 51.8], [9.36, 52.1], [8.92, 52.29], [9.1, 52.8], [8.8, 53.08], [8.6, 53.3], [8.57, 53.55]] },
  { name: 'Mosel', w: 7, pts: [[6.37, 49.47], [6.64, 49.75], [7.1, 49.95], [7.3, 50.15], [7.6, 50.36]] },
  { name: 'Neckar', w: 6, pts: [[8.7, 48.4], [9.2, 48.78], [9.22, 49.14], [8.9, 49.4], [8.47, 49.49]] },
  { name: 'Spree', w: 6, pts: [[14.35, 51.6], [14.0, 51.9], [13.7, 52.3], [13.405, 52.52], [13.2, 52.53]] },
  { name: 'Isar', w: 6, pts: [[11.56, 47.76], [11.575, 48.137], [11.8, 48.4], [12.4, 48.7], [12.9, 48.8]] },
];
export const RIVERS = RIVER_LL.map((r) => ({ name: r.name, w: r.w, pts: r.pts.map(([lon, lat]) => ll(lon, lat)) }));

// ---------------- Lakes ----------------
const LAKE_LL = [
  { name: 'Müritz', lon: 12.7, lat: 53.43, rx: 70, rz: 90 },
  { name: 'Chiemsee', lon: 12.43, lat: 47.87, rx: 55, rz: 45 },
  { name: 'Starnberger See', lon: 11.32, lat: 47.9, rx: 22, rz: 70 },
  { name: 'Ammersee', lon: 11.12, lat: 48.0, rx: 20, rz: 55 },
  { name: 'Steinhuder Meer', lon: 9.33, lat: 52.47, rx: 35, rz: 28 },
  { name: 'Plöner See', lon: 10.42, lat: 54.15, rx: 40, rz: 30 },
  { name: 'Schweriner See', lon: 11.45, lat: 53.72, rx: 25, rz: 60 },
  { name: 'Hamburger Hafen', lon: 9.99, lat: 53.526, rx: 210, rz: 20, city: true },
  { name: 'Außenalster', lon: 10.008, lat: 53.568, rx: 22, rz: 38, city: true },
];
export const LAKES = LAKE_LL.map((l) => ({ ...l, ...ll(l.lon, l.lat) }));

// ---------------- Uplands ----------------
// sx/sz = radii, h = peak height, rot = rotation of the ellipse
const HILLS_LL = [
  { name: 'Harz', lon: 10.6, lat: 51.75, sx: 90, sz: 60, h: 85, rot: 0.3 },
  { name: 'Thüringer Wald', lon: 10.75, lat: 50.65, sx: 150, sz: 55, h: 65, rot: -0.5 },
  { name: 'Schwarzwald', lon: 8.15, lat: 48.25, sx: 75, sz: 190, h: 95, rot: 0.05 },
  { name: 'Bayerischer Wald', lon: 13.2, lat: 49.0, sx: 160, sz: 70, h: 85, rot: -0.55 },
  { name: 'Erzgebirge', lon: 13.0, lat: 50.55, sx: 160, sz: 50, h: 70, rot: -0.2 },
  { name: 'Eifel', lon: 6.7, lat: 50.3, sx: 110, sz: 100, h: 50, rot: 0 },
  { name: 'Sauerland', lon: 8.2, lat: 51.2, sx: 120, sz: 80, h: 60, rot: 0 },
  { name: 'Schwäbische Alb', lon: 9.4, lat: 48.45, sx: 190, sz: 55, h: 55, rot: -0.45 },
  { name: 'Rhön', lon: 10.0, lat: 50.45, sx: 60, sz: 60, h: 50, rot: 0 },
  { name: 'Taunus', lon: 8.3, lat: 50.27, sx: 80, sz: 40, h: 40, rot: -0.3 },
  { name: 'Hunsrück', lon: 7.2, lat: 49.85, sx: 110, sz: 45, h: 45, rot: -0.35 },
  { name: 'Odenwald', lon: 8.9, lat: 49.65, sx: 60, sz: 70, h: 40, rot: 0 },
  { name: 'Fichtelgebirge', lon: 11.9, lat: 50.02, sx: 60, sz: 50, h: 55, rot: 0 },
  { name: 'Teutoburger Wald', lon: 8.5, lat: 52.0, sx: 110, sz: 22, h: 30, rot: -0.55 },
  { name: 'Spessart', lon: 9.4, lat: 50.0, sx: 60, sz: 55, h: 40, rot: 0 },
];
export const HILLS = HILLS_LL.map((h) => ({ ...h, ...ll(h.lon, h.lat) }));

// Alps: along the southern border between these longitudes.
export const ALPS = { lonA: 9.75, lonB: 13.15, latTop: 47.7, latFull: 47.42, h: 300 };
export const ZUGSPITZE = { ...ll(11.0, 47.43), h: 170, r: 70 };

// ---------------- Autobahn network ----------------
// Each link connects two cities, optionally through waypoints (lon, lat).
const LINKS = [
  ['A7', 'kiel', 'hamburg', [[10.0, 54.0]]],
  ['A1', 'luebeck', 'hamburg', [[10.4, 53.72]]],
  ['A20', 'luebeck', 'rostock', [[11.45, 53.84], [11.8, 53.98]]],
  ['A24', 'hamburg', 'schwerin', [[10.7, 53.52]]],
  ['A24', 'schwerin', 'berlin', [[12.2, 53.25], [12.9, 52.8]]],
  ['A19', 'rostock', 'berlin', [[12.3, 53.6], [12.75, 53.05]]],
  ['A1', 'hamburg', 'bremen', [[9.4, 53.3]]],
  ['A7', 'hamburg', 'hannover', [[9.85, 53.0]]],
  ['A1', 'bremen', 'osnabrueck', [[8.4, 52.7]]],
  ['A33', 'osnabrueck', 'bielefeld', []],
  ['A1', 'osnabrueck', 'dortmund', [[7.65, 51.95]]],
  ['A2', 'hannover', 'bielefeld', [[9.1, 52.2]]],
  ['A2', 'bielefeld', 'dortmund', [[8.0, 51.72]]],
  ['A2', 'hannover', 'magdeburg', [[10.5, 52.27]]],
  ['A2', 'magdeburg', 'berlin', [[12.55, 52.4]]],
  ['A7', 'hannover', 'kassel', [[9.9, 51.85], [9.75, 51.5]]],
  ['A5', 'kassel', 'frankfurt', [[9.2, 50.95], [8.7, 50.55]]],
  ['A44', 'dortmund', 'kassel', [[8.4, 51.45]]],
  ['A1', 'dortmund', 'koeln', [[7.25, 51.25]]],
  ['A3', 'koeln', 'koblenz', [[7.3, 50.6]]],
  ['A3', 'koblenz', 'frankfurt', [[8.1, 50.38]]],
  ['A5', 'frankfurt', 'mannheim', [[8.62, 49.85]]],
  ['A5', 'mannheim', 'karlsruhe', [[8.55, 49.25]]],
  ['A5', 'karlsruhe', 'freiburg', [[7.95, 48.5]]],
  ['A8', 'karlsruhe', 'stuttgart', [[8.7, 48.9]]],
  ['A6', 'mannheim', 'saarbruecken', [[7.77, 49.42]]],
  ['A8', 'stuttgart', 'ulm', [[9.6, 48.62]]],
  ['A8', 'ulm', 'augsburg', [[10.45, 48.42]]],
  ['A8', 'augsburg', 'muenchen', [[11.2, 48.26]]],
  ['A3', 'frankfurt', 'wuerzburg', [[9.3, 49.95]]],
  ['A3', 'wuerzburg', 'nuernberg', [[10.5, 49.62]]],
  ['A9', 'nuernberg', 'ingolstadt', [[11.3, 49.1]]],
  ['A9', 'ingolstadt', 'muenchen', [[11.55, 48.45]]],
  ['A9', 'nuernberg', 'hof', [[11.58, 49.94]]],
  ['A9', 'hof', 'leipzig', [[12.05, 50.8]]],
  ['A9', 'leipzig', 'berlin', [[12.3, 51.85], [12.9, 52.15]]],
  ['A14', 'leipzig', 'dresden', [[13.0, 51.2]]],
  ['A14', 'leipzig', 'magdeburg', [[11.8, 51.62]]],
  ['A38', 'leipzig', 'erfurt', [[11.6, 51.12]]],
  ['A4', 'erfurt', 'kassel', [[10.2, 51.08]]],
  ['A73', 'erfurt', 'nuernberg', [[10.8, 50.35]]],
  ['A13', 'dresden', 'cottbus', [[14.0, 51.45]]],
  ['A15', 'cottbus', 'berlin', [[13.9, 52.0]]],
  ['A95', 'muenchen', 'garmisch', [[11.3, 47.85]]],
  ['B17', 'garmisch', 'fuessen', [[11.0, 47.7]]],
  ['A7', 'fuessen', 'ulm', [[10.3, 47.75], [10.15, 48.1]]],
];

export const AUTOBAHN_LINKS = LINKS.map(([name, a, b, via]) => ({
  name,
  a, b,
  via: via.map(([lon, lat]) => ll(lon, lat)),
  narrow: name.startsWith('B'),
}));

// Notable countryside points of interest.
export const POIS = {
  neuschwanstein: ll(10.78, 47.58),
  zugspitze: ll(11.0, 47.43),
  loreley: ll(7.73, 50.14),
  brocken: ll(10.62, 51.8),
  sylt: ll(8.3, 54.9),
  ruegen: ll(13.43, 54.55),
  kyffhaeuser: ll(11.1, 51.41),
};
