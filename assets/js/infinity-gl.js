/* Infinity Tower hero: 3D gold particle "infinity" that assembles from dust, flows along its own curve and follows the pointer (three.js r160) */
import * as THREE from "../vendor/three.module.min.js";

const host = document.querySelector("[data-infinity-gl]");
if (host) init(host);

function init(host) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const small = innerWidth < 720;
  const N = small ? 9000 : 22000;
  const pos = new Float32Array(N * 3), start = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = Math.random() * Math.PI * 2;
    // band offset around the curve (ribbon thickness)
    const r = Math.pow(Math.random(), 1.6) * 0.32, a = Math.random() * Math.PI * 2;
    seed[i * 4] = t; seed[i * 4 + 1] = r; seed[i * 4 + 2] = a; seed[i * 4 + 3] = Math.random();
    // start: wide dust sphere
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, R = 6 + Math.random() * 6;
    start[i * 3] = R * Math.sqrt(1 - u * u) * Math.cos(th);
    start[i * 3 + 1] = R * Math.sqrt(1 - u * u) * Math.sin(th) * 0.6;
    start[i * 3 + 2] = R * u - 4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));

  const uniforms = {
    uTime: { value: 0 }, uForm: { value: reduce ? 1 : 0 }, uMouse: { value: new THREE.Vector3(9, 9, 0) },
    uScale: { value: small ? 1.25 : 2.3 }, uPx: { value: renderer.getPixelRatio() }, uScroll: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aStart; attribute vec4 aSeed;
      uniform float uTime, uForm, uScale, uPx, uScroll; uniform vec3 uMouse;
      varying float vA; varying float vW;
      vec3 lem(float t){ float s = sin(t), c = cos(t); float d = 1. + s*s; return vec3(c/d, s*c/d, .35*sin(t*2.)*0.); }
      void main(){
        float t = aSeed.x + uTime*(.08 + aSeed.w*.05);
        vec3 p = lem(t) * uScale;
        vec3 p2 = lem(t + .01) * uScale;
        vec3 tan = normalize(p2 - p);
        vec3 nrm = normalize(cross(tan, vec3(0.,0.,1.)));
        vec3 bin = cross(tan, nrm);
        float r = aSeed.y * (1. + .4*sin(t*3. + uTime));
        p += (nrm*cos(aSeed.z) + bin*sin(aSeed.z)) * r * uScale * .55;
        // ribbon twist in depth
        p.z += sin(t*2. + uTime*.4) * .45 * uScale * .4;
        // assemble from dust
        float f = smoothstep(0., 1., clamp(uForm*1.4 - aSeed.w*.4, 0., 1.));
        vec3 q = mix(aStart, p, f);
        // pointer repulsion
        vec3 dm = q - uMouse; float dl = length(dm.xy);
        q.xy += normalize(dm.xy + 1e-4) * smoothstep(1.1, 0., dl) * .55;
        // scroll: drift + rotate around Y
        float ang = uScroll * 1.2; float cs = cos(ang), sn = sin(ang);
        q = vec3(q.x*cs + q.z*sn, q.y, -q.x*sn + q.z*cs);
        vec4 mv = modelViewMatrix * vec4(q, 1.);
        gl_Position = projectionMatrix * mv;
        float size = (1.2 + aSeed.w*2.4) * uPx;
        gl_PointSize = size * (9. / -mv.z);
        vA = (.35 + .65*(1.-aSeed.y*2.5)) * mix(.35, 1., f);
        vW = aSeed.w;
      }`,
    fragmentShader: `
      varying float vA; varying float vW;
      void main(){
        vec2 c = gl_PointCoord - .5; float d = length(c);
        float a = smoothstep(.5, 0., d);
        vec3 gold = mix(vec3(.62,.44,.27), vec3(1.,.86,.62), vW);
        gl_FragColor = vec4(gold, a * vA * .55);
      }`
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  const lift = () => (host.clientWidth < 720 ? 0.9 : 0.75);
  pts.position.y = lift();

  // ambient dust
  const D = 600, dpos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) { dpos[i * 3] = (Math.random() - .5) * 22; dpos[i * 3 + 1] = (Math.random() - .5) * 12; dpos[i * 3 + 2] = (Math.random() - .5) * 10 - 2; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd9b48a, size: .03, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    camera.aspect = w / h; camera.updateProjectionMatrix();
    uniforms.uScale.value = w < 720 ? 1.25 : 2.1;
    if (typeof pts !== 'undefined') pts.position.y = w < 720 ? 0.9 : 0.75;
  }
  addEventListener("resize", resize); resize();

  const mouse = new THREE.Vector2(9, 9), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let rotT = { x: 0, y: 0 };
  const aim = (cx, cy) => {
    const r = host.getBoundingClientRect();
    mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera); ray.ray.intersectPlane(plane, hit);
    rotT = { x: mouse.y * .18, y: mouse.x * .3 };
  };
  // touch screens: particles part around the finger, or around a slowly drifting point, and the ribbon leans with the phone
  const vp = window.__vp && window.__vp.touchUI ? window.__vp : null;
  if (!vp) {
    host.addEventListener("pointermove", (e) => aim(e.clientX, e.clientY));
    host.addEventListener("pointerleave", () => { hit.set(9, 9, 0); rotT = { x: 0, y: 0 }; });
  }
  const followVp = () => {
    if (!vp || reduce) return;
    aim(vp.x * innerWidth, vp.y * innerHeight);
    rotT.x += vp.gy * .22; rotT.y += vp.gx * .35;
  };

  let started = false;
  const begin = () => { started = true; };
  document.addEventListener("rassaz:intro", begin);
  setTimeout(begin, 2600);

  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(host);
  const clock = new THREE.Clock();
  (function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), .05);
    if (!reduce) uniforms.uTime.value += dt;
    if (started && uniforms.uForm.value < 1) uniforms.uForm.value = Math.min(1, uniforms.uForm.value + dt * .45);
    followVp();
    uniforms.uMouse.value.lerp(hit, .12);
    uniforms.uScroll.value = Math.min(1.2, scrollY / host.clientHeight);
    pts.rotation.x += (rotT.x - pts.rotation.x) * .05;
    pts.rotation.y += (rotT.y - pts.rotation.y) * .05;
    dust.rotation.y += dt * .02;
    renderer.render(scene, camera);
  })();
}
