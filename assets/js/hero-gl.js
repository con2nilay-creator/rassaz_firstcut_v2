/* WebGL hero: liquid displacement slideshow with mouse-reactive depth + chromatic shift (three.js r160) */
import * as THREE from "../vendor/three.module.min.js";

const host = document.querySelector("[data-hero-gl]");
if (host) init(host);

function init(host) {
  const slides = JSON.parse(host.getAttribute("data-slides"));
  const buttons = Array.from(document.querySelectorAll("[data-slide-btn]"));
  const fallback = host.querySelector(".hero-fallback");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  } catch (e) { return fallbackMode(); }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const loader = new THREE.TextureLoader();
  const textures = [];

  const uniforms = {
    uA: { value: null }, uB: { value: null },
    uAr: { value: 1.6 }, uBr: { value: 1.6 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uProgress: { value: 0 }, uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uHover: { value: 0 }, uScroll: { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uA, uB; uniform float uAr, uBr; uniform vec2 uRes;
      uniform float uProgress, uTime, uHover, uScroll; uniform vec2 uMouse;
      // cover-fit uv
      vec2 cover(vec2 uv, float imgAr){
        float scr = uRes.x / uRes.y;
        vec2 s = scr > imgAr ? vec2(1., imgAr/scr) : vec2(scr/imgAr, 1.);
        return (uv - .5) * s + .5;
      }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.; a*=.5; } return v; }
      void main(){
        vec2 uv = vUv;
        // slow breathing zoom + scroll push-in
        float zoom = 1. - .04*sin(uTime*.15) - uScroll*.12;
        uv = (uv-.5)*zoom + .5;
        // mouse parallax + lens bulge near pointer
        vec2 m = uMouse;
        vec2 d = uv - m; float dist = length(d * vec2(uRes.x/uRes.y, 1.));
        float lens = smoothstep(.45, 0., dist) * uHover;
        uv -= d * lens * .08;
        uv += (m - .5) * .025;
        // liquid transition
        float n = fbm(uv*3. + uTime*.05);
        float p = uProgress;
        float edge = smoothstep(p - .2, p + .2, n*0.8 + uv.x*.4 + (1.-uv.y)*.2 - .2 + p*.0);
        float t = smoothstep(0., 1., p);
        vec2 uvA = cover(uv + vec2(n-.5)*t*.35, uAr);
        vec2 uvB = cover(uv - vec2(n-.5)*(1.-t)*.35, uBr);
        // chromatic shift scales with lens + transition energy
        float ca = .004*lens + .012*sin(t*3.14159);
        vec4 a = vec4(texture2D(uA, uvA + vec2(ca,0.)).r, texture2D(uA, uvA).g, texture2D(uA, uvA - vec2(ca,0.)).b, 1.);
        vec4 b = vec4(texture2D(uB, uvB + vec2(ca,0.)).r, texture2D(uB, uvB).g, texture2D(uB, uvB - vec2(ca,0.)).b, 1.);
        float mixv = smoothstep(.0, 1., clamp((t*1.6 - (1.-n)*.6), 0., 1.));
        vec4 col = mix(a, b, mixv);
        // warm gold grade + vignette
        col.rgb = mix(col.rgb, col.rgb*vec3(1.04,1.,.94), .5);
        float vig = smoothstep(1.2, .35, length(vUv-.5)*1.4);
        col.rgb *= mix(.72, 1., vig);
        gl_FragColor = col;
      }`
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    uniforms.uRes.value.set(w, h);
  }
  addEventListener("resize", resize); resize();

  let current = 0, animating = false, timer = null, ready = false;
  const load = (i) => new Promise((res) => {
    if (textures[i]) return res(textures[i]);
    loader.load(slides[i].src, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; textures[i] = t; res(t); }, undefined, () => res(null));
  });

  load(0).then((t) => {
    if (!t) return fallbackMode();
    uniforms.uA.value = t; uniforms.uB.value = t; uniforms.uAr.value = uniforms.uBr.value = t.image.width / t.image.height;
    ready = true; if (fallback) fallback.style.opacity = 0;
    setActive(0); schedule();
    slides.forEach((_, i) => i && load(i));
  });

  function setActive(i) {
    buttons.forEach((b, k) => { b.classList.remove("on"); void b.offsetWidth; b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", k === i ? "true" : "false"); });
    const cap = document.querySelector("[data-slide-caption]");
    if (cap) cap.textContent = slides[i].caption || "";
  }
  function schedule() { clearTimeout(timer); if (!reduce) timer = setTimeout(() => go((current + 1) % slides.length), 6000); }
  async function go(i) {
    if (animating || i === current || !ready) return;
    const t = await load(i); if (!t) return;
    animating = true;
    uniforms.uB.value = t; uniforms.uBr.value = t.image.width / t.image.height;
    setActive(i);
    const start = performance.now(), dur = reduce ? 10 : 1800;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      uniforms.uProgress.value = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;
      if (k < 1) requestAnimationFrame(step);
      else { uniforms.uA.value = t; uniforms.uAr.value = uniforms.uBr.value; uniforms.uProgress.value = 0; current = i; animating = false; schedule(); }
    };
    requestAnimationFrame(step);
  }
  buttons.forEach((b, k) => b.addEventListener("click", () => go(k)));

  const target = new THREE.Vector2(.5, .5); let hoverT = 0;
  // touch screens: the lens follows the finger, otherwise drifts on its own and leans with the phone (window.__vp from main.js)
  const vp = window.__vp && window.__vp.touchUI ? window.__vp : null;
  if (!vp) {
    host.addEventListener("pointermove", (e) => { const r = host.getBoundingClientRect(); target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height); hoverT = 1; });
    host.addEventListener("pointerleave", () => { hoverT = 0; });
  } else if (!reduce) {
    hoverT = 1;
  }
  const followVp = () => {
    if (!vp || reduce) return;
    const r = host.getBoundingClientRect();
    target.set((vp.x * innerWidth - r.left) / r.width, 1 - (vp.y * innerHeight - r.top) / r.height);
  };

  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(host);
  const clock = new THREE.Clock();
  (function tick() {
    requestAnimationFrame(tick);
    if (!visible || !ready) return;
    uniforms.uTime.value = clock.getElapsedTime();
    followVp();
    uniforms.uMouse.value.lerp(target, .06);
    uniforms.uHover.value += (hoverT - uniforms.uHover.value) * .05;
    uniforms.uScroll.value = Math.min(1, scrollY / host.clientHeight);
    renderer.render(scene, camera);
  })();

  function fallbackMode() {
    if (!fallback) return;
    const imgs = Array.from(fallback.querySelectorAll("img"));
    let i = 0; imgs[0] && imgs[0].classList.add("on"); setActive(0);
    const nextF = (k) => { imgs.forEach((im, j) => im.classList.toggle("on", j === k)); i = k; setActive(k); };
    buttons.forEach((b, k) => b.addEventListener("click", () => nextF(k)));
    if (!reduce) setInterval(() => nextF((i + 1) % imgs.length), 6000);
  }
}
