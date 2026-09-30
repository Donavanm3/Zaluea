// Rendering pipeline. On medium/high quality the scene is drawn into a multisampled
// HDR target, then bloom, ACES tone mapping, colour grading, a vignette and the
// low-health effect are applied in one composite pass. On low quality (or if the
// GPU cannot render to half-float targets) the scene goes straight to the screen.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Bright pass + first 2x downsample. Karis-weighted so single hot pixels don't flicker.
const PREFILTER = `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
  vec3 bright(vec3 c) {
    float b = max(c.r, max(c.g, c.b));
    float knee = threshold * 0.5;
    float s = clamp(b - threshold + knee, 0.0, 2.0 * knee);
    s = s * s / (4.0 * knee + 1e-4);
    return c * (max(s, b - threshold) / max(b, 1e-4));
  }
  float kw(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
  void main() {
    vec3 a = bright(texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb);
    vec3 b = bright(texture2D(tSrc, vUv + texel * vec2(1.0, -1.0)).rgb);
    vec3 c = bright(texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb);
    vec3 d = bright(texture2D(tSrc, vUv + texel * vec2(1.0, 1.0)).rgb);
    float wa = kw(a), wb = kw(b), wc = kw(c), wd = kw(d);
    vec3 o = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
    gl_FragColor = vec4(min(o, vec3(40.0)), 1.0);
  }`;

const DOWN = `uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv - texel).rgb;
    s += texture2D(tSrc, vUv + texel).rgb;
    s += texture2D(tSrc, vUv + vec2(texel.x, -texel.y)).rgb;
    s += texture2D(tSrc, vUv - vec2(texel.x, -texel.y)).rgb;
    gl_FragColor = vec4(s * 0.125, 1.0);
  }`;

// 3x3 tent upsample, added on top of the next larger level.
const UP = `uniform sampler2D tSrc; uniform vec2 texel; uniform float weight; varying vec2 vUv;
  void main() {
    vec2 t = texel;
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += (texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(t.x, 0.0)).rgb
        + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, t.y)).rgb) * 2.0;
    s += texture2D(tSrc, vUv + t).rgb + texture2D(tSrc, vUv - t).rgb
       + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture2D(tSrc, vUv - vec2(t.x, -t.y)).rgb;
    gl_FragColor = vec4(s * (weight / 16.0), 1.0);
  }`;

const COMPOSITE = `uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 res;
  uniform float bloom; uniform float exposure; uniform float saturation; uniform float contrast;
  uniform float vignette; uniform float hurt; uniform float grey; uniform vec3 tint; varying vec2 vUv;
  const mat3 ACESIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  vec3 rrt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 c) { return clamp(ACESOut * rrt(ACESIn * (c / 0.6)), 0.0, 1.0); }
  vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
    c = aces(c * exposure * tint);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation * (1.0 - grey));
    c = srgb(c);
    c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
    vec2 d = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
    float r = length(d);
    c *= mix(1.0, smoothstep(1.25, 0.25, r), vignette);
    c = mix(c, vec3(0.45, 0.02, 0.03), smoothstep(0.35, 1.0, r) * hurt);
    c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
    gl_FragColor = vec4(c, 1.0);
  }`;

function pass(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

export class RenderPipeline {
  constructor(renderer, quality) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    this.enabled = quality !== 'low' && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.exposure = 1;
    this.hurt = 0;
    this.grey = 0;
    this.tint = new THREE.Color(1, 1, 1);
    if (!this.enabled) return;
    const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    this.mips = [];
    for (let i = 0; i < (quality === 'high' ? 6 : 5); i++) {
      this.mips.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    const tx = () => ({ value: new THREE.Vector2() });
    this.mPre = pass(PREFILTER, { tSrc: { value: null }, texel: tx(), threshold: { value: 1.0 } });
    this.mDown = pass(DOWN, { tSrc: { value: null }, texel: tx() });
    this.mUp = pass(UP, { tSrc: { value: null }, texel: tx(), weight: { value: 0.85 } });
    this.mUp.blending = THREE.AdditiveBlending;
    this.mComp = pass(COMPOSITE, {
      tScene: { value: this.sceneRT.texture }, tBloom: { value: this.mips[0].texture }, res: tx(),
      bloom: { value: 0.12 }, exposure: { value: 1 }, saturation: { value: 1.08 }, contrast: { value: 1.04 },
      vignette: { value: 0.32 }, hurt: { value: 0 }, grey: { value: 0 }, tint: { value: this.tint },
    });
  }

  // w/h in device pixels
  setSize(w, h) {
    if (!this.enabled) return;
    this.sceneRT.setSize(w, h);
    let mw = w, mh = h;
    for (const m of this.mips) {
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      m.setSize(mw, mh);
    }
    this.mComp.uniforms.res.value.set(w, h);
  }

  blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const auto = r.autoClear;
    r.autoClear = false;
    const M = this.mips;
    this.mPre.uniforms.tSrc.value = this.sceneRT.texture;
    this.mPre.uniforms.texel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    this.blit(this.mPre, M[0]);
    for (let i = 1; i < M.length; i++) {
      this.mDown.uniforms.tSrc.value = M[i - 1].texture;
      this.mDown.uniforms.texel.value.set(1 / M[i - 1].width, 1 / M[i - 1].height);
      this.blit(this.mDown, M[i]);
    }
    for (let i = M.length - 1; i > 0; i--) {
      this.mUp.uniforms.tSrc.value = M[i].texture;
      this.mUp.uniforms.texel.value.set(1 / M[i].width, 1 / M[i].height);
      this.blit(this.mUp, M[i - 1]);
    }
    const u = this.mComp.uniforms;
    u.exposure.value = this.exposure;
    u.hurt.value = this.hurt;
    u.grey.value = this.grey;
    this.blit(this.mComp, null);
    r.autoClear = auto;
  }
}
