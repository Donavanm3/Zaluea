// Day/night cycle: sky dome with clouds, sun/moon lighting, soft shadows, fog,
// an environment map for reflections, stars and weather.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';

// elevation, zenith, horizon, fog, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, env intensity
const KEYS = [
  [-0.35, 0x03060f, 0x0c1328, 0x0f1526, 0x8ea4dc, 0.0, 0x5a70b0, 0x1c2030, 1.35, 1.2],
  [-0.08, 0x0a1128, 0x2a2742, 0x27273a, 0x8f9fd6, 0.0, 0x5e6aa0, 0x1e1e28, 1.2, 1.1],
  [0.02, 0x24386a, 0xf08e56, 0xc98a64, 0xff9a52, 1.3, 0x8a7fa8, 0x3a2e22, 0.6, 1.0],
  [0.15, 0x3466ae, 0xf2c79c, 0xd6bea4, 0xffcf96, 2.8, 0xa9b9dc, 0x4a4632, 0.42, 0.95],
  [0.4, 0x2d6dca, 0xb2d0ee, 0xb6cee6, 0xffeedb, 3.4, 0xc6d8f6, 0x5a5e40, 0.4, 0.95],
  [1.0, 0x2563c4, 0xa2c6ec, 0xa8c6e6, 0xfff4e6, 3.6, 0xcfe0ff, 0x5a6440, 0.4, 0.95],
];
const COLOR_COLS = new Set([1, 2, 3, 4, 6, 7]);

function lerpKey(e, i, out) {
  let k = 0;
  while (k < KEYS.length - 2 && e > KEYS[k + 1][0]) k++;
  const a = KEYS[k], b = KEYS[k + 1];
  const t = clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
  if (COLOR_COLS.has(i)) return out.setHex(a[i]).lerp(_c2.setHex(b[i]), t);
  return lerp(a[i], b[i], t);
}
const _c2 = new THREE.Color();

const NOISE = `
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }`;

const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x56603a, 0.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const ext = quality === 'high' ? 120 : 100;
    const sc = this.sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 900;
    this.texel = (ext * 2) / size;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = this.texel * 1.6;
    this.sun.shadow.radius = 1.2;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.lightDir = new THREE.Vector3(0, 1, 0);

    this.fog = new THREE.Fog(0xaac8e6, 250, 1400);
    scene.fog = this.fog;

    const geo = new THREE.SphereGeometry(1, 48, 24);
    const U = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, fogCol: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 },
      time: { value: 0 }, cover: { value: 0.35 }, cloudLit: { value: new THREE.Color() }, cloudShade: { value: new THREE.Color() },
    };
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
      vertexShader: SKY_VERT,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 fogCol; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night;
        uniform float time; uniform float cover; uniform vec3 cloudLit; uniform vec3 cloudShade; varying vec3 vDir;
        ${NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(smoothstep(-0.05, 0.6, h), 0.8));
          float sd = max(dot(d, sunDir), 0.0);
          float day = 1.0 - night;
          col += sunCol * (pow(sd, 1600.0) * 40.0 + pow(sd, 90.0) * 0.6 + pow(sd, 8.0) * 0.18) * day;
          float md = max(dot(d, -sunDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * (pow(md, 2200.0) * 6.0 + pow(md, 60.0) * 0.04) * night;
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.1) * 0.9 + vec2(time * 0.0035, time * 0.0012);
            float n = fbm(uv);
            float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n);
            float n2 = fbm(uv + sunDir.xz * 0.12);
            float lit = clamp(0.6 + (n - n2) * 3.5, 0.0, 1.0);
            vec3 cc = mix(cloudShade, cloudLit, lit);
            cc += sunCol * pow(sd, 10.0) * (1.0 - dens) * 0.8 * day;
            col = mix(col, cc, dens * smoothstep(0.0, 0.16, d.y) * 0.96);
          }
          col = mix(fogCol, col, smoothstep(-0.01, 0.09, h));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(geo, this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Environment used for image-based lighting and reflections (sky gradient + ground bounce).
    this.envScene = new THREE.Scene();
    this.envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { top: U.top, horizon: U.horizon, sunDir: U.sunDir, sunCol: U.sunCol, night: U.night, ground: { value: new THREE.Color() } },
      vertexShader: SKY_VERT,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform vec3 ground; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(horizon, top, pow(smoothstep(-0.05, 0.6, d.y), 0.8));
          col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.45);
          col += sunCol * pow(max(dot(d, sunDir), 0.0), 6.0) * 0.35 * (1.0 - night);
          col = mix(col, ground, smoothstep(0.02, -0.18, d.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.envMat));
    this.envT = 0;
    this.envRT = null;

    // Stars
    const rng = mulberry32(5);
    const n = 1600, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = Math.abs(u); sp[i * 3 + 2] = Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // Rain
    const rn = quality === 'low' ? 600 : 1500;
    const rp = new Float32Array(rn * 6);
    this.rainData = new Float32Array(rn * 3);
    for (let i = 0; i < rn; i++) {
      this.rainData[i * 3] = (rng() - 0.5) * 60; this.rainData[i * 3 + 1] = rng() * 30; this.rainData[i * 3 + 2] = (rng() - 0.5) * 60;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.4, fog: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainN = rn;

    this.weather = 0; // 0 clear .. 1 rain
    this.weatherTarget = 0;
    this.weatherTimer = 240;
    this.night = 0;
    this.day = 1;
    this.time = 0;
    this.sunDir = new THREE.Vector3();
    this._top = new THREE.Color(); this._hor = new THREE.Color(); this._fog = new THREE.Color(); this._sun = new THREE.Color();
    this._hs = new THREE.Color(); this._hg = new THREE.Color(); this._grey = new THREE.Color(0x6f7680); this._fogGrey = new THREE.Color(0x7a828c);
    this._p = new THREE.Vector3(); this._lx = new THREE.Vector3(); this._ly = new THREE.Vector3();
  }

  update(hour, camPos, focus, dt) {
    // Weather changes occasionally
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 180 + Math.random() * 300;
      this.weatherTarget = Math.random() < 0.22 ? 1 : 0;
    }
    this.weather += Math.sign(this.weatherTarget - this.weather) * Math.min(Math.abs(this.weatherTarget - this.weather), dt * 0.05);
    this.time += dt;

    // Summer day: sunrise about 5:20, noon about 58 degrees high, sunset about 18:40.
    const a = ((hour - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.85, Math.sin(a) * 0.72 + 0.12, 0.5).normalize();
    const e = this.sunDir.y;
    const top = lerpKey(e, 1, this._top), hor = lerpKey(e, 2, this._hor), fog = lerpKey(e, 3, this._fog);
    const sunC = lerpKey(e, 4, this._sun);
    let sunI = lerpKey(e, 5), hemiI = lerpKey(e, 8), envI = lerpKey(e, 9);
    const hs = lerpKey(e, 6, this._hs), hg = lerpKey(e, 7, this._hg);
    const w = this.weather;
    top.lerp(this._grey, w * 0.7); hor.lerp(this._grey, w * 0.6); fog.lerp(this._fogGrey, w * 0.7);
    this.day = smoothstep(-0.06, 0.18, e);
    this.night = 1 - this.day;

    const u = this.domeMat.uniforms;
    u.top.value.copy(top); u.horizon.value.copy(hor); u.fogCol.value.copy(fog);
    u.sunDir.value.copy(this.sunDir); u.sunCol.value.copy(sunC); u.night.value = this.night;
    u.time.value = this.time;
    u.cover.value = clamp(0.3 + Math.sin(this.time * 0.004) * 0.1 + w * 0.62, 0, 0.97);
    u.cloudLit.value.copy(sunC).multiplyScalar(0.19 * sunI * (1 - w * 0.6)).add(this._c(hor, 0.55));
    u.cloudShade.value.copy(hor).multiplyScalar(0.5).add(this._c(top, 0.2)).lerp(this._grey, w * 0.25).multiplyScalar(1 - w * 0.2);
    this.envMat.uniforms.ground.value.copy(hg).multiplyScalar(0.35 + sunI * 0.3);
    sunI *= 1 - w * 0.75; hemiI *= 1 + w * 0.6; envI *= 1 - w * 0.2;
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    const R = (this.camFar || 3000) * 0.9;
    this.dome.scale.setScalar(R);
    this.stars.scale.setScalar(R * 0.95);
    this.starMat.opacity = this.night * (1 - w) * 0.9;

    // Sun or moon as the key light. The direction only moves in small steps and the
    // shadow camera is snapped to shadow-map texels, so shadows don't shimmer.
    const moon = e < -0.02;
    const ld = moon ? this._p.copy(this.sunDir).negate() : this._p.copy(this.sunDir);
    if (moon) { sunC.setHex(0xa8bef0); sunI = 1.1 * (1 - w * 0.6); }
    if (ld.angleTo(this.lightDir) > 0.004) this.lightDir.copy(ld);
    const L = this.lightDir;
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;
    const lx = this._lx.set(0, 1, 0).cross(L).normalize(), ly = this._ly.copy(L).cross(lx);
    const t = this.texel;
    const fx = Math.round(focus.dot(lx) / t) * t, fy = Math.round(focus.dot(ly) / t) * t, fz = focus.dot(L);
    this.sun.target.position.set(0, 0, 0).addScaledVector(lx, fx).addScaledVector(ly, fy).addScaledVector(L, fz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(L, 450);
    this.hemi.color.copy(hs); this.hemi.groundColor.copy(hg); this.hemi.intensity = hemiI;
    this.scene.environmentIntensity = envI;
    this.fog.color.copy(fog);
    const far = this.farBase || 1400;
    this.fog.near = lerp(far * 0.18, 50, w);
    this.fog.far = lerp(far, 650, w);

    // Rain around the camera
    this.rain.visible = w > 0.3;
    if (this.rain.visible) {
      const arr = this.rain.geometry.attributes.position.array, d = this.rainData;
      for (let i = 0; i < this.rainN; i++) {
        d[i * 3 + 1] -= dt * 28;
        if (d[i * 3 + 1] < -2) { d[i * 3 + 1] += 32; d[i * 3] = (Math.random() - 0.5) * 60; d[i * 3 + 2] = (Math.random() - 0.5) * 60; }
        const x = camPos.x + d[i * 3], y = camPos.y + d[i * 3 + 1] - 10, z = camPos.z + d[i * 3 + 2];
        arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + 0.05; arr[i * 6 + 4] = y + 0.9; arr[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.4 * smoothstep(0.3, 0.8, w);
    }
  }

  _c(col, s) { return (this._tmp || (this._tmp = new THREE.Color())).copy(col).multiplyScalar(s); }

  // Re-bakes the image-based lighting from the current sky whenever the sun has moved
  // or the weather has changed noticeably (at most twice a second).
  updateEnv(renderer, dt) {
    this.envT -= dt;
    if (this.envRT && (this.envT > 0 || (this.sunDir.angleTo(this.envSun) < 0.03 && Math.abs(this.weather - this.envW) < 0.08))) return;
    this.envT = 0.5;
    this.envSun = (this.envSun || new THREE.Vector3()).copy(this.sunDir);
    this.envW = this.weather;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 10, { size: 64 });
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
