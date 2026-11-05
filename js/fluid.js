// The water itself: a small stable-fluids solver that runs behind everything. Your hand pushes it, it
// carries glowing dye, and the sea, the plankton and even the Milky Way are bent by its velocity.
// Velocity is in CSS pixels a second, y up, so anything can read it without knowing the grid.
import { QUAD, compile } from './gl.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;`;

const ADVECT = `${HEAD}
uniform sampler2D uV,uS; uniform vec2 uCss,uShift; uniform float uDt,uKeep,uAmb,uT;
void main(){
  vec2 c=vUv-uDt*texture(uV,vUv).xy/uCss+uShift;
  vec4 s=texture(uS,c)*uKeep;
  if(uAmb>0.){
    // Slow currents so the water is never dead. Each axis depends only on the other, so they add no divergence.
    vec2 p=vUv*uCss/560.;
    s.xy+=vec2(sin(p.y*2.7+uT*.19)+.6*sin(p.y*5.3-uT*.13),cos(p.x*2.1-uT*.17)+.6*cos(p.x*4.7+uT*.11))*uAmb*uDt;
  }
  o=s;
}`;

const SPLAT = `${HEAD}
uniform sampler2D uS; uniform vec4 uP[4]; uniform vec3 uC[4]; uniform vec2 uCss;
void main(){
  vec3 a=texture(uS,vUv).rgb;
  for(int i=0;i<4;i++){
    if(uP[i].w<=0.) continue;
    vec2 d=(vUv-uP[i].xy)*uCss;
    a+=uC[i]*exp(-dot(d,d)/(uP[i].z*uP[i].z));
  }
  o=vec4(a,1.);
}`;

const CURL = `${HEAD}
uniform sampler2D uV; uniform vec2 uTx;
void main(){
  float l=texture(uV,vUv-vec2(uTx.x,0.)).y,r=texture(uV,vUv+vec2(uTx.x,0.)).y;
  float t=texture(uV,vUv+vec2(0.,uTx.y)).x,b=texture(uV,vUv-vec2(0.,uTx.y)).x;
  o=vec4(.5*(r-l-t+b));
}`;

const VORT = `${HEAD}
uniform sampler2D uV,uC; uniform vec2 uTx; uniform float uK,uDt;
void main(){
  float l=texture(uC,vUv-vec2(uTx.x,0.)).x,r=texture(uC,vUv+vec2(uTx.x,0.)).x;
  float t=texture(uC,vUv+vec2(0.,uTx.y)).x,b=texture(uC,vUv-vec2(0.,uTx.y)).x,c=texture(uC,vUv).x;
  vec2 f=.5*vec2(abs(t)-abs(b),abs(r)-abs(l));
  f=f/(length(f)+1e-4)*uK*c; f.y=-f.y;
  o=vec4(texture(uV,vUv).xy+f*uDt,0.,1.);
}`;

const DIV = `${HEAD}
uniform sampler2D uV; uniform vec2 uTx;
void main(){
  float l=texture(uV,vUv-vec2(uTx.x,0.)).x,r=texture(uV,vUv+vec2(uTx.x,0.)).x;
  float t=texture(uV,vUv+vec2(0.,uTx.y)).y,b=texture(uV,vUv-vec2(0.,uTx.y)).y;
  o=vec4(.5*(r-l+t-b));
}`;

const PRESS = `${HEAD}
uniform sampler2D uP,uD; uniform vec2 uTx;
void main(){
  float l=texture(uP,vUv-vec2(uTx.x,0.)).x,r=texture(uP,vUv+vec2(uTx.x,0.)).x;
  float t=texture(uP,vUv+vec2(0.,uTx.y)).x,b=texture(uP,vUv-vec2(0.,uTx.y)).x;
  o=vec4((l+r+t+b-texture(uD,vUv).x)*.25);
}`;

const GRAD = `${HEAD}
uniform sampler2D uP,uV; uniform vec2 uTx;
void main(){
  float l=texture(uP,vUv-vec2(uTx.x,0.)).x,r=texture(uP,vUv+vec2(uTx.x,0.)).x;
  float t=texture(uP,vUv+vec2(0.,uTx.y)).x,b=texture(uP,vUv-vec2(0.,uTx.y)).x;
  o=vec4(texture(uV,vUv).xy-vec2(r-l,t-b),0.,1.);
}`;

export function createFluid(gl, { mobile }) {
  // Half-float targets are everywhere WebGL2 is, but not guaranteed. Without them the page still works, the water just ignores your hand.
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;

  const target = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? { tex, fbo, w, h } : null;
  };
  const free = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } };
  const pair = (w, h) => {
    const a = target(w, h), b = target(w, h);
    return a && b ? { read: a, write: b, swap() { const r = this.read; this.read = this.write; this.write = r; } } : null;
  };

  const pAdv = compile(gl, QUAD, ADVECT), pSplat = compile(gl, QUAD, SPLAT), pCurl = compile(gl, QUAD, CURL);
  const pVort = compile(gl, QUAD, VORT), pDiv = compile(gl, QUAD, DIV), pPress = compile(gl, QUAD, PRESS), pGrad = compile(gl, QUAD, GRAD);
  const vao = gl.createVertexArray();

  let vel, dye, press, curl, div, cssW = 1, cssH = 1, tx = [0, 0];
  function size(w, h) {
    if (w === cssW && h === cssH && vel) return true;
    cssW = w; cssH = h;
    [vel?.read, vel?.write, dye?.read, dye?.write, press?.read, press?.write, curl, div].forEach(free);
    const portrait = h > w;
    const dims = (short) => (portrait ? [short, Math.round((short * h) / w)] : [Math.round((short * w) / h), short]);
    const [sw, sh] = dims(mobile ? 52 : 80);
    const [dw, dh] = dims(mobile ? 150 : 240);
    vel = pair(sw, sh); dye = pair(dw, dh); press = pair(sw, sh); curl = target(sw, sh); div = target(sw, sh);
    tx = [1 / sw, 1 / sh];
    return !!(vel && dye && press && curl && div);
  }

  const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
  const draw = (t) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const P = new Float32Array(16), C = new Float32Array(12);
  function splat(field, stirs, color) {
    P.fill(0);
    C.fill(0);
    let any = false;
    stirs.slice(0, 4).forEach((s, i) => {
      const col = color(s);
      if (!col) return;
      any = true;
      P.set([s.x / cssW, 1 - s.y / cssH, s.r, 1], i * 4);
      C.set(col, i * 3);
    });
    if (!any) return;
    gl.useProgram(pSplat.p);
    bind(0, field.read.tex);
    gl.uniform1i(pSplat.u.uS, 0);
    gl.uniform4fv(pSplat.u['uP[0]'], P);
    gl.uniform3fv(pSplat.u['uC[0]'], C);
    gl.uniform2f(pSplat.u.uCss, cssW, cssH);
    draw(field.write);
    field.swap();
  }

  function advect(field, dt, shift, keep, amb, t) {
    gl.useProgram(pAdv.p);
    bind(0, vel.read.tex);
    bind(1, field.read.tex);
    gl.uniform1i(pAdv.u.uV, 0);
    gl.uniform1i(pAdv.u.uS, 1);
    gl.uniform2f(pAdv.u.uCss, cssW, cssH);
    gl.uniform2f(pAdv.u.uShift, 0, shift);
    gl.uniform1f(pAdv.u.uDt, dt);
    gl.uniform1f(pAdv.u.uKeep, keep);
    gl.uniform1f(pAdv.u.uAmb, amb);
    gl.uniform1f(pAdv.u.uT, t);
    draw(field.write);
    field.swap();
  }

  function step({ dt, t, scrolled, stirs, iters }) {
    gl.disable(gl.BLEND);
    gl.bindVertexArray(vao);
    // Scrolling carries the water with the page, or the dye would stay stuck to the glass.
    const shift = -scrolled / cssH;

    splat(vel, stirs, (s) => [s.dx, -s.dy, 0]);
    splat(dye, stirs, (s) => s.c);

    gl.useProgram(pCurl.p);
    bind(0, vel.read.tex);
    gl.uniform1i(pCurl.u.uV, 0);
    gl.uniform2f(pCurl.u.uTx, tx[0], tx[1]);
    draw(curl);

    gl.useProgram(pVort.p);
    bind(0, vel.read.tex);
    bind(1, curl.tex);
    gl.uniform1i(pVort.u.uV, 0);
    gl.uniform1i(pVort.u.uC, 1);
    gl.uniform2f(pVort.u.uTx, tx[0], tx[1]);
    gl.uniform1f(pVort.u.uK, 9);
    gl.uniform1f(pVort.u.uDt, dt);
    draw(vel.write);
    vel.swap();

    gl.useProgram(pDiv.p);
    bind(0, vel.read.tex);
    gl.uniform1i(pDiv.u.uV, 0);
    gl.uniform2f(pDiv.u.uTx, tx[0], tx[1]);
    draw(div);

    gl.useProgram(pPress.p);
    bind(1, div.tex);
    gl.uniform1i(pPress.u.uD, 1);
    gl.uniform1i(pPress.u.uP, 0);
    gl.uniform2f(pPress.u.uTx, tx[0], tx[1]);
    for (let i = 0; i < iters; i++) {
      bind(0, press.read.tex);
      draw(press.write);
      press.swap();
    }

    gl.useProgram(pGrad.p);
    bind(0, press.read.tex);
    bind(1, vel.read.tex);
    gl.uniform1i(pGrad.u.uP, 0);
    gl.uniform1i(pGrad.u.uV, 1);
    gl.uniform2f(pGrad.u.uTx, tx[0], tx[1]);
    draw(vel.write);
    vel.swap();

    advect(vel, dt, shift, Math.pow(0.42, dt), 26, t);
    advect(dye, dt, shift, Math.pow(0.34, dt), 0, t);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  return { size, step, get velTex() { return vel.read.tex; }, get dyeTex() { return dye.read.tex; } };
}
