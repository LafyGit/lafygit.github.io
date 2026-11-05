// The earth behind the page: one WebGL2 canvas fixed over the app stages and under the text.
// Passes per frame: rock (low-res, because it is soft) → composite (crack, sky, water, lamp)
// → roots → dust → the name's particles.

const QUAD = `#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); vUv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

const NOISE = `
// Wrapped first: far down the page raw coordinates lose float precision and the noise turns to stripes.
float h21(vec2 p){ p=mod(p,289.); vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }`;

// Sedimentary beds: horizontal layers bent by domain warping, with fine laminae inside each bed.
const ROCK = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uCss; uniform float uT,uY; uniform vec3 uA,uB,uC,uD;
${NOISE}
float h11(float x){ return fract(sin(x*127.1)*43758.5453); }
void main(){
  vec2 css=vec2(vUv.x*uCss.x,(1.-vUv.y)*uCss.y+uY);
  vec2 p=css/vec2(1500.,520.);
  float t=uT*.006;
  vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3-t)));
  float w=fbm(p*1.5+1.8*q+vec2(1.7,9.2));
  float s=p.y*4.4+1.05*w+.3*q.x;
  float id=floor(s), f=fract(s);
  float bed=h11(id);
  // thin laminae inside each bed, broken up so they never read as wood grain
  float lam=.5+.5*sin(s*31.+9.*vn(p*vec2(1.2,16.)));
  float grit=vn(css/vec2(22.,9.));
  float tone=clamp(bed*.76+lam*.08+grit*.16,0.,1.);
  vec3 col=tone<.4?mix(uA,uB,tone/.4):tone<.72?mix(uB,uC,(tone-.4)/.32):mix(uC,uD,(tone-.72)/.28);
  // dark seams where one bed sits on the next
  col*=.62+.38*smoothstep(0.,.035,f)*smoothstep(1.,.965,f);
  float h=tone*.62+grit*.2-.5*smoothstep(.035,0.,f);
  o=vec4(col,h);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uRock,uFossil;
uniform vec2 uCss,uRockSize,uLamp;
uniform float uT,uScroll,uSurface,uLampAmt,uWaterY,uDawn;
uniform vec4 uHole;   // x:on  y:crack radius  z:bottom edge (page y)  w:seed
uniform vec3 uRim0,uRim1;
uniform vec4 uRipples[6];
${NOISE}
vec2 hash2(vec2 p){ p=mod(p,289.); return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
vec3 vor(vec2 x){ vec2 n=floor(x),f=fract(x); float md=8.; vec2 mid=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j),c=hash2(n+g),r=g+c-f; float d=dot(r,r); if(d<md){md=d;mid=n+g;} }
  return vec3(sqrt(md),mid); }
float ridged(vec2 p){ return 1.-abs(vn(p)*2.-1.); }

// uDawn: 0 is the dusk a first visit sees. Reach the water and come back up, and it is morning.
vec3 sky(vec2 css,float py){
  float k=clamp(py/uSurface,0.,1.);
  vec3 zen=mix(vec3(.05,.07,.17),vec3(.22,.46,.66),uDawn);
  vec3 mid=mix(vec3(.34,.16,.25),vec3(.86,.72,.58),uDawn);
  vec3 hor=mix(vec3(.98,.5,.19),vec3(1.,.8,.5),uDawn);
  vec3 c=mix(zen,mid,smoothstep(.0,.72,k)); c=mix(c,hor,pow(k,3.6));
  vec2 sp=vec2(uCss.x*.7,mix(uSurface*.98,uSurface*.56,uDawn));
  float sd=length(css-sp);
  c+=vec3(1.,.66,.32)*(.55*exp(-sd/70.)+.28*exp(-sd/260.));
  vec2 g=css/2.6; vec2 id=floor(g); float s=h21(id);
  float st=smoothstep(.992,1.,s)*(.55+.45*sin(uT*1.4+s*90.))*smoothstep(1.,.25,k);
  c+=vec3(1.,.95,.86)*st*.28*(1.-uDawn);
  return c;
}

void main(){
  vec2 css=vec2(vUv.x*uCss.x,(1.-vUv.y)*uCss.y);
  float py=css.y+uScroll;
  vec2 pg=vec2(css.x,py);
  vec3 col; float a=1.;

  // Rock, lit by the visitor's lamp.
  vec4 r=texture(uRock,vUv);
  vec2 e=1./uRockSize;
  float hx=texture(uRock,vUv+vec2(e.x,0.)).a-texture(uRock,vUv-vec2(e.x,0.)).a;
  float hy=texture(uRock,vUv-vec2(0.,e.y)).a-texture(uRock,vUv+vec2(0.,e.y)).a;
  vec2 toL=uLamp-css;
  float dl=length(toL);
  float R=max(uCss.x*.27,uCss.y*.36);
  float att=uLampAmt*exp(-(dl*dl)/(R*R));
  vec3 n=normalize(vec3(-hx*3.2,-hy*3.2,1.));
  vec3 L=normalize(vec3(toL,180.));
  float diff=max(dot(n,L),0.);

  // Letters fossilised in the rock. The lamp is the only thing that really shows them.
  vec2 fu=vec2(css.x,css.y+uScroll*.62)/1180.;
  float fe=2./1180.;
  float f0=texture(uFossil,fu).r;
  float fx=texture(uFossil,fu+vec2(fe,fe)).r-texture(uFossil,fu-vec2(fe,fe)).r;
  vec3 lampCol=vec3(1.,.8,.55);
  col=r.rgb*(.74+.18*diff);
  col+=r.rgb*lampCol*att*(.7+2.6*diff*diff);
  float seen=smoothstep(.05,.6,att);
  col*=1.-.5*f0*seen;
  col+=lampCol*att*att*(max(fx,0.)*.5+f0*.035)*seen;

  // A few minerals catch the light.
  float mica=smoothstep(.985,1.,h21(floor(vec2(css.x,css.y+uScroll*.72)/2.)));
  col+=lampCol*mica*att*.9;

  // The surface and the sky above it.
  if(py<uSurface+90.){
    float ridge=uSurface-8.+(fbm(vec2(css.x/360.,3.1))-.5)*44.;
    float far=uSurface-16.+(fbm(vec2(css.x/210.+7.,1.4))-.5)*64.;
    if(py<ridge){
      col=sky(css,py);
      vec3 dune=mix(vec3(.22,.1,.09),vec3(.56,.33,.18),uDawn);
      col=mix(col,dune,smoothstep(far-.8,far+.8,py));
    }
    float lit=smoothstep(ridge+.8,ridge-.8,py);
    float crust=smoothstep(ridge+80.,ridge,py)*(1.-lit);
    col+=mix(vec3(.3,.15,.07),vec3(.42,.24,.1),uDawn)*crust*.5;
  }

  // Groundwater at the bottom of everything.
  if(uWaterY>0.){
    float wob=sin(css.x*.012+uT*.5)*5.+sin(css.x*.031-uT*.8)*2.;
    float wy=uWaterY+wob;
    float glow=exp(-max(wy-py,0.)/170.)*step(py,wy);
    col+=vec3(.05,.42,.46)*glow*.5;
    if(py>wy){
      vec2 w=pg/130.;
      float dist=0.;
      vec2 off=vec2(0.);
      for(int i=0;i<6;i++){
        vec4 rp=uRipples[i];
        if(rp.z<=0.) continue;
        vec2 d=pg-rp.xy; float l=length(d); float age=rp.w;
        float ring=sin(l*.075-age*7.)*exp(-l*.006)*exp(-age*1.05)*rp.z;
        off+=normalize(d+.001)*ring; dist+=ring;
      }
      w+=off*.42;
      float tw=uT*.42;
      vec2 ii=w; float c=1.; const float inten=.0052;
      for(int i=0;i<4;i++){ float tt=tw*(1.-3.5/float(i+1));
        ii=w+vec2(cos(tt-ii.x)+sin(tt+ii.y),sin(tt-ii.y)+cos(tt+ii.x));
        c+=1./length(vec2(w.x/(sin(ii.x+tt)/inten),w.y/(cos(ii.y+tt)/inten))); }
      c/=4.; c=1.17-pow(c,1.4);
      float ca=pow(abs(c),7.);
      float depth=clamp((py-wy)/uCss.y,0.,1.);
      vec3 deep=mix(vec3(.02,.2,.25),vec3(.006,.05,.09),depth);
      col=deep+vec3(.2,.66,.68)*clamp(ca,0.,1.)*(.52-.34*depth);
      col+=vec3(.5,.9,.9)*max(dist,0.)*.28;
      float surf=smoothstep(wy+2.2,wy+.2,py);
      col+=vec3(.75,1.,.97)*surf*.85;
      col+=vec3(.2,.6,.6)*exp(-(py-wy)/60.)*.28;
      col+=lampCol*att*.12;
    }
  }

  // A crack that opens onto an app's world. Alpha goes to 0 inside, so the stage shows through.
  if(uHole.x>.5){
    vec2 c=vec2(uCss.x*.5,uCss.y*.48);
    vec2 q=css-c;
    float rad=uHole.y;
    float big=(ridged(pg/190.+uHole.w)-.6)*min(rad*.42,170.);
    float mid=(ridged(pg/52.+uHole.w*2.)-.6)*min(rad*.18,46.);
    float fine=(ridged(pg/15.+uHole.w)-.6)*min(rad*.08,12.);
    float dC=length(q*vec2(.82,1.))-rad+big+mid+fine;
    // The bottom edge is a mineral vein, so it wanders in 2D and never reads as a plotted line.
    vec2 ep=vec2(css.x,py);
    float wx=(fbm(vec2(ep.x/430.,uHole.w))-.5)*230.+(fbm(ep/vec2(120.,90.)+uHole.w*3.)-.5)*90.+(ridged(ep/vec2(26.,19.)+uHole.w)-.6)*13.;
    float dE=py-uHole.z+wx;
    float d=max(dC,dE);
    float rimW=26.+96.*vn(pg/vec2(240.,190.)+uHole.w);
    if(d>-1.&&d<rimW){
      float u=d/rimW;
      vec3 v=vor(pg/10.5);
      float band=.5+.5*sin(d*.42+7.*vn(pg/70.));
      vec3 rc=mix(uRim0,uRim1,band*band);
      rc*=mix(.5,1.2,h21(v.yz));
      rc+=uRim1*pow(h21(v.yz+7.),14.)*(.6+.4*sin(uT*2.+h21(v.yz)*40.))*1.3;
      col=mix(rc,col,smoothstep(.04,1.,u));
    }
    col+=uRim1*exp(-max(d,0.)/190.)*.32*step(0.,d);
    float alpha=smoothstep(-1.2,1.2,d);
    float inner=smoothstep(-70.,0.,d)*.55*(1.-alpha);
    a=alpha;
    o=vec4(col*a,a)+vec4(0.,0.,0.,inner);
    o.rgb+=(h21(css+uT)-.5)*.018*a;
    o.rgb=clamp(o.rgb,0.,o.a);
    return;
  }
  o=vec4(col+(h21(css+uT)-.5)*.018,1.);
}`;

const ROOT_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP; layout(location=1) in vec2 aN; layout(location=2) in vec4 aI; layout(location=3) in float aS;
uniform vec2 uCss; uniform float uScroll,uFront,uWide,uDimTo;
out float vSide,vAlong,vSeed,vReveal,vW,vDim;
void main(){
  float reveal=smoothstep(0.,70.,uFront-aI.z);
  float w=aI.y*reveal*uWide;
  vec2 p=aP+aN*aI.x*w;
  gl_Position=vec4(p.x/uCss.x*2.-1.,1.-(p.y-uScroll)/uCss.y*2.,0.,1.);
  vSide=aI.x; vAlong=aI.w; vSeed=aS; vReveal=reveal; vW=aI.y; vDim=mix(.2,1.,smoothstep(uDimTo-240.,uDimTo,aP.y));
}`;

const ROOT_F = `#version 300 es
precision highp float;
in float vSide,vAlong,vSeed,vReveal,vW,vDim; out vec4 o;
uniform vec3 uColor; uniform float uT,uGlow,uInk,uPulse;
void main(){
  if(vReveal<=0.001) discard;
  float e=1.-abs(vSide);
  float core=uGlow>0.5?e*e*.13:smoothstep(0.,.75,e);
  float p=pow(.5+.5*sin(vAlong*.013-uT*1.5+vSeed*6.283),30.);
  float tone=.34+.3*clamp(vW/2.4,0.,1.)+uPulse*.6;
  vec3 c=uColor*(tone+p*2.2);
  float i=core*vReveal*vDim;
  vec3 rgb=c*i;
  // Light over the canvas, or ink on the paper world. Alpha must cover the colour either way, or Safari speckles it.
  float light=max(rgb.r,max(rgb.g,rgb.b));
  o=vec4(rgb,mix(light,uGlow>0.5?0.:i,uInk));
}`;

const DUST_V = `#version 300 es
precision highp float;
layout(location=0) in vec4 aR;
uniform vec2 uCss,uLamp; uniform float uScroll,uT,uVel,uPx;
out float vA;
void main(){
  float depth=.25+aR.z*.9;
  float x=aR.x*uCss.x+sin(uT*.13+aR.w*20.)*22.;
  float y=mod(aR.y*uCss.y*1.4-uScroll*depth*.8-uT*(3.+aR.w*5.),uCss.y*1.4)-uCss.y*.2;
  float dl=length(vec2(x,y)-uLamp);
  float lit=exp(-dl/230.);
  gl_Position=vec4(x/uCss.x*2.-1.,1.-y/uCss.y*2.,0.,1.);
  gl_PointSize=(1.+aR.z*2.)*uPx*(1.+min(abs(uVel)*.02,1.2));
  vA=(.07+.2*aR.w+.75*lit)*(.6+.4*sin(uT*.9+aR.w*30.));
}`;

const DUST_F = `#version 300 es
precision mediump float;
in float vA; out vec4 o; uniform vec3 uColor;
void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.1,d)*vA; vec3 rgb=uColor*a; o=vec4(rgb,max(rgb.r,max(rgb.g,rgb.b))); }`;

const NAME_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aHome; layout(location=1) in vec4 aR;
uniform vec2 uCss,uMouse,uDrain; uniform vec4 uBox; // box: left,top,width,height (page px)
uniform float uT,uIntro,uMelt,uScroll,uMouseAmt,uPx,uReform,uWaterY;
out float vA; out float vH;
float eo(float x){ return 1.-pow(1.-x,3.); }
void main(){
  vec2 home=uBox.xy+aHome*uBox.zw;
  // Arabic is written from the right, so the name arrives from the right.
  float dly=(1.-aHome.x)*.55+aR.x*.22;
  float i=eo(clamp((uIntro-dly)/.5,0.,1.)); // uIntro runs to 1.3, so the last grain lands too
  vec2 from=home+vec2((aR.y-.5)*90.,-160.-aR.z*340.);
  vec2 p=mix(from,home,i);
  float an=aR.w*6.283+uT*.55;
  p+=vec2(cos(an),sin(an*1.3))*(.5+1.4*aR.x);

  vec2 mm=uMouse+vec2(0.,uScroll);
  vec2 dm=p-mm; float r2=dot(dm,dm); float rr=uBox.w*.14+50.;
  float f=exp(-r2/(2.*rr*rr))*uMouseAmt;
  p+=normalize(dm+.001)*f*(26.+64.*aR.y);
  p+=vec2(-dm.y,dm.x)/max(sqrt(r2),1.)*f*(14.+24.*aR.z);

  // The name melts into the taproot as you dig.
  float m=clamp(uMelt*(1.5+aR.x*.5)-aR.y*.5-(aHome.y*.3),0.,1.); m=m*m*(3.-2.*m);
  vec2 dr=uDrain+vec2((aR.z-.5)*(70.*(1.-m)+6.),aR.x*760.*m*m);
  dr.x+=sin(aR.w*40.+uT*2.+m*5.)*16.*(1.-m);
  p=mix(p,dr,m);

  // At the very bottom the same grains rise and settle as a reflection in the water.
  float back=0.;
  if(uReform>0.){
    float rd=clamp(uReform*1.6-aR.y*.6,0.,1.); rd=rd*rd*(3.-2.*rd);
    vec2 refl=vec2(uCss.x*.5+(aHome.x-.5)*uBox.z,uWaterY+18.+(1.-aHome.y)*uBox.w*.62);
    refl.x+=sin(refl.y*.05+uT*1.4)*(2.+(1.-aHome.y)*8.);
    vec2 start=refl+vec2((aR.z-.5)*300.,160.+aR.x*420.);
    p=mix(start,refl,rd); back=rd;
  }
  gl_Position=vec4(p.x/uCss.x*2.-1.,1.-(p.y-uScroll)/uCss.y*2.,0.,1.);
  gl_PointSize=(1.25+1.55*aR.y)*uPx*(1.+.9*f);
  float aa=i*(1.-smoothstep(.72,1.,m))*(.9+.1*aR.x);
  vA=uReform>0.?back*(.34+.3*aR.x):aa;
  vH=aR.z+f;
}`;

const NAME_F = `#version 300 es
precision mediump float;
in float vA,vH; out vec4 o; uniform vec3 uC0,uC1;
void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.25,d)*vA; vec3 c=mix(uC0,uC1,clamp(vH,0.,1.))*a; o=vec4(c,max(c.r,max(c.g,c.b))); }`;

function compile(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = gl.getUniformLocation(p, k))) });
  return { p, u };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// anchors: [{ y, x (0..1), rich (0..1) }] sorted by y. Returns interleaved verts + indices.
export function buildRoots({ width, height, anchors, startX, startY, density }) {
  const R = rng(1142);
  const verts = [];
  const idx = [];
  let vCount = 0;

  const addPath = (pts, seed) => {
    if (pts.length < 2) return;
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (i) along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const p = pts[i];
      for (const side of [-1, 1]) verts.push(p.x, p.y, nx, ny, side, p.w, p.g, along, seed);
      if (i) {
        const v = vCount + i * 2;
        idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
      }
    }
    vCount += pts.length * 2;
  };

  const anchorX = (y) => {
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i].y) {
        const a = anchors[i - 1];
        const b = anchors[i];
        let t = (y - a.y) / Math.max(1, b.y - a.y);
        t = t * t * (3 - 2 * t);
        return { x: a.x + (b.x - a.x) * t, rich: a.rich + (b.rich - a.rich) * t };
      }
    }
    const last = anchors[anchors.length - 1];
    return { x: last.x, rich: last.rich };
  };

  const branch = (x, y, angle, len, w, g, depth) => {
    const pts = [];
    const step = 11;
    let a = angle;
    let travelled = 0;
    while (travelled < len) {
      const k = travelled / len;
      pts.push({ x, y, w: w * (1 - k * 0.92), g: g + travelled * 0.7 });
      a += (R() - 0.5) * 0.42 + (Math.PI / 2 - a) * 0.018;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      travelled += step;
      if (depth < 3 && pts.length > 5 && R() < 0.028 + 0.012 * (2 - depth)) {
        const dir = R() < 0.5 ? -1 : 1;
        branch(x, y, a + dir * (0.45 + R() * 0.7), (len - travelled) * (0.35 + R() * 0.45), w * (1 - k * 0.92) * 0.7, g + travelled * 0.7, depth + 1);
      }
      if (x < -80 || x > width + 80 || y > height) break;
    }
    addPath(pts, R());
  };

  // Taproot, with branches thrown off it. Rich stretches (the rock between worlds) get more.
  const tap = [];
  const n1 = R() * 100;
  let nextBranch = startY + 40;
  let side = 1;
  for (let y = startY; y < height; y += 13) {
    const { x: ax, rich } = anchorX(y);
    const wobble =
      Math.sin(y * 0.0041 + n1) * 34 + Math.sin(y * 0.0113 + n1 * 2) * 15 + Math.sin(y * 0.031 + n1 * 3) * 5;
    const scale = Math.min(1, width / 900);
    const x = (y < startY + 300 ? startX + ((ax * width - startX) * Math.pow((y - startY) / 300, 2)) : ax * width) + wobble * scale;
    const w = Math.min(2.5, 1.1 + (y - startY) / 900) - 0.9 * (y / height);
    tap.push({ x, y, w, g: y });
    if (y >= nextBranch) {
      side = -side;
      const reach = (260 + R() * 640) * (0.35 + rich * 0.85) * (0.55 + 0.45 * scale);
      branch(x, y, Math.PI / 2 + side * (0.5 + R() * 0.75), reach, (0.7 + R() * 0.9) * (0.7 + 0.5 * rich), y, 1);
      nextBranch = y + ((70 + R() * 110) / density) / (0.3 + rich);
    }
  }
  addPath(tap, 0.31);

  const tapAt = (y) => tap[Math.max(0, Math.min(tap.length - 1, Math.round((y - startY) / 13)))].x;
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx), tapAt };
}

export function createWorld(canvas, { mobile }) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: !mobile, powerPreference: 'high-performance' });
  if (!gl) return null;

  const pRock = compile(gl, QUAD, ROCK);
  const pComp = compile(gl, QUAD, COMPOSITE);
  const pRoot = compile(gl, ROOT_V, ROOT_F);
  const pDust = compile(gl, DUST_V, DUST_F);
  const pName = compile(gl, NAME_V, NAME_F);
  const emptyVAO = gl.createVertexArray();

  const rockTex = gl.createTexture();
  const rockFbo = gl.createFramebuffer();
  const fossilTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fossilTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

  let cssW = 1, cssH = 1, dpr = 1, rockW = 1, rockH = 1, quality = 0;

  function resize() {
    cssW = canvas.clientWidth || innerWidth;
    cssH = canvas.clientHeight || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, [mobile ? 1.6 : 1.75, 1.25, 1][quality]);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    // Setting a canvas size clears it, so a no-op resize would flash a blank frame.
    if (canvas.width === w && canvas.height === h && rockW > 2) return;
    canvas.width = w;
    canvas.height = h;
    rockW = Math.max(2, Math.round(cssW * (mobile ? 0.34 : 0.4)));
    rockH = Math.max(2, Math.round(cssH * (mobile ? 0.34 : 0.4)));
    gl.bindTexture(gl.TEXTURE_2D, rockTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rockW, rockH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rockFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rockTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  resize();

  // Roots
  const rootVAO = gl.createVertexArray();
  const rootVB = gl.createBuffer();
  const rootIB = gl.createBuffer();
  let rootCount = 0;
  function setRoots({ verts, idx }) {
    gl.bindVertexArray(rootVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, rootVB);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rootIB);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
    gl.bindVertexArray(null);
    rootCount = idx.length;
  }

  // Dust
  const dustN = mobile ? 180 : 420;
  const dustVAO = gl.createVertexArray();
  {
    const R = rng(77);
    const d = new Float32Array(dustN * 4).map(() => R());
    gl.bindVertexArray(dustVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // The name
  const nameVAO = gl.createVertexArray();
  const nameVB = gl.createBuffer();
  let nameN = 0;
  function setName(points) {
    const R = rng(9);
    const n = points.length / 2;
    const data = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      data.set([points[i * 2], points[i * 2 + 1], R(), R(), R(), R()], i * 6);
    }
    gl.bindVertexArray(nameVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, nameVB);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);
    nameN = n;
  }

  function setFossils(source) {
    gl.bindTexture(gl.TEXTURE_2D, fossilTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  const ripples = new Float32Array(24);
  let rippleI = 0;
  function addRipple(x, pageY, strength = 1) {
    ripples.set([x, pageY, strength, 0], rippleI * 4);
    rippleI = (rippleI + 1) % 6;
  }

  // s: scroll, vel, time, lampX/Y/Amt, mouse, front, surface, hole, palette, rootColor, rootInk, name…
  function render(s) {
    gl.disable(gl.BLEND);
    gl.bindVertexArray(emptyVAO);

    const needRock = !s.fullyOpen;
    if (needRock) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rockFbo);
      gl.viewport(0, 0, rockW, rockH);
      gl.useProgram(pRock.p);
      gl.uniform2f(pRock.u.uCss, cssW, cssH);
      gl.uniform1f(pRock.u.uT, s.t);
      gl.uniform1f(pRock.u.uY, s.scroll * 0.72);
      gl.uniform3fv(pRock.u.uA, s.pal[0]);
      gl.uniform3fv(pRock.u.uB, s.pal[1]);
      gl.uniform3fv(pRock.u.uC, s.pal[2]);
      gl.uniform3fv(pRock.u.uD, s.pal[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    if (needRock) {
      for (let i = 0; i < 6; i++) {
        if (ripples[i * 4 + 2] > 0) {
          ripples[i * 4 + 3] += s.dt;
          if (ripples[i * 4 + 3] > 5) ripples[i * 4 + 2] = 0;
        }
      }
      gl.useProgram(pComp.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rockTex);
      gl.uniform1i(pComp.u.uRock, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fossilTex);
      gl.uniform1i(pComp.u.uFossil, 1);
      gl.uniform2f(pComp.u.uCss, cssW, cssH);
      gl.uniform2f(pComp.u.uRockSize, rockW, rockH);
      gl.uniform2f(pComp.u.uLamp, s.lampX, s.lampY);
      gl.uniform1f(pComp.u.uLampAmt, s.lampAmt);
      gl.uniform1f(pComp.u.uT, s.t);
      gl.uniform1f(pComp.u.uScroll, s.scroll);
      gl.uniform1f(pComp.u.uSurface, s.surface);
      gl.uniform1f(pComp.u.uWaterY, s.waterVisible ? s.waterY : 0);
      gl.uniform1f(pComp.u.uDawn, s.dawn);
      gl.uniform4f(pComp.u.uHole, s.hole ? 1 : 0, s.hole ? s.hole.r : 0, s.hole ? s.hole.bottom : 0, s.hole ? s.hole.seed : 0);
      gl.uniform3fv(pComp.u.uRim0, s.hole ? s.hole.rim0 : [0, 0, 0]);
      gl.uniform3fv(pComp.u.uRim1, s.hole ? s.hole.rim1 : [0, 0, 0]);
      gl.uniform4fv(pComp.u['uRipples[0]'], ripples);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (rootCount) {
      gl.useProgram(pRoot.p);
      gl.bindVertexArray(rootVAO);
      gl.uniform2f(pRoot.u.uCss, cssW, cssH);
      gl.uniform1f(pRoot.u.uScroll, s.scroll);
      gl.uniform1f(pRoot.u.uFront, s.front);
      gl.uniform1f(pRoot.u.uDimTo, s.dimTo);
      gl.uniform1f(pRoot.u.uT, s.t);
      gl.uniform1f(pRoot.u.uInk, s.rootInk);
      gl.uniform1f(pRoot.u.uPulse, s.pulse);
      gl.uniform3fv(pRoot.u.uColor, s.rootColor);
      gl.uniform1f(pRoot.u.uGlow, 1);
      gl.uniform1f(pRoot.u.uWide, 7);
      if (s.rootInk < 0.5 && quality < 2) gl.drawElements(gl.TRIANGLES, rootCount, gl.UNSIGNED_INT, 0);
      gl.uniform1f(pRoot.u.uGlow, 0);
      gl.uniform1f(pRoot.u.uWide, 1);
      gl.drawElements(gl.TRIANGLES, rootCount, gl.UNSIGNED_INT, 0);
    }

    gl.useProgram(pDust.p);
    gl.bindVertexArray(dustVAO);
    gl.uniform2f(pDust.u.uCss, cssW, cssH);
    gl.uniform2f(pDust.u.uLamp, s.lampX, s.lampY);
    gl.uniform1f(pDust.u.uScroll, s.scroll);
    gl.uniform1f(pDust.u.uT, s.t);
    gl.uniform1f(pDust.u.uVel, s.vel);
    gl.uniform1f(pDust.u.uPx, dpr);
    gl.uniform3fv(pDust.u.uColor, s.dustColor);
    gl.drawArrays(gl.POINTS, 0, dustN);

    if (nameN && s.nameVisible) {
      gl.useProgram(pName.p);
      gl.bindVertexArray(nameVAO);
      gl.uniform2f(pName.u.uCss, cssW, cssH);
      gl.uniform2f(pName.u.uMouse, s.mouseX, s.mouseY);
      gl.uniform2f(pName.u.uDrain, s.drainX, s.drainY);
      gl.uniform4f(pName.u.uBox, s.box.x, s.box.y, s.box.w, s.box.h);
      gl.uniform1f(pName.u.uT, s.t);
      gl.uniform1f(pName.u.uIntro, s.intro);
      gl.uniform1f(pName.u.uMelt, s.melt);
      gl.uniform1f(pName.u.uScroll, s.scroll);
      gl.uniform1f(pName.u.uMouseAmt, s.mouseAmt);
      gl.uniform1f(pName.u.uPx, dpr);
      gl.uniform1f(pName.u.uReform, s.reform);
      gl.uniform1f(pName.u.uWaterY, s.waterY);
      gl.uniform3fv(pName.u.uC0, s.reform > 0 ? [0.55, 0.9, 0.88] : [1.0, 0.79, 0.45]);
      gl.uniform3fv(pName.u.uC1, s.reform > 0 ? [0.92, 1.0, 0.96] : [1.0, 0.93, 0.76]);
      gl.drawArrays(gl.POINTS, 0, nameN);
    }
    gl.bindVertexArray(null);
  }

  // Slow phone? Trade resolution for smooth scrolling. Only ever steps down.
  function lowerQuality() {
    if (quality >= 2) return false;
    quality++;
    resize();
    return true;
  }

  return { gl, resize, setRoots, setName, setFossils, addRipple, render, lowerQuality };
}
