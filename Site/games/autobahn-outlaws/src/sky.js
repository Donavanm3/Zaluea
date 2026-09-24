// Day/night cycle: sky dome, sun/moon lighting, fog, stars and weather.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';

const KEYS = [
  // elevation, top, horizon, fog, sunColor, sunI, hemiSky, hemiGround, hemiI
  [-0.35, 0x050814, 0x121a33, 0x121a2e, 0x6f84b8, 0.0, 0x4a5c94, 0x1a1e2a, 0.9],
  [-0.08, 0x0e1530, 0x2a2440, 0x28283c, 0x7f8fc8, 0.0, 0x56608c, 0x1c1c24, 0.95],
  [0.02, 0x2b3f73, 0xe0894e, 0xb77a58, 0xff9c5a, 0.7, 0x7d7aa0, 0x3a3020, 0.7],
  [0.15, 0x3d6db0, 0xf0c49a, 0xd4b597, 0xffd2a0, 1.8, 0xb5c4e0, 0x4a4a30, 1.0],
  [0.4, 0x3b7bd4, 0xb9d6ef, 0xb7cfe6, 0xfff3e2, 2.6, 0xcfe0ff, 0x56603a, 1.25],
  [1.0, 0x2f6fd0, 0xa9cdef, 0xaac8e6, 0xffffff, 2.9, 0xd6e6ff, 0x5a6440, 1.3],
];

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpKey(e, i, out) {
  let k = 0;
  while (k < KEYS.length - 2 && e > KEYS[k + 1][0]) k++;
  const a = KEYS[k], b = KEYS[k + 1];
  const t = clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
  if (typeof a[i] === 'number' && i >= 1 && i !== 5 && i !== 8) {
    _c1.setHex(a[i]); _c2.setHex(b[i]);
    return out.copy(_c1).lerp(_c2, t);
  }
  return lerp(a[i], b[i], t);
}

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x56603a, 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 800;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.fog = new THREE.Fog(0xaac8e6, 250, 1400);
    scene.fog = this.fog;

    const geo = new THREE.SphereGeometry(1, 32, 16);
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(smoothstep(-0.05, 0.6, h), 0.8));
          float sd = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * (1.0 - night);
          vec3 moonDir = -sunDir;
          float md = max(dot(normalize(vDir), moonDir), 0.0);
          col += vec3(0.85, 0.9, 1.0) * pow(md, 1400.0) * 3.0 * night;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(geo, this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Stars
    const rng = mulberry32(5);
    const n = 1400, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = Math.abs(u); sp[i * 3 + 2] = Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
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
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.45, fog: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainN = rn;

    this.weather = 0; // 0 clear .. 1 rain
    this.weatherTarget = 0;
    this.weatherTimer = 240;
    this.night = 0;
    this.day = 1;
    this.sunDir = new THREE.Vector3();
  }

  update(hour, camPos, focus, dt) {
    // Weather changes occasionally
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 180 + Math.random() * 300;
      this.weatherTarget = Math.random() < 0.25 ? 1 : 0;
    }
    this.weather += Math.sign(this.weatherTarget - this.weather) * Math.min(Math.abs(this.weatherTarget - this.weather), dt * 0.05);

    const a = ((hour - 6) / 24) * Math.PI * 2; // 6h sunrise, 12 noon, 18 sunset
    const elev = Math.sin(a);
    const az = Math.cos(a);
    this.sunDir.set(az * 0.8, elev, 0.45).normalize();
    const e = this.sunDir.y;
    const top = lerpKey(e, 1, new THREE.Color()), hor = lerpKey(e, 2, new THREE.Color()), fog = lerpKey(e, 3, new THREE.Color());
    const sunC = lerpKey(e, 4, new THREE.Color());
    let sunI = lerpKey(e, 5), hemiI = lerpKey(e, 8);
    const hs = lerpKey(e, 6, new THREE.Color()), hg = lerpKey(e, 7, new THREE.Color());
    const w = this.weather;
    const grey = new THREE.Color(0x6f7680);
    top.lerp(grey, w * 0.7); hor.lerp(grey, w * 0.6); fog.lerp(new THREE.Color(0x7a828c), w * 0.7);
    sunI *= 1 - w * 0.7; hemiI *= 1 - w * 0.25;
    this.day = smoothstep(-0.06, 0.18, e);
    this.night = 1 - this.day;

    const u = this.domeMat.uniforms;
    u.top.value.copy(top); u.horizon.value.copy(hor); u.sunDir.value.copy(this.sunDir); u.sunCol.value.copy(sunC); u.night.value = this.night;
    this.dome.position.copy(camPos);
    this.stars.position.copy(camPos);
    const R = (this.camFar || 3000) * 0.9;
    this.dome.scale.setScalar(R);
    this.stars.scale.setScalar(R * 0.95);
    this.starMat.opacity = this.night * (1 - w) * 0.9;

    // Sun or moon as the key light
    const moon = e < -0.02;
    const ld = moon ? this.sunDir.clone().negate() : this.sunDir;
    if (moon) { sunC.setHex(0x9fb4e8); sunI = 0.75 * (1 - w * 0.6); }
    this.sun.color.copy(sunC);
    this.sun.intensity = sunI;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(ld, 400);
    // Snap shadow camera to texels to reduce shimmering
    this.hemi.color.copy(hs); this.hemi.groundColor.copy(hg); this.hemi.intensity = hemiI;
    this.fog.color.copy(fog);
    this.fog.near = lerp(250, 60, w);
    this.fog.far = lerp(this.farBase || 1400, 700, w);

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
      this.rain.material.opacity = 0.45 * smoothstep(0.3, 0.8, w);
    }
  }
}
