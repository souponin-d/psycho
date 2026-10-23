import { useEffect, useRef } from "react";
import styles from "./ui/workspace.module.css";

const particleCount = 6000;

const vertexSource = `
precision highp float;
attribute vec4 a_seed;
uniform float u_time, u_aspect, u_dpr, u_assembly;
varying float v_alpha, v_tone;
const float PI = 3.14159265359;
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
mat3 rx(float a) { float c=cos(a),s=sin(a); return mat3(1.,0.,0.,0.,c,s,0.,-s,c); }
mat3 ry(float a) { float c=cos(a),s=sin(a); return mat3(c,0.,-s,0.,1.,0.,s,0.,c); }
void main() {
  float z=a_seed.y*2.-1., a=a_seed.x*2.*PI;
  float r=sqrt(max(0.,1.-z*z));
  float wave=1.+.07*sin(8.*a+u_time*1.3)*sin(PI*z);
  vec3 p=vec3(r*cos(a),z,r*sin(a))*wave;
  float scatter=(1.-u_assembly)*(1.5+hash(a_seed.w+3.)*.9);
  p+=vec3(hash(a_seed.w+4.)-.5,hash(a_seed.w+8.)-.5,hash(a_seed.w+12.)-.5)*scatter;
  p=ry(.45+u_time*.18)*rx(.15+sin(u_time*.24)*.12)*p;
  float depth=clamp((p.z+1.8)/3.6,0.,1.);
  gl_Position=vec4(p.xy*vec2(1./u_aspect,1.)*.64,0.,1.);
  gl_PointSize=u_dpr*2.8*(.8+depth*.9)*(1.+hash(a_seed.w+9.)*.3);
  v_alpha=(.45+depth*.5)*(.75+.25*hash(a_seed.w+15.))*mix(.42,1.,u_assembly);
  v_tone=depth*.7+.3*hash(a_seed.w+21.);
}`;

const fragmentSource = `
precision highp float;
varying float v_alpha, v_tone;
void main() {
  vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p);
  if(r>1.) discard;
  vec3 color=mix(vec3(.05,.22,.18),vec3(.13,.44,.34),v_tone);
  gl_FragColor=vec4(color,(1.-smoothstep(.25,1.,r))*v_alpha);
}`;

export function LoginSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    const buffer = gl.createBuffer();
    if (!buffer) return;
    let seed = 0x5eeda11;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const data = new Float32Array(particleCount * 4);
    for (let i = 0; i < particleCount; i++) {
      data.set([random(), random(), random(), i], i * 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.useProgram(program);
    const attribute = gl.getAttribLocation(program, "a_seed");
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, 0, 0);
    const uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      aspect: gl.getUniformLocation(program, "u_aspect"),
      dpr: gl.getUniformLocation(program, "u_dpr"),
      assembly: gl.getUniformLocation(program, "u_assembly"),
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let clock = reduced.matches ? 2.7 : 0;
    let previous = 0;
    let lastDraw = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 1.8);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.time, clock);
      gl.uniform1f(uniforms.aspect, rect.width / rect.height);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform1f(uniforms.assembly, Math.min(1, clock / 2.7));
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, particleCount);
    };
    const tick = (now: number) => {
      if (document.hidden || reduced.matches) {
        frame = 0;
        previous = 0;
        return;
      }
      clock += previous ? Math.min((now - previous) / 1000, 0.06) : 1 / 60;
      previous = now;
      if (now - lastDraw >= 30) {
        draw();
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (reduced.matches) clock = Math.max(clock, 2.7);
      draw();
      if (!document.hidden && !reduced.matches)
        frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <div className={styles.loginSphere} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
