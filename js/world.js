// The earth and the sky behind the page: one WebGL2 canvas fixed over the app stages and under the text.
// Passes per frame: rock and nebula (low-res, because they are soft) → composite (crack, deep space,
// water, lamp) → roots → star nodes → drifting stars → the name's particles.

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
uniform vec2 uCss; uniform float uT,uY,uCosmic; uniform vec3 uA,uB,uC,uD;
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
  float wisp=0.,cl=0.;
  // The deeper you dig, the more the beds let go: rock thins into clouds of gas and dust.
  if(uCosmic>.001){
    vec2 pc=css/860.;
    vec2 qc=vec2(fbm(pc+vec2(t*1.4,2.)),fbm(pc+vec2(6.1,-t*1.1)));
    cl=fbm(pc*1.5+2.5*qc+vec2(4.,t));
    wisp=pow(1.-abs(2.*fbm(pc*2.6+1.7*qc+vec2(t,7.))-1.),6.);
    tone=mix(tone,clamp(cl*cl*2.1+wisp*.4,0.,1.),uCosmic);
  }
  vec3 col=tone<.4?mix(uA,uB,tone/.4):tone<.72?mix(uB,uC,(tone-.4)/.32):mix(uC,uD,(tone-.72)/.28);
  // dark seams where one bed sits on the next
  col*=mix(.62+.38*smoothstep(0.,.035,f)*smoothstep(1.,.965,f),1.,uCosmic);
  col+=uD*wisp*.2*uCosmic;
  float h=mix(tone*.62+grit*.2-.5*smoothstep(.035,0.,f),.5+cl*.1,uCosmic);
  o=vec4(col,h);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uRock,uFossil,uChart;
uniform vec2 uCss,uRockSize,uLamp;
uniform float uT,uScroll,uSurface,uLampAmt,uWaterY,uBloom,uCosmic,uSunX;
uniform vec3 uPlanet; // x, y, radius in px
uniform vec4 uHole;   // x:on  y:crack radius  z:bottom edge (page y)  w:seed
uniform vec3 uRim0,uRim1;
uniform vec4 uRipples[6];
${NOISE}
vec2 hash2(vec2 p){ p=mod(p,289.); return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
vec3 vor(vec2 x){ vec2 n=floor(x),f=fract(x); float md=8.; vec2 mid=vec2(0.);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j),c=hash2(n+g),r=g+c-f; float d=dot(r,r); if(d<md){md=d;mid=n+g;} }
  return vec3(sqrt(md),mid); }
float ridged(vec2 p){ return 1.-abs(vn(p)*2.-1.); }

// One layer of stars: at most one per cell, at a random spot, with its own twinkle.
float starLayer(vec2 p,float cell,float density,float size){
  vec2 g=p/cell, id=floor(g), f=fract(g);
  float h=h21(id);
  if(h>density) return 0.;
  vec2 c=hash2(id+11.)*.8+.1;
  float d=length((f-c)*cell);
  float tw=.62+.38*sin(uT*(.8+h*40.)+h*300.);
  return smoothstep(size,size*.25,d)*tw*(.4+.6*h/density);
}

// A streak every so often. Each one lives for the first 12% of its period.
float meteor(vec2 css,float seed,float period){
  float t=uT/period+seed, id=floor(t), f=fract(t);
  if(f>.12) return 0.;
  float u=f/.12;
  vec2 a=vec2(h21(vec2(id,seed))*uCss.x,h21(vec2(seed,id+3.))*uSurface*.62);
  vec2 dir=normalize(vec2(h21(vec2(id,9.))>.5?1.:-1.,.5+h21(vec2(id,4.))*.3));
  float len=min(uCss.x*.2,240.);
  vec2 head=a+dir*len*1.5*u;
  vec2 ba=dir*len*.7, pa=css-(head-ba);
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return smoothstep(1.7,0.,length(pa-ba*h))*h*h*sin(u*3.1416);
}

// A ringed planet, lit from the side by the sun low on the horizon.
vec3 planet(vec3 c,vec2 css){
  vec2 pc=vec2(uPlanet.x,uPlanet.y-uScroll*.42);
  vec2 q=(css-pc)/uPlanet.z;
  float r2=dot(q,q);
  if(r2>6.) return c;
  float ca=cos(-.38),sa=sin(-.38);
  vec2 t=vec2(ca*q.x-sa*q.y,sa*q.x+ca*q.y);
  vec3 L=normalize(vec3(.72,.52,.46));
  float ringR=length(vec2(t.x,t.y/.27));
  float rtex=clamp(.55+.3*sin(ringR*38.)+.15*sin(ringR*91.),0.,1.);
  float gap=1.-.85*smoothstep(1.66,1.68,ringR)*smoothstep(1.76,1.74,ringR);
  float ring=smoothstep(1.36,1.39,ringR)*smoothstep(2.08,2.02,ringR)*gap*(.14+.46*rtex);
  // The planet's shadow falls across the far side of the ring.
  vec2 lx=normalize(L.xy);
  float side=dot(q,lx), perp=abs(dot(q,vec2(-lx.y,lx.x)));
  float shade=mix(1.,smoothstep(.82,1.05,perp),smoothstep(.1,-.25,side));
  vec3 ringC=mix(vec3(.5,.4,.42),vec3(.98,.84,.68),rtex)*(.2+.8*shade);
  if(t.y<0.) c=mix(c,ringC,ring);
  float rr=sqrt(r2);
  if(rr<1.){
    float z=sqrt(1.-r2);
    vec3 n=vec3(q,z);
    float d=max(dot(n,L),0.);
    float lat=t.y*3.3+.5*fbm(vec2(t.x*1.1,t.y*7.)+4.);
    vec3 alb=mix(vec3(.36,.26,.4),vec3(.78,.56,.42),.5+.5*sin(lat*3.3));
    alb=mix(alb,vec3(.92,.78,.62),smoothstep(.6,1.,.5+.5*sin(lat*8.3+1.))*.32);
    vec3 body=alb*(pow(d,.85)*1.05+.01)+vec3(.45,.6,1.)*pow(1.-z,2.4)*smoothstep(-.05,.4,d)*.75;
    c=mix(c,body,smoothstep(1.,.975,rr));
  } else {
    c+=vec3(.32,.42,.95)*exp(-(rr-1.)*8.)*.2*max(dot(normalize(vec3(q,.3)),L),0.);
  }
  if(t.y>=0.) c=mix(c,ringC,ring);
  return c;
}

// Space, with a thin burn of dusk at the very bottom. uBloom: reach the water and come back up,
// and the sun has gone, the galaxy is brighter, the aurora is out and the meteors come faster.
vec3 sky(vec2 css,float py,float att){
  float k=clamp(py/uSurface,0.,1.);
  vec2 sp=vec2(css.x,css.y+uScroll*.18);
  vec3 c=mix(vec3(.006,.008,.03),vec3(.035,.022,.085),smoothstep(.1,.72,k));
  c=mix(c,mix(vec3(.2,.06,.2),vec3(.03,.06,.14),uBloom),smoothstep(.6,.9,k));
  c=mix(c,mix(vec3(.97,.44,.16),vec3(.05,.3,.32),uBloom),smoothstep(.87,1.,k)*(.3+.7*smoothstep(.94,1.,k)));
  // far nebulae
  c+=vec3(.2,.05,.27)*pow(fbm(sp/420.+9.),3.)*.9*smoothstep(1.,.5,k);
  c+=vec3(.03,.15,.22)*pow(fbm(sp/360.+21.),3.)*.9*smoothstep(1.,.5,k);
  // the Milky Way: a long diagonal band that leans over the palm, cut by dark dust lanes
  vec2 dir=normalize(vec2(1.,-.6)), nrm=vec2(-dir.y,dir.x);
  vec2 rel=sp-vec2(uSunX,uSurface*.86);
  float along=dot(rel,dir), across=dot(rel,nrm);
  float wid=max(uCss.x,uCss.y)*.125;
  float warp=(fbm(sp/250.)-.5)*wid*1.15;
  float band=exp(-pow((across+warp)/wid,2.));
  float detail=fbm(sp/85.+3.);
  float lanes=smoothstep(.42,.66,fbm(vec2(along/210.,(across+warp)/34.)));
  float core=exp(-pow(along/(uCss.x*.4),2.));
  float glow=band*(.3+.7*detail)*(1.-.74*lanes*smoothstep(.2,.8,band));
  c+=mix(vec3(.15,.2,.44),vec3(.72,.5,.44),core*detail)*glow*(.42+.55*core)*(1.+.9*uBloom)*smoothstep(1.,.66,k);
  // stars, thicker inside the band
  float fade=smoothstep(1.,.72,k);
  float s=starLayer(sp,5.,.2+.38*band,1.05)*.9+starLayer(sp+17.,17.,.16,1.5)+starLayer(sp+41.,61.,.26,2.5)*1.4;
  float halo=starLayer(sp+41.,61.,.26,10.)*.16;
  c+=vec3(.86,.9,1.)*(s+halo)*fade*(.8+.2*uBloom);
  c=planet(c,css);
  // named stars are always there; their lines and names come out under the lamp
  vec3 ch=texture(uChart,vec2(css.x/uCss.x,(css.y+uScroll*.18)/uSurface)).rgb;
  c+=vec3(.96,.98,1.)*ch.r*fade;
  c+=vec3(.6,.78,1.)*ch.g*fade*(.05+smoothstep(.04,.5,att)*.95);
  c+=vec3(.16,.18,.3)*att*att*.22*fade;
  // the sun going down behind the palm
  float sd=length(css-vec2(uSunX,uSurface*.99));
  c+=vec3(1.,.62,.3)*(.6*exp(-sd/62.)+.3*exp(-sd/230.))*(1.-uBloom);
  // aurora, once the palm has been watered
  if(uBloom>.001){
    float x=css.x/170.;
    float cur=pow(fbm(vec2(x+uT*.06,uT*.03)),1.5);
    float fold=.5+.5*sin(x*5.+fbm(vec2(x*.7,uT*.08))*9.);
    float rangeY=smoothstep(.97,.6,k)*smoothstep(.2,.6,k);
    c+=mix(vec3(.08,.95,.58),vec3(.48,.22,.9),smoothstep(.72,.32,k))*cur*fold*rangeY*.62*uBloom;
  }
  float m=meteor(css,.13,7.)+meteor(css,.61,11.);
  if(uBloom>.5) m+=meteor(css,.37,2.3)+meteor(css,.83,3.1);
  c+=vec3(.92,.96,1.)*m;
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
  vec3 lampCol=mix(vec3(1.,.8,.55),vec3(.66,.74,1.),uCosmic);
  col=r.rgb*(.74+.18*diff);
  col+=r.rgb*lampCol*att*(mix(.7,.28,uCosmic)+mix(2.6,.42,uCosmic)*diff*diff);
  float seen=smoothstep(.05,.6,att);
  // Embossed in rock; further down the same letters glow, like something written in the dark.
  col*=1.-mix(.5,.08,uCosmic)*f0*seen;
  col+=lampCol*att*att*(max(fx,0.)*.5+f0*mix(.035,.22,uCosmic))*seen;

  // Stars come through as the rock thins out.
  if(uCosmic>.001){
    vec2 sp=vec2(css.x,css.y+uScroll*.3);
    float st=starLayer(sp,7.,.15,1.05)+starLayer(sp+29.,23.,.11,1.6)*1.2+starLayer(sp+53.,83.,.2,2.7)*1.5+starLayer(sp+53.,83.,.2,11.)*.12;
    col+=vec3(.86,.9,1.)*st*uCosmic;
  }

  // A few minerals catch the light.
  float mica=smoothstep(.985,1.,h21(floor(vec2(css.x,css.y+uScroll*.72)/2.)));
  col+=lampCol*mica*att*.9;

  // The surface and the sky above it.
  if(py<uSurface+90.){
    float near=exp(-pow((css.x-uSunX)/95.,2.));
    // The ground runs level under the palm, so it always has something to stand on.
    float ridge=mix(uSurface-8.+(fbm(vec2(css.x/360.,3.1))-.5)*44.,uSurface-1.,near);
    float far=mix(uSurface-16.+(fbm(vec2(css.x/210.+7.,1.4))-.5)*64.,uSurface-9.,near);
    if(py<ridge){
      col=sky(css,py,att);
      vec3 dune=mix(vec3(.17,.07,.08),vec3(.015,.03,.05),uBloom);
      col=mix(col,dune,smoothstep(far-.8,far+.8,py));
    }
    float lit=smoothstep(ridge+.8,ridge-.8,py);
    float crust=smoothstep(ridge+80.,ridge,py)*(1.-lit);
    col+=mix(vec3(.3,.15,.07),vec3(.03,.09,.1),uBloom)*crust*.5;
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
      vec2 ws=vec2(css.x+sin(py*.03+uT)*3.,css.y+uScroll*.3);
      col+=vec3(.72,.96,1.)*(starLayer(ws,9.,.16,1.2)+starLayer(ws+31.,37.,.14,2.)*1.3)*(.8-.5*depth);
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
    col+=uRim1*exp(-max(d,0.)/mix(190.,320.,uCosmic))*mix(.32,.5,uCosmic)*step(0.,d);
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
out float vA,vR,vTint;
void main(){
  float depth=.25+aR.z*.9;
  float x=aR.x*uCss.x+sin(uT*.1+aR.w*20.)*14.;
  float y=mod(aR.y*uCss.y*1.4-uScroll*depth*.8-uT*(2.+aR.w*4.),uCss.y*1.4)-uCss.y*.2;
  float lit=exp(-length(vec2(x,y)-uLamp)/230.);
  // Scroll fast and the nearer stars stretch into warp streaks.
  float stretch=1.+min(abs(uVel)*.2*depth,24.);
  gl_Position=vec4(x/uCss.x*2.-1.,1.-y/uCss.y*2.,0.,1.);
  gl_PointSize=(1.+aR.z*1.9)*uPx*stretch;
  vR=1./stretch;
  vTint=aR.w;
  vA=(.16+.34*aR.w+.6*lit)*(.6+.4*sin(uT*.9+aR.w*30.));
}`;

const DUST_F = `#version 300 es
precision mediump float;
in float vA,vR,vTint; out vec4 o; uniform vec3 uColor;
void main(){
  vec2 q=(gl_PointCoord-.5)*2.; q.x/=vR;
  float a=smoothstep(1.,.1,length(q))*vA;
  vec3 tint=vTint>.72?vec3(1.,.86,.72):vTint<.3?vec3(.72,.82,1.):vec3(1.);
  vec3 rgb=uColor*tint*a;
  o=vec4(rgb,max(rgb.r,max(rgb.g,rgb.b)));
}`;

// Stars at the forks of the roots. The web underground and the web of galaxies look alike, so let them.
const NODE_V = `#version 300 es
precision highp float;
layout(location=0) in vec4 aN; // x, y, growth, seed
uniform vec2 uCss; uniform float uScroll,uFront,uT,uPx,uDimTo;
out float vA;
void main(){
  float rev=smoothstep(30.,140.,uFront-aN.z);
  gl_Position=vec4(aN.x/uCss.x*2.-1.,1.-(aN.y-uScroll)/uCss.y*2.,0.,1.);
  float tw=.55+.45*sin(uT*(.7+aN.w*2.4)+aN.w*60.);
  gl_PointSize=(6.+aN.w*11.)*uPx*(.6+.4*tw)*rev;
  vA=rev*tw*mix(.25,1.,smoothstep(uDimTo-240.,uDimTo,aN.y));
}`;

const NODE_F = `#version 300 es
precision mediump float;
in float vA; out vec4 o; uniform vec3 uColor; uniform float uInk;
void main(){
  vec2 q=(gl_PointCoord-.5)*2.; float d=dot(q,q);
  float cross=max(0.,1.-abs(q.x)*13.)*max(0.,1.-abs(q.y))+max(0.,1.-abs(q.y)*13.)*max(0.,1.-abs(q.x));
  float a=min(1.,(exp(-d*30.)+.2*exp(-d*5.)+.3*cross)*vA);
  vec3 c=mix(mix(uColor,vec3(1.),.6),uColor,uInk);
  vec3 rgb=c*a;
  o=vec4(rgb,mix(max(rgb.r,max(rgb.g,rgb.b)),a,uInk));
}`;

const NAME_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aHome; layout(location=1) in vec4 aR;
uniform vec2 uCss,uMouse,uDrain; uniform vec4 uBox; // box: left,top,width,height (page px)
uniform float uT,uIntro,uMelt,uScroll,uMouseAmt,uPx,uReform,uWaterY;
out float vA,vH,vCool;
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
  // Most grains are dust; a few are real stars.
  gl_PointSize=(1.15+1.4*aR.y+step(.982,aR.x)*3.2)*uPx*(1.+.9*f);
  float aa=i*(1.-smoothstep(.72,1.,m))*(.9+.1*aR.x);
  float tw=.8+.2*sin(uT*(1.1+2.8*aR.z)+aR.w*50.);
  vA=uReform>0.?back*(.34+.3*aR.x):aa*tw;
  vH=aR.z+f;
  vCool=step(.84,aR.w);
}`;

const NAME_F = `#version 300 es
precision mediump float;
in float vA,vH,vCool; out vec4 o; uniform vec3 uC0,uC1;
void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.25,d)*vA; vec3 c=mix(mix(uC0,uC1,clamp(vH,0.,1.)),vec3(.74,.85,1.),vCool*.8)*a; o=vec4(c,max(c.r,max(c.g,c.b))); }`;

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
  const nodes = [];
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
    if (R() < 0.6) nodes.push(x, y, g, R());
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
    if (pts.length > 4) { const tip = pts[pts.length - 1]; nodes.push(tip.x, tip.y, tip.g, R()); }
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
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx), nodes: new Float32Array(nodes), tapAt };
}

export function createWorld(canvas, { mobile }) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: !mobile, powerPreference: 'high-performance' });
  if (!gl) return null;

  const pRock = compile(gl, QUAD, ROCK);
  const pComp = compile(gl, QUAD, COMPOSITE);
  const pRoot = compile(gl, ROOT_V, ROOT_F);
  const pDust = compile(gl, DUST_V, DUST_F);
  const pName = compile(gl, NAME_V, NAME_F);
  const pNode = compile(gl, NODE_V, NODE_F);
  const emptyVAO = gl.createVertexArray();

  const rockTex = gl.createTexture();
  const rockFbo = gl.createFramebuffer();
  const fossilTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fossilTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  const chartTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, chartTex);
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
  const nodeVAO = gl.createVertexArray();
  const nodeVB = gl.createBuffer();
  let nodeN = 0;
  function setRoots({ verts, idx, nodes }) {
    gl.bindVertexArray(nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeVB);
    gl.bufferData(gl.ARRAY_BUFFER, nodes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    nodeN = nodes.length / 4;
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
  const dustN = mobile ? 380 : 900;
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

  function setChart(source) {
    gl.bindTexture(gl.TEXTURE_2D, chartTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
      gl.uniform1f(pRock.u.uCosmic, s.cosmic);
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
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, chartTex);
      gl.uniform1i(pComp.u.uChart, 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(pComp.u.uCss, cssW, cssH);
      gl.uniform2f(pComp.u.uRockSize, rockW, rockH);
      gl.uniform2f(pComp.u.uLamp, s.lampX, s.lampY);
      gl.uniform1f(pComp.u.uLampAmt, s.lampAmt);
      gl.uniform1f(pComp.u.uT, s.t);
      gl.uniform1f(pComp.u.uScroll, s.scroll);
      gl.uniform1f(pComp.u.uSurface, s.surface);
      gl.uniform1f(pComp.u.uWaterY, s.waterVisible ? s.waterY : 0);
      gl.uniform1f(pComp.u.uBloom, s.bloom);
      gl.uniform1f(pComp.u.uCosmic, s.cosmic);
      gl.uniform1f(pComp.u.uSunX, s.sunX);
      gl.uniform3fv(pComp.u.uPlanet, s.planet);
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

    if (nodeN) {
      gl.useProgram(pNode.p);
      gl.bindVertexArray(nodeVAO);
      gl.uniform2f(pNode.u.uCss, cssW, cssH);
      gl.uniform1f(pNode.u.uScroll, s.scroll);
      gl.uniform1f(pNode.u.uFront, s.front);
      gl.uniform1f(pNode.u.uDimTo, s.dimTo);
      gl.uniform1f(pNode.u.uT, s.t);
      gl.uniform1f(pNode.u.uPx, dpr);
      gl.uniform1f(pNode.u.uInk, s.rootInk);
      gl.uniform3fv(pNode.u.uColor, s.rootColor);
      gl.drawArrays(gl.POINTS, 0, nodeN);
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

  return { gl, resize, setRoots, setName, setFossils, setChart, addRipple, render, lowerQuality };
}
