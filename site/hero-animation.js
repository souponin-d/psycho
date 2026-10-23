// Green particle logo with a soft pointer response and responsive composition.
const vertex = `
 precision highp float;
 attribute vec4 a_seed;
 uniform float u_time,u_cycle,u_assembly,u_aspect,u_dpr,u_size,u_response,u_active,u_reduce,u_dispersion,u_compact;
 uniform vec2 u_pointer;
 varying float v_alpha,v_tone,v_hover;
 const float PI=3.14159265359;
 float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
 mat3 rx(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,s,0,-s,c);}
 mat3 ry(float a){float c=cos(a),s=sin(a);return mat3(c,0,-s,0,1,0,s,0,c);}
 mat3 rz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0,-s,c,0,0,0,1);}
 // Centre-line proportions follow the site's 18×23 px capsules, offset 9×10 px.
 vec3 capsule(float u,float v,float group){
  float r=.48,h=.155,arc=PI*r,straight=2.*h,perimeter=2.*arc+2.*straight;
  float distance=u*perimeter;vec2 p,n;
  if(distance<arc){float a=distance/r;p=vec2(r*cos(a),h+r*sin(a));n=vec2(cos(a),sin(a));}
  else if(distance<arc+straight){p=vec2(-r,h-(distance-arc));n=vec2(-1.,0.);}
  else if(distance<2.*arc+straight){float a=PI+(distance-arc-straight)/r;p=vec2(r*cos(a),-h+r*sin(a));n=vec2(cos(a),sin(a));}
  else{p=vec2(r,-h+(distance-2.*arc-straight));n=vec2(1.,0.);}
  float b=v*2.*PI;float thickness=.09;
  vec3 point=vec3(p+n*thickness*cos(b),thickness*sin(b));
  float side=group<.5?-1.:1.;point=ry(-side*.15)*point;
  point+=vec3(side*.279,-side*.31,side*.025);
  return rz(PI*.1)*point;
 }
 vec4 project(vec3 p){return vec4(p.x*2.85/u_aspect,p.y*2.85,p.z*.09,4.2+p.z);}
 void main(){
  float id=a_seed.w;vec3 home=capsule(a_seed.x,a_seed.y,a_seed.z);
  float delay=hash(id+13.)*.12,binding=smoothstep(delay,.86+delay,u_assembly),loose=1.-binding;
  float angle=id*2.39996323+u_time*.025;
  vec3 radial=normalize(home+vec3(.001));
  vec3 random=vec3(hash(id+17.)-.5,hash(id+29.)-.5,hash(id+47.)-.5);
  vec3 scatter=(radial*(.5+hash(id+2.)*1.15)+vec3(-home.y,home.x,0.)*.6+random*1.35)*u_dispersion;
  scatter+=vec3(cos(angle),sin(angle),sin(angle*.3))*.28;
  vec3 p=home+loose*scatter;
  float assembledTurn=2.*PI*smoothstep(.34,.68,u_cycle);
  float yaw=assembledTurn+.12*sin(u_time*.05)+u_pointer.x*.2*u_response;
  float pitch=.12+.08*sin(u_time*.12+.4)-u_pointer.y*.14*u_response;
  mat3 rotation=ry(yaw)*rx(pitch);p=rotation*p;
  float depth=clamp((1.05-p.z)/2.1,0.,1.);
  v_tone=.24+.36*depth+.18*hash(id+7.);
  v_alpha=(.2+.65*depth)*(.7+.3*hash(id+6.))*mix(.6,1.,binding);
  if(u_compact>.5){p*=.63;p+=vec3(.06,-.8,0.);}else{if(u_aspect<1.6){p*=.72;p+=vec3(1.04,0.,0.);}else{p+=vec3(1.03,0.,0.);}}
  vec4 clip=project(p);vec2 ndc=clip.xy/clip.w;
  vec2 delta=(ndc-u_pointer)*vec2(u_aspect,1.);float distance=length(delta);
  float influence=exp(-distance*distance/.009)*u_active*u_response*(1.-u_reduce);
  p.xy+=normalize(delta+vec2(.0001))*influence*.14;
  p.z+=influence*.035*sin(id*.31+u_time*.7);
  v_hover=influence;gl_Position=project(p);
  gl_PointSize=u_dpr*u_size*(.85+.7*hash(id+3.))*(4.2/(4.2+p.z))*(1.+influence*.2);
 }
 `;
const fragment = `
 precision highp float;uniform vec3 u_dark,u_soft;varying float v_alpha,v_tone,v_hover;
 void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;float alpha=(1.-smoothstep(.35,1.,r))*v_alpha;vec3 c=mix(u_dark,u_soft,v_tone);c=mix(c,u_dark,v_hover*.2);gl_FragColor=vec4(c,alpha);}
 `;
/** Mount one decorative scene without coupling it to the landing demo. */
export function mountHeroAnimation(root) {
  if (!root) return;
  const canvas = root.querySelector("canvas");
  const fallback = root.querySelector("[data-hero-fallback]");
  if (!canvas || !fallback) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 760px)");
  let paused = reduced.matches;
  let phase = 0.35;
  let clock = 0;
  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let inView = true;
  let suspended = false;
  let disposed = false;
  let gl, program, buffer;
  let shaders = [];
  let uniforms = {};
  let ready = false;
  const pointer = {
    x: 0,
    y: 0,
    active: 0,
    targetX: 0,
    targetY: 0,
    targetActive: 0,
  };
  const count = 14000;
  const listeners = [];
  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function release() {
    if (gl) {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
    buffer = program = undefined;
    shaders = [];
    ready = false;
  }
  function updatePresentation() {
    fallback.hidden = ready;
    canvas.hidden = !ready;
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Shader unavailable");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Shader compilation failed");
    return shader;
  }
  function initialize() {
    release();
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      if (!gl) throw new Error("WebGL unavailable");
      program = gl.createProgram();
      if (!program) throw new Error("Program unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Program link failed");
      gl.useProgram(program);
      const data = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        data.set(
          [(i * 0.618033988749895) % 1, (i * 0.75487766624669) % 1, i % 2, i],
          i * 4,
        );
      }
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Buffer unavailable");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, "a_seed");
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, 0, 0);
      uniforms = {};
      [
        "time",
        "cycle",
        "assembly",
        "aspect",
        "dpr",
        "size",
        "response",
        "active",
        "reduce",
        "pointer",
        "dark",
        "soft",
        "dispersion",
        "compact",
      ].forEach((name) => {
        uniforms[name] = gl.getUniformLocation(program, "u_" + name);
      });
      ready = true;
    } catch {
      release();
    }
    updatePresentation();
    draw();
    sync();
  }
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  function draw() {
    if (!ready || disposed || suspended || document.hidden || !inView) return;
    const width = root.clientWidth,
      height = root.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.8);
    const w = Math.round(width * dpr),
      h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const u = uniforms;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    const values = {
      time: clock,
      cycle: phase,
      assembly: smooth(0.04, 0.34, phase) * (1 - smooth(0.68, 0.97, phase)),
      dispersion: 1.7,
      aspect: width / height,
      compact: compact.matches ? 1 : 0,
      dpr,
      size: 1.3,
      response: 0.65,
      active: pointer.active,
      reduce: reduced.matches ? 1 : 0,
    };
    Object.entries(values).forEach(([name, value]) =>
      gl.uniform1f(u[name], value),
    );
    gl.uniform2f(u.pointer, pointer.x, pointer.y);
    gl.uniform3fv(u.dark, [0x42 / 255, 0x6b / 255, 0x36 / 255]);
    gl.uniform3fv(u.soft, [0x9b / 255, 0xb5 / 255, 0x8c / 255]);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.drawArrays(gl.POINTS, 0, count);
  }
  function sync() {
    if (
      !ready ||
      disposed ||
      suspended ||
      paused ||
      !inView ||
      document.hidden
    ) {
      stop();
      return;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!root.isConnected) {
      destroy();
      return;
    }
    if (paused || !ready || suspended || !inView || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 0.065) : 1 / 60;
    last = now;
    clock += dt * 1.2;
    phase = (phase + (dt * 1.2) / 34) % 1;
    const lerp = reduced.matches ? 1 : 1 - Math.exp(-dt * 4.5);
    pointer.x += (pointer.targetX - pointer.x) * lerp;
    pointer.y += (pointer.targetY - pointer.y) * lerp;
    pointer.active += (pointer.targetActive - pointer.active) * lerp;
    if (now - lastDraw >= 1000 / 30) {
      draw();
      lastDraw = now;
    }
    sync();
  }
  listen(root, "pointermove", (event) => {
    if (event.pointerType === "touch" || paused) return;
    const bounds = root.getBoundingClientRect();
    pointer.targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.targetY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    pointer.targetActive = 1;
  });
  listen(root, "pointerleave", () => {
    pointer.targetX = pointer.targetY = pointer.targetActive = 0;
  });
  listen(reduced, "change", () => {
    paused = reduced.matches;
    if (paused) phase = 0.35;
    pointer.x = pointer.y = pointer.active = 0;
    pointer.targetX = pointer.targetY = pointer.targetActive = 0;
    updatePresentation();
    draw();
    sync();
  });
  listen(document, "visibilitychange", () => {
    last = 0;
    draw();
    sync();
  });
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    stop();
    ready = false;
    updatePresentation();
  });
  listen(canvas, "webglcontextrestored", initialize);
  const resize = new ResizeObserver(draw);
  resize.observe(root);
  const visibility = new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    last = 0;
    draw();
    sync();
  });
  visibility.observe(root);
  function destroy() {
    if (disposed) return;
    disposed = true;
    stop();
    resize.disconnect();
    visibility.disconnect();
    listeners.forEach((remove) => remove());
    release();
  }
  listen(window, "pagehide", (event) => {
    if (event.persisted) {
      suspended = true;
      stop();
    } else destroy();
  });
  listen(window, "pageshow", (event) => {
    if (event.persisted) {
      suspended = false;
      draw();
      sync();
    }
  });
  initialize();
  return destroy;
}
