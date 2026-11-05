// The sky and the sea behind the page: one WebGL2 canvas fixed over the app stages and under the text.
// Passes per frame: water simulation → sky (low-res, because the sea has to reflect it) → water and nebula
// (low-res) → composite (sky, waves, the view from under the surface, deep space, the pearls, Earth) →
// roots → star nodes → creatures → shoal → bubbles → plankton → the name's grains.
import { QUAD, NOISE, compile, rng } from './gl.js';
import { createFluid } from './fluid.js';

// The soft parts of the sky. It covers the screen and as much again above it, because the sea reflects what is overhead.
const ENV = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uCss; uniform float uT,uScroll,uSurface,uBloom,uSunX;
${NOISE}
void main(){
  vec2 css=vec2(vUv.x*uCss.x,mix(uCss.y,-.8*uCss.y,vUv.y));
  float row=uSurface-uScroll;
  float k=clamp((css.y-row)/uSurface+1.,0.,1.);
  vec2 sp=vec2(css.x,css.y+uScroll*.18);
  // Dusk gathers around the sun instead of running evenly along the horizon.
  float near=exp(-pow((css.x-uSunX)/(uCss.x*.6),2.));
  vec3 c=mix(vec3(.006,.01,.036),vec3(.028,.03,.105),smoothstep(.1,.72,k));
  c=mix(c,mix(mix(vec3(.045,.075,.2),vec3(.23,.075,.24),near),vec3(.03,.07,.14),uBloom),smoothstep(.58,.9,k));
  c=mix(c,mix(mix(vec3(.1,.17,.3),vec3(1.,.47,.17),near),vec3(.05,.32,.34),uBloom),smoothstep(.86,1.,k)*(.3+.7*smoothstep(.94,1.,k)));
  c+=vec3(.2,.05,.27)*pow(fbm(sp/420.+9.),3.)*.9*smoothstep(1.,.5,k);
  c+=vec3(.03,.15,.22)*pow(fbm(sp/360.+21.),3.)*.9*smoothstep(1.,.5,k);
  // The Milky Way: a long diagonal band that leans over the palm, cut by dark dust lanes.
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
  float sd=length(css-vec2(uSunX,row-2.));
  c+=vec3(1.,.62,.3)*(.6*exp(-sd/62.)+.3*exp(-sd/230.))*(1.-uBloom);
  // Aurora, once the palm has been watered.
  if(uBloom>.001){
    float x=css.x/170.;
    float cur=pow(fbm(vec2(x+uT*.06,uT*.03)),1.5);
    float fold=.5+.5*sin(x*5.+fbm(vec2(x*.7,uT*.08))*9.);
    float rangeY=smoothstep(.97,.6,k)*smoothstep(.2,.6,k);
    c+=mix(vec3(.08,.95,.58),vec3(.48,.22,.9),smoothstep(.72,.32,k))*cur*fold*rangeY*.62*uBloom;
  }
  o=vec4(c,band);
}`;

// Water masses: long currents near the top that let go of direction with depth and become nebula.
const WATER = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uCss; uniform float uT,uY,uCosmic,uRays; uniform vec3 uA,uB,uC,uD;
${NOISE}
void main(){
  vec2 scr=vec2(vUv.x*uCss.x,(1.-vUv.y)*uCss.y);
  vec2 css=vec2(scr.x,scr.y+uY);
  float t=uT*.012;
  vec2 p=css/vec2(1400.,430.);
  vec2 q=vec2(fbm(p+vec2(t,0.)),fbm(p+vec2(5.2,1.3-t)));
  float w=fbm(p*1.4+1.7*q+vec2(1.7+t*.6,9.2));
  float cur=pow(1.-abs(2.*fbm(p*2.3+1.5*q+vec2(t,3.))-1.),5.);
  float tone=clamp(w*.92+cur*.2-.06,0.,1.);
  float wisp=0.,cl=0.;
  if(uCosmic>.001){
    vec2 pc=css/860.;
    vec2 qc=vec2(fbm(pc+vec2(t*.7,2.)),fbm(pc+vec2(6.1,-t*.55)));
    cl=fbm(pc*1.5+2.5*qc+vec2(4.,t*.5));
    wisp=pow(1.-abs(2.*fbm(pc*2.6+1.7*qc+vec2(t*.5,7.))-1.),6.);
    tone=mix(tone,clamp(cl*cl*2.1+wisp*.4,0.,1.),uCosmic);
  }
  vec3 col=tone<.4?mix(uA,uB,tone/.4):tone<.72?mix(uB,uC,(tone-.4)/.32):mix(uC,uD,(tone-.72)/.28);
  // Light comes from above, even when above is a long way off.
  col*=mix(.78,1.1,vUv.y);
  col+=uD*wisp*.2*uCosmic;
  // Shafts of light that fan out from a point somewhere over the surface.
  if(uRays>.001){
    vec2 src=vec2(uCss.x*(.5+.18*sin(uT*.05)),-uCss.y*.85);
    vec2 dd=scr-src;
    float an=atan(dd.x,dd.y);
    float shaft=pow(fbm(vec2(an*11.+uT*.05,uT*.1)),2.5)*3.2+pow(fbm(vec2(an*27.-uT*.08,7.+uT*.13)),3.)*2.4;
    col+=(uD*.8+vec3(.03,.07,.08))*shaft*exp(-(1.-vUv.y)*1.7)*uRays;
  }
  o=vec4(col,tone*.62+.1);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uRock,uFossil,uChart,uEnv,uMask,uFlow,uDye,uLand;
uniform vec2 uCss,uRockSize,uLamp,uHoleC,uDhow;
uniform float uT,uScroll,uSurface,uLampAmt,uBloom,uCosmic,uSunX,uRays;
uniform float uCamH,uFocal,uWL,uAbove,uCeil,uCeilD,uPitch,uNameGlow,uFluid;
uniform int uWaves;
uniform vec3 uPlanet,uRim0,uRim1,uEarth,uImpact,uZone;
uniform vec4 uHole,uMaskRect;
uniform vec4 uRipples[6];
uniform vec4 uSeaRip[4];
uniform float uSeaRipS[4];
${NOISE}
vec2 hash2(vec2 p){ p=mod(p,289.); return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
vec2 envUV(vec2 c){ return vec2(c.x/uCss.x,(uCss.y-c.y)/(1.8*uCss.y)); }
// Sunken glyphs from a 3×2 atlas, inset a hair so one tile never bleeds into the next. x: the glyph, y: its lit edge.
vec2 glyphs(vec2 f,float z){
  vec2 uv=(vec2(mod(z,3.),floor(z/3.))+.01+f*.98)/vec2(3.,2.), e=vec2(.0012);
  return vec2(texture(uFossil,uv).r,texture(uFossil,uv+e).r-texture(uFossil,uv-e).r);
}

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
    vec3 alb=mix(vec3(.3,.3,.48),vec3(.72,.58,.5),.5+.5*sin(lat*3.3));
    alb=mix(alb,vec3(.92,.82,.7),smoothstep(.6,1.,.5+.5*sin(lat*8.3+1.))*.32);
    vec3 body=alb*(pow(d,.85)*1.05+.01)+vec3(.45,.6,1.)*pow(1.-z,2.4)*smoothstep(-.05,.4,d)*.75;
    c=mix(c,body,smoothstep(1.,.975,rr));
  } else {
    c+=vec3(.32,.42,.95)*exp(-(rr-1.)*8.)*.2*max(dot(normalize(vec3(q,.3)),L),0.);
  }
  if(t.y>=0.) c=mix(c,ringC,ring);
  return c;
}

float tri(vec2 p,vec2 a,vec2 b,vec2 c){
  float s1=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  float s2=(c.x-b.x)*(p.y-b.y)-(c.y-b.y)*(p.x-b.x);
  float s3=(a.x-c.x)*(p.y-c.y)-(a.y-c.y)*(p.x-c.x);
  return (s1>=0.&&s2>=0.&&s3>=0.)||(s1<=0.&&s2<=0.&&s3<=0.)?1.:0.;
}

// What stands on the horizon: a far coast, the palm's islet, a dhow. Analytic, so the sea can reflect it too.
float horizonThings(vec2 c,float row){
  float up=row-c.y;
  if(up<-1.||up>64.) return 0.;
  float coast=smoothstep(uCss.x*.42,uCss.x*.04,c.x);
  float h=coast*(1.5+13.*fbm(vec2(c.x/120.,2.))*fbm(vec2(c.x/420.,5.))*2.);
  float wide=max(70.,uCss.x*.075);
  float isl=exp(-pow((c.x-uSunX)/wide,2.))*(11.+3.*vn(vec2(c.x/18.,4.)));
  h=max(h,isl);
  float a=smoothstep(h+.8,h-.8,up);
  vec2 d=vec2(c.x-uDhow.x,up)/uDhow.y;
  if(abs(d.x)<30.&&d.y<40.){
    float hull=step(0.,d.y)*step(d.y,4.5)*step(-17.+(4.5-d.y)*.8,d.x)*step(d.x,23.-(4.5-d.y)*2.2);
    float sail=tri(d,vec2(-13.,7.5),vec2(19.,33.),vec2(15.,6.5));
    float mast=step(abs(d.x-4.-d.y*.06),.5)*step(d.y,28.);
    a=max(a,max(hull,max(sail,mast)));
  }
  return a;
}

// Peaked waves: a sum of sines, sharpened at the crests, whose small ripples die with distance so the far sea never aliases.
vec3 waves(vec2 p,float d,out float crest){
  vec2 g=vec2(0.); float a=.036,f=2.,ang=.86,cr=0.;
  for(int i=0;i<uWaves;i++){
    vec2 dr=vec2(cos(ang),sin(ang));
    float ph=dot(dr,p)*f+uT*sqrt(f)*1.08;
    float s=sin(ph), w=exp(s-1.);
    float lod=exp(-d*f*.0105);
    g+=dr*a*f*w*cos(ph)*lod;
    cr+=w*a*lod;
    ang+=2.399; f*=1.3; a*=.82;
  }
  crest=cr;
  return normalize(vec3(-g.x,1.,-g.y));
}

vec3 skyView(vec2 css,float att){
  vec4 ev=texture(uEnv,envUV(css));
  vec3 c=ev.rgb;
  float band=ev.a;
  float k=clamp((css.y+uScroll)/uSurface,0.,1.);
  vec2 sp=vec2(css.x,css.y+uScroll*.18);
  float fade=smoothstep(1.,.72,k);
  float s=starLayer(sp,5.,.2+.38*band,1.05)*.9+starLayer(sp+17.,17.,.16,1.5)+starLayer(sp+41.,61.,.26,2.5)*1.4;
  float halo=starLayer(sp+41.,61.,.26,10.)*.16;
  c+=vec3(.86,.9,1.)*(s+halo)*fade*(.8+.2*uBloom);
  c=planet(c,css);
  // Named stars are always there; their lines and names come out under the lamp.
  vec3 ch=texture(uChart,vec2(css.x/uCss.x,(css.y+uScroll*.18)/uSurface)).rgb;
  c+=vec3(.96,.98,1.)*ch.r*fade;
  c+=vec3(.6,.86,1.)*ch.g*fade*(.05+smoothstep(.04,.5,att)*.95);
  c+=vec3(.14,.2,.3)*att*att*.2*fade;
  float m=meteor(css,.13,7.)+meteor(css,.61,11.);
  if(uBloom>.5) m+=meteor(css,.37,2.3)+meteor(css,.83,3.1);
  c+=vec3(.92,.96,1.)*m;
  return c;
}

vec3 seaView(vec2 css,float row,vec2 flow){
  float F=uFocal;
  vec3 rd=normalize(vec3((css.x-uCss.x*.5)/F,(row-css.y)/F,1.));
  float dn=max(-rd.y,.0009);
  float t=uCamH/dn;
  vec3 P=rd*t;
  float cr;
  vec3 n=waves(P.xz,t,cr);
  // The hand drags a wake through the waves, and anything that lands sends rings out.
  n.xz+=vec2(flow.x,-flow.y)*.00042;
  for(int i=0;i<4;i++){
    vec4 sr=uSeaRip[i];
    if(sr.z<=0.) continue;
    vec2 d=P.xz-sr.xy; float l=length(d)+.001; float sp=uSeaRipS[i];
    float x=(l-sr.w*sp)/sp;
    n.xz+=d/l*exp(-x*x*6.)*sin(x*22.)*exp(-sr.w*.7)*sr.z*.34;
  }
  n=normalize(n);
  vec3 r=reflect(rd,n); r.y=abs(r.y)+.0016;
  // Where would that reflected ray land on the screen, if the sky went on above it?
  vec2 virt=vec2(uCss.x*.5+r.x/r.z*F,row-r.y/r.z*F);
  vec3 e=texture(uEnv,envUV(virt)).rgb;
  vec2 sp=vec2(virt.x,virt.y+uScroll*.18);
  // Only far off: up close a wave can fold one star's reflection into a white blob the size of a hand.
  e+=vec3(.86,.9,1.)*(starLayer(sp+17.,17.,.16,1.8)+starLayer(sp+41.,61.,.26,2.6))*.8*exp(-(css.y-row)/70.);
  e=mix(e,planet(e,virt)*.5,.3*smoothstep(0.,.25,uPlanet.z));
  vec2 muv=(vec2(virt.x,virt.y+uScroll)-uMaskRect.xy)/uMaskRect.zw;
  if(muv.x>0.&&muv.x<1.&&muv.y>0.&&muv.y<1.){
    vec4 m=texture(uMask,muv);
    e=mix(e,vec3(.008,.01,.02),m.r);
    e+=vec3(1.,.74,.44)*m.g*uNameGlow*(.5+.5*vn(P.xz*5.))*exp(-(css.y-row)/uCss.y*5.);
  }
  e=mix(e,vec3(.014,.012,.028),horizonThings(virt,row));
  float c=max(dot(-rd,n),0.);
  float Fr=.04+.96*pow(1.-c,5.);
  // Under the reflection, black-blue water with a little glow in the wave faces.
  vec3 body=mix(vec3(.004,.03,.07),vec3(.006,.13,.17),clamp(cr*5.5,0.,1.));
  body+=vec3(.006,.05,.075)*clamp(n.x*5.+n.z*3.5+.25,0.,1.2);
  vec3 col=mix(body,e,Fr);
  // The sun's road.
  vec3 L=normalize(vec3((uSunX-uCss.x*.5)/F,.03,1.));
  float s1=max(dot(r,L),0.);
  col+=vec3(1.,.58,.24)*(pow(s1,2200.)*4.5+pow(s1,300.)*.2)*(1.-uBloom);
  // Sea sparkle: plankton that light up where the crests break.
  float crest=smoothstep(.05,.1,cr)*exp(-t*.06);
  col+=vec3(.05,.72,.86)*crest*(.05+pow(vn(P.xz*7.+uT*.5),3.)*.75+min(length(flow)*.0016,1.));
  vec3 hz=texture(uEnv,envUV(vec2(css.x,row-3.))).rgb;
  return mix(col,hz,exp(-dn*46.));
}

vec3 aboveView(vec2 css,vec2 flow,float att){
  float row=uSurface-uScroll;
  vec3 c=vec3(0.);
  if(css.y<row+1.5){
    c=skyView(css+vec2(flow.x,-flow.y)*.018,att);
    float hz=horizonThings(css,row);
    c=mix(c,vec3(.02,.014,.03),hz);
    vec2 lamp=vec2(uDhow.x+3.*uDhow.y,row-11.*uDhow.y);
    c+=vec3(1.,.7,.36)*exp(-dot(css-lamp,css-lamp)/5.)*(.7+.3*sin(uT*2.1));
  }
  if(css.y>row-1.5){
    vec3 s=seaView(css,row,flow);
    c=css.y<row+1.5?mix(c,s,smoothstep(row-1.5,row+1.5,css.y)):s;
  }
  // The star that opens the page: it falls, it hits the water, the rings go out.
  if(uImpact.z>0.){
    float age=uImpact.y;
    if(age<0.){
      float u=clamp(age/.85+1.,0.,1.);
      vec2 a=vec2(uImpact.x+uCss.x*.34,-40.), b=vec2(uImpact.x,row);
      vec2 head=mix(a,b,u*u);
      vec2 ba=normalize(b-a)*min(uCss.y*.42,380.)*smoothstep(0.,.2,u), pa=css-(head-ba);
      float h=clamp(dot(pa,ba)/max(dot(ba,ba),1.),0.,1.);
      float d=length(pa-ba*h);
      c+=vec3(.9,.97,1.)*(smoothstep(2.4,0.,d)*h*h*1.7+exp(-d/12.)*h*h*h*.28);
    } else {
      float d=length(css-vec2(uImpact.x,row));
      c+=vec3(.75,.92,1.)*exp(-d/170.)*exp(-age*2.6)*1.15;
    }
  }
  return c;
}

float caustic(vec2 p){
  vec2 q=p+vec2(vn(p*1.3+uT*.25),vn(p*1.3+7.-uT*.2))*1.4;
  float a=1.-abs(2.*vn(q*2.)-1.);
  float b=1.-abs(2.*vn(q*2.7+9.+uT*.15)-1.);
  return pow(a*b,5.);
}

// A blue planet, seen from where the deep comes out. Centred on 12°N 62°E so the Indian Ocean faces you, with the sun
// just coming up over Arabia: you went down at dusk, and this is the morning.
vec3 earth(vec3 c,vec2 pg){
  vec2 q=(pg-uEarth.xy)/uEarth.z;
  float rr=length(q);
  if(rr>1.5) return c;
  vec3 L=normalize(vec3(.93,.3,.2));
  if(rr<1.){
    float z=sqrt(1.-rr*rr);
    vec3 n=vec3(q.x,-q.y,z);
    const float ca=.97815, sa=.20791;
    vec3 w=vec3(n.x,n.y*ca+n.z*sa,-n.y*sa+n.z*ca);
    float lat=asin(clamp(w.y,-1.,1.));
    float lon=atan(w.x,w.z)+1.08210;
    vec2 uv=vec2(fract(lon/6.28318+.5),.5-lat/3.14159);
    vec2 wob=(vec2(fbm(uv*vec2(90.,45.)),fbm(uv*vec2(90.,45.)+7.))-.5)*.008;
    vec4 m=texture(uLand,uv+wob);
    float land=smoothstep(.36,.62,m.r);
    float nl=dot(n,L);
    float diff=max(nl,0.);
    vec3 ocean=mix(vec3(.006,.05,.16),vec3(.015,.2,.42),pow(z,1.4));
    ocean+=vec3(.0,.09,.11)*fbm(uv*vec2(60.,30.)+3.)*.8;
    float latD=abs(lat)*57.3, lonD=lon*57.3;
    float dry=exp(-pow((latD-23.)/13.,2.))*smoothstep(76.,64.,lonD);
    float tex=fbm(uv*vec2(120.,60.)+.5*fbm(uv*vec2(40.,20.)));
    vec3 ground=mix(mix(vec3(.08,.15,.07),vec3(.17,.2,.11),tex),mix(vec3(.6,.45,.3),vec3(.44,.31,.21),tex),dry);
    vec3 s=mix(ocean,ground,land);
    s*=diff*1.3+.008;
    vec3 H=normalize(L+vec3(0.,0.,1.));
    s+=vec3(1.,.9,.72)*pow(max(dot(n,H),0.),90.)*(1.-land)*.8*smoothstep(0.,.25,diff);
    // Clouds: streaks that run with the latitude, curled by a slower swirl.
    vec2 cu=uv*vec2(52.,46.)+vec2(uT*.0016,0.);
    float cl=fbm(cu*vec2(1.,1.5)+2.4*vec2(fbm(cu*.3+2.),fbm(cu*.3+8.)));
    cl=smoothstep(.56,.8,cl)*(.55+.45*smoothstep(.2,.5,fbm(uv*vec2(9.,5.)+4.)));
    s=mix(s,vec3(.93,.96,1.)*(diff*1.15+.012),cl*.72);
    // Cities come on as the sun leaves them.
    float night=smoothstep(.2,-.04,nl);
    s+=vec3(.003,.011,.03)*night*(1.-land)+vec3(.03,.028,.034)*night*land;
    s+=vec3(1.,.74,.42)*m.g*night*land*(1.-cl*.72)*(.5+1.5*vn(uv*vec2(1400.,700.)));
    s+=vec3(.9,.42,.14)*exp(-pow(nl/.05,2.))*.035;
    s+=vec3(.26,.56,1.)*pow(1.-z,3.1)*(diff*1.5+.05);
    c=mix(c,s,smoothstep(1.,.994,rr));
  }
  if(rr>=.985){
    float lit=max(dot(normalize(vec3(q.x,-q.y,.22)),L),0.);
    c+=vec3(.2,.5,1.)*exp(-(rr-1.)*17.)*(.1+.95*lit);
  }
  return c;
}

vec3 deepView(vec2 css,float py,vec2 flow,float att){
  vec2 duv=vUv+flow/uCss*.03;
  vec4 r=texture(uRock,duv);
  vec2 e=1./uRockSize;
  float hx=texture(uRock,duv+vec2(e.x,0.)).a-texture(uRock,duv-vec2(e.x,0.)).a;
  float hy=texture(uRock,duv-vec2(0.,e.y)).a-texture(uRock,duv+vec2(0.,e.y)).a;
  vec2 toL=uLamp-css;
  vec3 n=normalize(vec3(-hx*3.,-hy*3.,1.));
  float diff=max(dot(n,normalize(vec3(toL,180.))),0.);
  vec3 lampCol=mix(vec3(.62,.95,1.),vec3(.66,.74,1.),uCosmic);
  vec3 col=r.rgb*(.8+.16*diff);
  col+=r.rgb*lampCol*att*(.36+.5*diff*diff);
  // Letters sunk in the water. They sway a little, and only the lamp really shows them.
  float seen=smoothstep(.05,.6,att);
  if(seen>.001&&uEarth.z<=0.){
    vec2 fu=fract(vec2(css.x+sin(py*.0034+uT*.22)*11.,css.y+uScroll*.62)/1180.);
    vec2 gl=mix(glyphs(fu,uZone.x),glyphs(fu,uZone.y),uZone.z);
    col+=lampCol*att*att*(max(gl.y,0.)*.24+gl.x*.09)*seen*mix(.55,1.,uCosmic);
  }
  // Plankton near the top, stars by the bottom: nothing about them changes.
  vec2 sp=vec2(css.x,css.y+uScroll*.3)+vec2(flow.x,-flow.y)*.02;
  float vis=.34+.66*uCosmic;
  float st=starLayer(sp,7.,.15,1.05)+starLayer(sp+29.,23.,.11,1.6)*1.2+starLayer(sp+53.,83.,.2,2.7)*1.5+starLayer(sp+53.,83.,.2,11.)*.12;
  col+=mix(vec3(.55,.95,.98),vec3(.86,.9,1.),uCosmic)*st*vis*(1.+att*1.4);
  // A net of light on the water just under the surface.
  if(uRays>.001) col+=vec3(.2,.72,.78)*caustic(css/vec2(150.,110.)+vec2(0.,uScroll*.0036))*uRays*.34*exp(-(1.-vUv.y)*1.2);
  // Looking back up: the underside of the waves, and Snell's window with the sky squeezed into it.
  if(uCeil>.001){
    float cp=cos(uPitch),sn=sin(uPitch);
    vec3 rd=normalize(vec3((css.x-uCss.x*.5)/uFocal,(uCss.y*.5-css.y)/uFocal,1.));
    rd=vec3(rd.x,rd.y*cp+rd.z*sn,-rd.y*sn+rd.z*cp);
    if(rd.y>.015){
      float t=uCeilD/rd.y;
      float cr;
      vec3 wn=waves(rd.xz*t*.8,t*.6,cr);
      vec3 rf=refract(rd,-wn,1.33);
      vec3 cc=r.rgb*.42+vec3(.01,.07,.09)*clamp(cr*7.,0.,1.);
      // Far outside the window a steep wave can still catch a scrap of sky, and it floats there like a saucer. Only near the window, then.
      float near=smoothstep(.5,.68,rd.y);
      if(near>0.&&dot(rf,rf)>0.){
        vec2 skyuv=vec2(.5+rf.x*.5,.62+rf.z*.34);
        vec3 sk=texture(uEnv,skyuv).rgb*1.9+vec3(.03,.2,.27)*pow(max(rf.y,0.),1.5)*1.15;
        vec2 sq=rf.xz*900.;
        sk+=vec3(.86,.95,1.)*(starLayer(sq,19.,.3,1.8)+starLayer(sq+31.,53.,.3,2.8)*1.5);
        // The rim of the window is the brightest thing down here, and it shivers with every wave.
        sk+=vec3(.35,.8,.95)*pow(1.-max(rf.y,0.),7.)*.8;
        cc=mix(cc,sk,near);
      }
      col=mix(col,cc,exp(-t*.1)*uCeil*smoothstep(.0,.42,rd.y));
    }
  }
  if(uEarth.z>0.) col=earth(col,vec2(css.x,py));
  return col;
}

void main(){
  vec2 css=vec2(vUv.x*uCss.x,(1.-vUv.y)*uCss.y);
  float py=css.y+uScroll;
  vec2 pg=vec2(css.x,py);
  vec2 flow=vec2(0.); vec3 dye=vec3(0.);
  if(uFluid>.5){ flow=texture(uFlow,vUv).xy; dye=texture(uDye,vUv).rgb; }

  vec2 toL=uLamp-css;
  float R=max(uCss.x*.27,uCss.y*.36);
  float att=uLampAmt*exp(-dot(toL,toL)/(R*R));
  // A tap sends out sonar: a ring that lights everything it passes.
  for(int i=0;i<6;i++){
    vec4 rp=uRipples[i];
    if(rp.z<=0.) continue;
    float l=length(pg-rp.xy), f=(l-rp.w*560.)/54.;
    att+=exp(-f*f)*exp(-rp.w*1.15)*rp.z;
  }

  vec3 col;
  float dw=1.;
  if(uAbove>.5){
    float wl=uWL+sin(css.x*.012+uT*1.6)*9.+sin(css.x*.033-uT*2.3)*4.+sin(css.x*.0051+uT*.7)*16.;
    dw=css.y-wl;
    if(dw<=0.){
      // Water climbing the lens bends what is just above it.
      vec2 bent=css+vec2(0.,exp(dw/34.)*26.);
      col=aboveView(bent,flow,att);
    } else {
      col=deepView(css,py,flow,att);
      col*=1.-.42*exp(-dw/30.);
    }
    col+=vec3(.72,.96,1.)*(exp(-abs(dw)/1.9)*.95+exp(-abs(dw)/15.)*.14);
  } else {
    col=deepView(css,py,flow,att);
  }
  col+=dye*(dw<0.?.42:mix(.42,1.,uCosmic));

  // A pearl that is also a planet, with an app's world inside. Swim into it and you are in the app.
  if(uHole.x>.5){
    float Rh=max(uHole.y,1.);
    vec2 q=(css-uHoleC)/Rh;
    float an=atan(q.y,q.x);
    float shiver=1.+(.011*sin(an*3.+uT*1.1+uHole.w)+.006*sin(an*5.-uT*1.7))*smoothstep(0.,160.,Rh);
    vec2 qs=q/shiver;
    float rr=length(qs);
    float dC=(rr-1.)*Rh;
    // Leaving the world is passing back through a water surface.
    float wob=sin(css.x*.011+uT*1.3+uHole.w)*10.+sin(css.x*.029-uT*1.9)*5.+sin(css.x*.0047+uT*.6)*18.;
    float dE=py-uHole.z+wob;
    float d=max(dC,dE);
    float vis=smoothstep(1.25,.72,Rh/length(uCss));
    // Dark water around it, and the pearl's own light in the water.
    if(dC>0.) col=mix(col,col*.72,exp(-dC/(Rh*.5+50.))*vis)+uRim1*exp(-dC/(Rh*.22+26.))*.42*vis+mix(uRim1,vec3(.8,.9,1.),.4)*exp(-dC/5.)*.5*vis;
    if(dE>0.&&dC<0.) col+=uRim1*exp(-dE/170.)*.3;
    col+=vec3(.72,.96,1.)*exp(-abs(dE)/2.2)*.9*step(dC,0.);
    float alpha=smoothstep(-1.2,1.2,d);
    vec3 shell=vec3(0.); float sa=0.;
    if(rr<1.){
      vec3 n=vec3(qs,sqrt(max(1.-rr*rr,0.)));
      float fres=pow(1.-n.z,2.5);
      vec3 irid=.5+.5*cos(6.283*(vec3(0.,.33,.67)+(1.-n.z)*1.5+uHole.w*.13+uT*.018));
      float hi=pow(max(dot(n,normalize(vec3(-.42,-.58,.7))),0.),170.);
      float hi2=pow(max(dot(n,normalize(vec3(.5,.62,.6))),0.),12.)*.1;
      float sweep=pow(max(dot(n,normalize(vec3(-.42,-.58,.7))),0.),9.)*.13;
      shell=(mix(uRim1,irid,.42)*fres*1.15+vec3(1.)*(hi*1.1+sweep)+uRim1*hi2)*vis;
      sa=clamp(fres*.9+hi+sweep*.7,0.,1.)*vis;
    }
    // A thin ring while it is still small enough to be a planet.
    float ringVis=smoothstep(360.,120.,Rh)*smoothstep(2.,30.,Rh);
    if(ringVis>0.){
      float ca=cos(-.3),sw=sin(-.3);
      vec2 t=vec2(ca*q.x-sw*q.y,sw*q.x+ca*q.y);
      float rd=length(vec2(t.x,t.y/.24));
      float rg=smoothstep(1.34,1.37,rd)*smoothstep(1.82,1.78,rd)*(.28+.34*sin(rd*50.))*ringVis;
      if(rg>0.&&(t.y>0.||rr>1.)){
        vec3 rc=mix(uRim1,vec3(1.),.35)*rg;
        col+=rc*alpha; shell+=rc*(1.-alpha); sa=max(sa,rg);
      }
    }
    vec4 res=vec4(col*alpha,alpha);
    res.rgb+=shell*(1.-alpha);
    res.a=max(res.a,alpha+sa*(1.-alpha));
    res.rgb+=(h21(css+uT)-.5)*.018*alpha;
    o=vec4(clamp(res.rgb,0.,res.a),res.a);
    return;
  }
  o=vec4(col+(h21(css+uT)-.5)*.018,1.);
}`;

// Kelp and roots lean with the same slow swell, so branches never come away from what they grew from.
const SWAY = `uniform float uEnd; vec2 sway(vec2 p){ return vec2((sin(p.y*.0042+uT*.45)*9.+sin(p.y*.0115-uT*.7+p.x*.003)*3.)*smoothstep(uEnd,uEnd-600.,p.y),0.); }`;

const ROOT_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP; layout(location=1) in vec2 aN; layout(location=2) in vec4 aI; layout(location=3) in float aS;
uniform vec2 uCss; uniform float uScroll,uFront,uWide,uDimTo,uT;
out float vSide,vAlong,vSeed,vReveal,vW,vDim;
${SWAY}
void main(){
  float reveal=smoothstep(0.,70.,uFront-aI.z);
  float w=aI.y*reveal*uWide;
  vec2 p=aP+aN*aI.x*w+sway(aP);
  gl_Position=vec4(p.x/uCss.x*2.-1.,1.-(p.y-uScroll)/uCss.y*2.,0.,1.);
  vSide=aI.x; vAlong=aI.w; vSeed=aS; vReveal=reveal; vW=aI.y; vDim=mix(.2,1.,smoothstep(uDimTo-240.,uDimTo,aP.y));
}`;

const ROOT_F = `#version 300 es
precision highp float;
in float vSide,vAlong,vSeed,vReveal,vW,vDim; out vec4 o;
uniform vec3 uColor; uniform float uT,uGlow,uInk,uPulse,uClip;
void main(){
  if(vReveal<=0.001||gl_FragCoord.y>uClip) discard;
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
uniform vec2 uCss,uLamp; uniform float uScroll,uT,uVel,uPx,uFluid; uniform sampler2D uFlow;
out float vA,vR,vTint,vStir;
void main(){
  float depth=.25+aR.z*.9;
  float x=aR.x*uCss.x+sin(uT*.1+aR.w*20.)*14.;
  float y=mod(aR.y*uCss.y*1.4-uScroll*depth*.8-uT*(2.+aR.w*4.),uCss.y*1.4)-uCss.y*.2;
  vec2 f=vec2(0.);
  if(uFluid>.5) f=textureLod(uFlow,vec2(x/uCss.x,1.-y/uCss.y),0.).xy;
  x+=f.x*.06*depth; y-=f.y*.06*depth;
  float lit=exp(-length(vec2(x,y)-uLamp)/230.);
  // Plankton flash when the water around them is disturbed. That is the real reason the sea glows.
  float stir=min(length(f)*.004,1.);
  // Scroll fast and the nearer ones stretch into streaks.
  float stretch=1.+min(abs(uVel)*.2*depth,24.);
  gl_Position=vec4(x/uCss.x*2.-1.,1.-y/uCss.y*2.,0.,1.);
  gl_PointSize=(1.+aR.z*1.9+stir*2.4)*uPx*stretch;
  vR=1./stretch;
  vTint=aR.w;
  vStir=stir;
  vA=(.16+.34*aR.w+.6*lit+1.1*stir)*(.6+.4*sin(uT*.9+aR.w*30.));
}`;

const DUST_F = `#version 300 es
precision mediump float;
in float vA,vR,vTint,vStir; out vec4 o; uniform vec3 uColor;
void main(){
  vec2 q=(gl_PointCoord-.5)*2.; q.x/=vR;
  float a=smoothstep(1.,.1,length(q))*vA;
  vec3 tint=vTint>.72?vec3(1.,.9,.78):vTint<.3?vec3(.72,.86,1.):vec3(1.);
  vec3 rgb=mix(uColor*tint,vec3(.35,.95,1.),min(vStir*1.6,1.))*min(a,1.);
  o=vec4(rgb,max(rgb.r,max(rgb.g,rgb.b)));
}`;

const NODE_V = `#version 300 es
precision highp float;
layout(location=0) in vec4 aN; // x, y, growth, seed
uniform vec2 uCss; uniform float uScroll,uFront,uT,uPx,uDimTo;
out float vA;
${SWAY}
void main(){
  float rev=smoothstep(30.,140.,uFront-aN.z);
  vec2 p=aN.xy+sway(aN.xy);
  gl_Position=vec4(p.x/uCss.x*2.-1.,1.-(p.y-uScroll)/uCss.y*2.,0.,1.);
  float tw=.55+.45*sin(uT*(.7+aN.w*2.4)+aN.w*60.);
  gl_PointSize=(6.+aN.w*11.)*uPx*(.6+.4*tw)*rev;
  vA=rev*tw*mix(.25,1.,smoothstep(uDimTo-240.,uDimTo,aN.y));
}`;

const NODE_F = `#version 300 es
precision mediump float;
in float vA; out vec4 o; uniform vec3 uColor; uniform float uInk,uClip;
void main(){
  if(gl_FragCoord.y>uClip) discard;
  vec2 q=(gl_PointCoord-.5)*2.; float d=dot(q,q);
  float cross=max(0.,1.-abs(q.x)*13.)*max(0.,1.-abs(q.y))+max(0.,1.-abs(q.y)*13.)*max(0.,1.-abs(q.x));
  float a=min(1.,(exp(-d*30.)+.2*exp(-d*5.)+.3*cross)*vA);
  vec3 c=mix(mix(uColor,vec3(1.),.6),uColor,uInk);
  vec3 rgb=c*a;
  o=vec4(rgb,mix(max(rgb.r,max(rgb.g,rgb.b)),a,uInk));
}`;

// Bubbles: a few always, and a storm of them for the moment you go under.
const BUBBLE_V = `#version 300 es
precision highp float;
layout(location=0) in vec4 aR;
uniform vec2 uCss; uniform float uScroll,uT,uPx,uAmt,uBurst;
out float vA;
void main(){
  float big=pow(aR.z,3.);
  float H=uCss.y*1.3;
  float y=mod(aR.y*H-uT*(34.+big*70.)-uScroll*(.5+big*.7),H)-uCss.y*.15;
  float x=aR.x*uCss.x+sin(uT*(1.+aR.w*2.)+aR.w*40.)*(5.+big*12.);
  gl_Position=vec4(x/uCss.x*2.-1.,1.-y/uCss.y*2.,0.,1.);
  gl_PointSize=(2.5+big*26.)*uPx;
  vA=aR.w<.3?uAmt:uBurst;
}`;

const BUBBLE_F = `#version 300 es
precision mediump float;
in float vA; out vec4 o; uniform float uClip;
void main(){
  if(vA<=.002||gl_FragCoord.y>uClip) discard;
  vec2 q=(gl_PointCoord-.5)*2.; float d=length(q);
  if(d>1.) discard;
  float rim=smoothstep(1.,.88,d)*smoothstep(.6,.94,d);
  vec2 h1=q-vec2(-.36,-.38), h2=q-vec2(.34,.42);
  float a=(rim*.55+.05+exp(-dot(h1,h1)*26.)*.95+exp(-dot(h2,h2)*60.)*.35)*vA;
  vec3 rgb=vec3(.74,.96,1.)*a;
  o=vec4(rgb,max(rgb.r,max(rgb.g,rgb.b)));
}`;

// Sea creatures made of stars. Each is one cloud of grains, animated here: the whale undulates,
// the jellyfish pulses, the manta flaps. aR: x brightness, y which part, z and w random.
const BEAST_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP; layout(location=1) in vec4 aR;
uniform vec2 uCss,uMouse; uniform vec4 uAt; // x, y on screen, px per unit, rotation
uniform float uT,uPx,uAlpha,uKind,uFlip,uMouseAmt,uPhase;
out float vA,vC,vS,vDark;
void main(){
  vec2 p=aP;
  float t=uT+uPhase;
  if(uKind<.5){
    float tail=smoothstep(.3,-1.05,p.x);
    if(aR.y>.5){
      vec2 piv=vec2(.28,-.14),d=p-piv; float a=sin(t*.8)*.2-.04;
      p=piv+vec2(d.x*cos(a)-d.y*sin(a),d.x*sin(a)+d.y*cos(a));
    }
    p.y+=sin(p.x*2.4+t*1.05)*tail*tail*.17+sin(t*.5)*.012;
  } else if(uKind<1.5){
    float pu=.5+.5*sin(t*1.7);
    pu=pu*pu;
    if(aR.y<.5){ p.x*=1.+.2*pu*(1.-p.y*.9); p.y*=1.-.15*pu; }
    else {
      float s=-p.y;
      p.x+=sin(s*4.6-t*2.1+aR.z*6.283)*.075*s+.12*pu*sign(p.x)*max(1.-s*.7,0.);
      p.y+=.05*pu*s;
    }
  } else {
    float u=abs(p.x);
    float fl=sin(t*1.15-u*1.5);
    p.y+=fl*u*u*.27;
    p.x*=1.-.06*u*(1.+fl);
    if(aR.y>.5) p.x+=sin(p.y*7.+t*2.)*.016*(-p.y);
  }
  p.x*=uFlip;
  float c=cos(uAt.w),s=sin(uAt.w);
  p=vec2(p.x*c-p.y*s,p.x*s+p.y*c);
  vec2 sc=uAt.xy+vec2(p.x,-p.y)*uAt.z;
  vec2 dm=sc-uMouse; float r2=dot(dm,dm); float f=exp(-r2/(2.*150.*150.))*uMouseAmt;
  sc+=normalize(dm+.001)*f*(10.+40.*aR.w);
  gl_Position=vec4(sc.x/uCss.x*2.-1.,1.-sc.y/uCss.y*2.,0.,1.);
  // A big creature needs bigger grains, or it dissolves into static.
  float grain=clamp(uAt.z/300.,1.1,1.5);
  bool shade=aR.x<.05;
  bool star=aR.x>.95;
  // A jellyfish's soft parts glow where a whale's blot out the stars.
  bool jelly=uKind>.5&&uKind<1.5;
  gl_PointSize=(shade?(jelly?.34:.05)*uAt.z*(1.+aR.w):star?(9.+uAt.z*.012):(jelly?1.5:1.05)*(1.+aR.w)*grain)*uPx*(1.+f*.6);
  vDark=shade?(jelly?2.:1.):0.;
  vA=uAlpha*(shade?(jelly?.075:.16):((jelly?.5:.22)+(jelly?.5:.78)*aR.x)*(.66+.34*sin(uT*(1.+aR.z*3.)+aR.w*40.)));
  vC=aR.z; vS=aR.x;
}`;

const BEAST_F = `#version 300 es
precision mediump float;
in float vA,vC,vS,vDark; out vec4 o; uniform vec3 uC0,uC1; uniform float uClip;
void main(){
  if(gl_FragCoord.y>uClip) discard;
  vec2 q=(gl_PointCoord-.5)*2.; float d=dot(q,q);
  if(d>1.) discard;
  // Its body blocks what is behind it: a dark mass moving across the stars is what makes it read as huge.
  if(vDark>1.5){ vec3 g=mix(uC0,uC1,vC)*vA*(1.-d)*(1.-d); o=vec4(g,max(g.r,max(g.g,g.b))); return; }
  if(vDark>.5){ o=vec4(vec3(.004,.012,.03)*vA,vA*(1.-d)*(1.-d)); return; }
  float a=vS>.95?exp(-d*14.)+.34*(max(0.,1.-abs(q.x)*11.)*(1.-abs(q.y))+max(0.,1.-abs(q.y)*11.)*(1.-abs(q.x))):smoothstep(1.,.15,d);
  a=min(a*vA,1.);
  vec3 rgb=mix(uC0,uC1,vC)*a;
  o=vec4(rgb,max(rgb.r,max(rgb.g,rgb.b)));
}`;

const SHOAL_V = `#version 300 es
precision highp float;
layout(location=0) in vec4 aS; layout(location=1) in float aSeed;
uniform vec2 uCss; uniform float uScroll,uT,uPx,uAlpha;
out float vAng,vFlash,vAlpha;
void main(){
  gl_Position=vec4(aS.x/uCss.x*2.-1.,1.-(aS.y-uScroll)/uCss.y*2.,0.,1.);
  gl_PointSize=(13.+aSeed*11.)*uPx;
  vAng=atan(aS.w,aS.z);
  // Seen from below a fish is a dark shape, and flashes silver only at the moment its side turns to the light.
  vFlash=pow(.5+.5*sin(vAng*3.+uT*1.2+aSeed*9.),6.);
  vAlpha=uAlpha;
}`;

const SHOAL_F = `#version 300 es
precision mediump float;
in float vAng,vFlash,vAlpha; out vec4 o; uniform float uClip;
void main(){
  if(gl_FragCoord.y>uClip) discard;
  vec2 q=(gl_PointCoord-.5)*2.;
  float c=cos(vAng),s=sin(vAng);
  q=vec2(q.x*c+q.y*s,-q.x*s+q.y*c);
  float body=exp(-(q.x*q.x*7.+q.y*q.y*90.));
  vec2 tl=q-vec2(-.5,0.);
  float tail=step(tl.x,0.)*step(abs(q.y),-tl.x*.5)*step(-.26,tl.x)*.5;
  float a=min((body+tail)*1.4,1.)*vAlpha;
  o=vec4(mix(vec3(.004,.03,.05),vec3(.86,.97,1.),vFlash)*a,a);
}`;

const NAME_V = `#version 300 es
precision highp float;
layout(location=0) in vec2 aHome; layout(location=1) in vec4 aR;
uniform vec2 uCss,uMouse,uDrain,uFrom; uniform vec4 uBox; // box: left,top,width,height (page px)
uniform float uT,uIntro,uMelt,uScroll,uMouseAmt,uPx,uReform,uSignY,uRtl;
out float vA,vH,vCool;
float eo(float x){ return 1.-pow(1.-x,3.); }
void main(){
  vec2 home=uBox.xy+aHome*uBox.zw;
  // The star hits the water and the name is thrown up out of the splash, in the direction it is read.
  float dly=(uRtl>.5?1.-aHome.x:aHome.x)*.42+aR.x*.3;
  float i=eo(clamp((uIntro-dly)/.6,0.,1.));
  vec2 from=uFrom+vec2((aR.y-.5)*70.,(aR.z-.5)*10.);
  vec2 p=mix(from,home,i);
  p.y-=sin(i*3.1416)*(50.+aR.z*210.);
  float an=aR.w*6.283+uT*.55;
  p+=vec2(cos(an),sin(an*1.3))*(.5+1.4*aR.x);

  vec2 mm=uMouse+vec2(0.,uScroll);
  vec2 dm=p-mm; float r2=dot(dm,dm); float rr=uBox.w*.14+50.;
  float f=exp(-r2/(2.*rr*rr))*uMouseAmt;
  p+=normalize(dm+.001)*f*(26.+64.*aR.y);
  p+=vec2(-dm.y,dm.x)/max(sqrt(r2),1.)*f*(14.+24.*aR.z);

  // The name rains into the sea as you dive, and runs down the taproot.
  float m=clamp(uMelt*(1.5+aR.x*.5)-aR.y*.5-(aHome.y*.3),0.,1.); m=m*m*(3.-2.*m);
  vec2 dr=uDrain+vec2((aR.z-.5)*(70.*(1.-m)+6.),aR.x*760.*m*m);
  dr.x+=sin(aR.w*40.+uT*2.+m*5.)*16.*(1.-m);
  p=mix(p,dr,m);

  // At the very bottom the same grains come back and sign the sky over Earth.
  float back=0.;
  if(uReform>0.){
    float rd=clamp(uReform*1.6-aR.y*.6,0.,1.); rd=rd*rd*(3.-2.*rd);
    vec2 sign=vec2(uCss.x*.5+(aHome.x-.5)*uBox.z*.62,uSignY+aHome.y*uBox.w*.62);
    vec2 start=sign+vec2((aR.z-.5)*300.,160.+aR.x*420.);
    p=mix(start,sign,rd); back=rd;
  }
  gl_Position=vec4(p.x/uCss.x*2.-1.,1.-(p.y-uScroll)/uCss.y*2.,0.,1.);
  // Most grains are dust; a few are real stars.
  gl_PointSize=(1.15+1.4*aR.y+step(.982,aR.x)*3.2)*uPx*(1.+.9*f);
  float aa=i*(1.-smoothstep(.72,1.,m))*(.9+.1*aR.x);
  float tw=.8+.2*sin(uT*(1.1+2.8*aR.z)+aR.w*50.);
  vA=uReform>0.?back*(.5+.42*aR.x)*tw:aa*tw;
  vH=aR.z+f;
  vCool=step(.84,aR.w);
}`;

const NAME_F = `#version 300 es
precision mediump float;
in float vA,vH,vCool; out vec4 o; uniform vec3 uC0,uC1;
void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.25,d)*vA; vec3 c=mix(mix(uC0,uC1,clamp(vH,0.,1.)),vec3(.74,.85,1.),vCool*.8)*a; o=vec4(c,max(c.r,max(c.g,c.b))); }`;

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

  // Taproot, with branches thrown off it. Rich stretches (the water between worlds) get more.
  const tap = [];
  const n1 = R() * 100;
  let nextBranch = startY + 40;
  let side = 1;
  for (let y = startY; y < height; y += 13) {
    const { x: ax, rich } = anchorX(y);
    const fade = Math.min(1, (height - y) / 260); // lands exactly on the last anchor
    const wobble =
      (Math.sin(y * 0.0041 + n1) * 34 + Math.sin(y * 0.0113 + n1 * 2) * 15 + Math.sin(y * 0.031 + n1 * 3) * 5) * fade;
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
  const last = tap[tap.length - 1];
  nodes.push(last.x, last.y, last.g - 200, 1); // where it ends, it ends in a star

  const tapAt = (y) => tap[Math.max(0, Math.min(tap.length - 1, Math.round((y - startY) / 13)))].x;
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx), nodes: new Float32Array(nodes), tapAt };
}

export function createWorld(canvas, { mobile }) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: !mobile, powerPreference: 'high-performance' });
  if (!gl) return null;

  const pEnv = compile(gl, QUAD, ENV);
  const pWater = compile(gl, QUAD, WATER);
  const pComp = compile(gl, QUAD, COMPOSITE);
  const pRoot = compile(gl, ROOT_V, ROOT_F);
  const pDust = compile(gl, DUST_V, DUST_F);
  const pName = compile(gl, NAME_V, NAME_F);
  const pNode = compile(gl, NODE_V, NODE_F);
  const pBubble = compile(gl, BUBBLE_V, BUBBLE_F);
  const pBeast = compile(gl, BEAST_V, BEAST_F);
  const pShoal = compile(gl, SHOAL_V, SHOAL_F);
  const emptyVAO = gl.createVertexArray();
  let fluid = null;
  try { fluid = createFluid(gl, { mobile }); } catch (e) { console.warn('water sim off', e); }

  const blank = (rgba = [0, 0, 0, 255]) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    return t;
  };
  const fossilTex = blank(), chartTex = blank(), maskTex = blank(), landTex = blank(), zeroTex = blank([0, 0, 0, 0]);
  const waterTex = gl.createTexture(), waterFbo = gl.createFramebuffer();
  const envTex = gl.createTexture(), envFbo = gl.createFramebuffer();

  const attach = (tex, fbo, w, h, wrapS = gl.CLAMP_TO_EDGE) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  let cssW = 1, cssH = 1, dpr = 1, waterW = 1, waterH = 1, envW = 1, envH = 1, quality = 0;
  let fluidOK = false;

  function resize() {
    cssW = canvas.clientWidth || innerWidth;
    cssH = canvas.clientHeight || innerHeight;
    dpr = Math.min(devicePixelRatio || 1, [mobile ? 1.6 : 1.75, 1.25, 1][quality]);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    // Setting a canvas size clears it, so a no-op resize would flash a blank frame.
    if (canvas.width === w && canvas.height === h && waterW > 2) return;
    canvas.width = w;
    canvas.height = h;
    waterW = Math.max(2, Math.round(cssW * (mobile ? 0.34 : 0.4)));
    waterH = Math.max(2, Math.round(cssH * (mobile ? 0.34 : 0.4)));
    attach(waterTex, waterFbo, waterW, waterH);
    envW = Math.max(2, Math.round(cssW * (mobile ? 0.3 : 0.36)));
    envH = Math.max(2, Math.round(cssH * 1.8 * (mobile ? 0.3 : 0.36)));
    attach(envTex, envFbo, envW, envH, gl.MIRRORED_REPEAT);
    fluidOK = !!fluid && fluid.size(cssW, cssH);
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

  const seeds = (seed, n) => {
    const R = rng(seed);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(n * 4).map(() => R()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  };
  const dustN = mobile ? 420 : 1000;
  const dustVAO = seeds(77, dustN);
  const bubbleN = mobile ? 90 : 170;
  const bubbleVAO = seeds(31, bubbleN);

  // Creatures: kind → one cloud of grains. x, y, brightness, part, random, random.
  const beasts = {};
  function setBeast(kind, data) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);
    beasts[kind] = { vao, n: data.length / 6 };
  }

  // The shoal is simulated on the CPU, so its buffer changes every frame it is on screen.
  const shoalVAO = gl.createVertexArray();
  const shoalVB = gl.createBuffer();
  let shoalN = 0;
  function setShoal(state) {
    const R = rng(5);
    shoalN = state.length / 4;
    gl.bindVertexArray(shoalVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, shoalVB);
    gl.bufferData(gl.ARRAY_BUFFER, state, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shoalN).map(() => R()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
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

  const upload = (tex, source, { mips = false, repeat = false } = {}) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  };
  const setFossils = (source) => upload(fossilTex, source);
  const setChart = (source) => upload(chartTex, source);
  const setMask = (source) => upload(maskTex, source);
  const setLand = (source) => upload(landTex, source);

  const ripples = new Float32Array(24);
  let rippleI = 0;
  function addRipple(x, pageY, strength = 1) {
    ripples.set([x, pageY, strength, 0], rippleI * 4);
    rippleI = (rippleI + 1) % 6;
  }

  // A ring on the open sea, placed in world space so it spreads in perspective.
  const seaRip = new Float32Array(16), seaRipS = new Float32Array(4);
  let seaRipI = 0;
  function addSeaRipple(x, y, row, camH, focal, strength = 1) {
    const yy = (row - y) / focal;
    if (yy >= -0.0005) return;
    const z = camH / -yy;
    seaRip.set([((x - cssW / 2) / focal) * z, z, strength, 0], seaRipI * 4);
    seaRipS[seaRipI] = Math.max(1.2, z * 0.26);
    seaRipI = (seaRipI + 1) % 4;
  }

  const bindTex = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };

  function render(s) {
    gl.disable(gl.BLEND);
    const open = !s.fullyOpen;
    const flowOn = fluidOK && open;
    if (flowOn) fluid.step({ dt: Math.max(s.dt, 0.004), t: s.t, scrolled: s.scrolled, stirs: s.stirs, iters: [mobile ? 8 : 12, 6, 4][quality] });
    gl.bindVertexArray(emptyVAO);

    if (open && (s.above || s.ceil > 0.001)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, envFbo);
      gl.viewport(0, 0, envW, envH);
      gl.useProgram(pEnv.p);
      gl.uniform2f(pEnv.u.uCss, cssW, cssH);
      gl.uniform1f(pEnv.u.uT, s.t);
      gl.uniform1f(pEnv.u.uScroll, s.scroll);
      gl.uniform1f(pEnv.u.uSurface, s.surface);
      gl.uniform1f(pEnv.u.uBloom, s.bloom);
      gl.uniform1f(pEnv.u.uSunX, s.sunX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (open) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, waterFbo);
      gl.viewport(0, 0, waterW, waterH);
      gl.useProgram(pWater.p);
      gl.uniform2f(pWater.u.uCss, cssW, cssH);
      gl.uniform1f(pWater.u.uT, s.t);
      gl.uniform1f(pWater.u.uY, s.scroll * 0.72);
      gl.uniform3fv(pWater.u.uA, s.pal[0]);
      gl.uniform3fv(pWater.u.uB, s.pal[1]);
      gl.uniform3fv(pWater.u.uC, s.pal[2]);
      gl.uniform3fv(pWater.u.uD, s.pal[3]);
      gl.uniform1f(pWater.u.uCosmic, s.cosmic);
      gl.uniform1f(pWater.u.uRays, s.rays);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, canvas.width, canvas.height);
    const uClip = canvas.height - s.waterline * dpr;
    if (open) {
      for (let i = 0; i < 6; i++) {
        if (ripples[i * 4 + 2] > 0) {
          ripples[i * 4 + 3] += s.dt;
          if (ripples[i * 4 + 3] > 5) ripples[i * 4 + 2] = 0;
        }
      }
      for (let i = 0; i < 4; i++) {
        if (seaRip[i * 4 + 2] > 0) {
          seaRip[i * 4 + 3] += s.dt;
          if (seaRip[i * 4 + 3] > 7) seaRip[i * 4 + 2] = 0;
        }
      }
      gl.useProgram(pComp.p);
      const u = pComp.u;
      bindTex(0, waterTex); gl.uniform1i(u.uRock, 0);
      bindTex(1, fossilTex); gl.uniform1i(u.uFossil, 1);
      bindTex(2, chartTex); gl.uniform1i(u.uChart, 2);
      bindTex(3, envTex); gl.uniform1i(u.uEnv, 3);
      bindTex(4, maskTex); gl.uniform1i(u.uMask, 4);
      bindTex(5, flowOn ? fluid.velTex : zeroTex); gl.uniform1i(u.uFlow, 5);
      bindTex(6, flowOn ? fluid.dyeTex : zeroTex); gl.uniform1i(u.uDye, 6);
      bindTex(7, landTex); gl.uniform1i(u.uLand, 7);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(u.uCss, cssW, cssH);
      gl.uniform2f(u.uRockSize, waterW, waterH);
      gl.uniform2f(u.uLamp, s.lampX, s.lampY);
      gl.uniform1f(u.uLampAmt, s.lampAmt);
      gl.uniform1f(u.uT, s.t);
      gl.uniform1f(u.uScroll, s.scroll);
      gl.uniform1f(u.uSurface, s.surface);
      gl.uniform1f(u.uBloom, s.bloom);
      gl.uniform1f(u.uCosmic, s.cosmic);
      gl.uniform1f(u.uSunX, s.sunX);
      gl.uniform1f(u.uRays, s.rays);
      gl.uniform1f(u.uFluid, flowOn ? 1 : 0);
      gl.uniform3fv(u.uPlanet, s.planet);
      gl.uniform1f(u.uCamH, s.camH);
      gl.uniform1f(u.uFocal, s.focal);
      gl.uniform1f(u.uWL, s.waterline);
      gl.uniform1f(u.uAbove, s.above ? 1 : 0);
      gl.uniform1f(u.uCeil, s.ceil);
      gl.uniform1f(u.uCeilD, s.ceilD);
      gl.uniform1f(u.uPitch, s.pitch);
      gl.uniform1f(u.uNameGlow, s.nameGlow);
      gl.uniform1i(u.uWaves, [mobile ? 6 : 8, 5, 4][quality]);
      gl.uniform2f(u.uDhow, s.dhow[0], s.dhow[1]);
      gl.uniform3fv(u.uImpact, s.impact);
      gl.uniform3fv(u.uEarth, s.earth);
      gl.uniform3fv(u.uZone, s.zone);
      gl.uniform4fv(u.uMaskRect, s.maskRect);
      gl.uniform4f(u.uHole, s.hole ? 1 : 0, s.hole ? s.hole.r : 0, s.hole ? s.hole.bottom : 0, s.hole ? s.hole.seed : 0);
      gl.uniform2f(u.uHoleC, s.hole ? s.hole.x : 0, s.hole ? s.hole.y : 0);
      gl.uniform3fv(u.uRim0, s.hole ? s.hole.rim0 : [0, 0, 0]);
      gl.uniform3fv(u.uRim1, s.hole ? s.hole.rim1 : [0, 0, 0]);
      gl.uniform4fv(u['uRipples[0]'], ripples);
      gl.uniform4fv(u['uSeaRip[0]'], seaRip);
      gl.uniform1fv(u['uSeaRipS[0]'], seaRipS);
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
      gl.uniform1f(pRoot.u.uClip, uClip);
      gl.uniform1f(pRoot.u.uEnd, s.rootEnd);
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
      gl.uniform1f(pNode.u.uClip, uClip);
      gl.uniform1f(pNode.u.uEnd, s.rootEnd);
      gl.uniform3fv(pNode.u.uColor, s.rootColor);
      gl.drawArrays(gl.POINTS, 0, nodeN);
    }

    if (open && s.beasts.length) {
      gl.useProgram(pBeast.p);
      gl.uniform2f(pBeast.u.uCss, cssW, cssH);
      gl.uniform2f(pBeast.u.uMouse, s.mouseX, s.mouseY);
      gl.uniform1f(pBeast.u.uT, s.t);
      gl.uniform1f(pBeast.u.uPx, dpr);
      gl.uniform1f(pBeast.u.uMouseAmt, s.mouseAmt);
      gl.uniform1f(pBeast.u.uClip, uClip);
      for (const b of s.beasts) {
        const cloud = beasts[b.kind];
        if (!cloud) continue;
        gl.bindVertexArray(cloud.vao);
        gl.uniform4f(pBeast.u.uAt, b.x, b.y, b.scale, b.rot || 0);
        gl.uniform1f(pBeast.u.uAlpha, b.alpha);
        gl.uniform1f(pBeast.u.uKind, b.kind);
        gl.uniform1f(pBeast.u.uFlip, b.flip || 1);
        gl.uniform1f(pBeast.u.uPhase, b.phase || 0);
        gl.uniform3fv(pBeast.u.uC0, b.c0);
        gl.uniform3fv(pBeast.u.uC1, b.c1);
        gl.drawArrays(gl.POINTS, 0, Math.round(cloud.n * [1, 0.7, 0.45][quality]));
      }
    }

    if (open && shoalN && s.shoal) {
      gl.useProgram(pShoal.p);
      gl.bindVertexArray(shoalVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, shoalVB);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.shoal.state);
      gl.uniform2f(pShoal.u.uCss, cssW, cssH);
      gl.uniform1f(pShoal.u.uScroll, s.scroll);
      gl.uniform1f(pShoal.u.uT, s.t);
      gl.uniform1f(pShoal.u.uPx, dpr);
      gl.uniform1f(pShoal.u.uAlpha, s.shoal.alpha);
      gl.uniform1f(pShoal.u.uClip, uClip);
      gl.drawArrays(gl.POINTS, 0, shoalN);
    }

    if (open && (s.bubbleAmt > 0.002 || s.burst > 0.002)) {
      gl.useProgram(pBubble.p);
      gl.bindVertexArray(bubbleVAO);
      gl.uniform2f(pBubble.u.uCss, cssW, cssH);
      gl.uniform1f(pBubble.u.uScroll, s.scroll);
      gl.uniform1f(pBubble.u.uT, s.t);
      gl.uniform1f(pBubble.u.uPx, dpr);
      gl.uniform1f(pBubble.u.uAmt, s.bubbleAmt);
      gl.uniform1f(pBubble.u.uBurst, s.burst);
      gl.uniform1f(pBubble.u.uClip, uClip);
      gl.drawArrays(gl.POINTS, 0, bubbleN);
    }

    gl.useProgram(pDust.p);
    gl.bindVertexArray(dustVAO);
    bindTex(5, flowOn ? fluid.velTex : zeroTex);
    gl.uniform1i(pDust.u.uFlow, 5);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(pDust.u.uCss, cssW, cssH);
    gl.uniform2f(pDust.u.uLamp, s.lampX, s.lampY);
    gl.uniform1f(pDust.u.uScroll, s.scroll);
    gl.uniform1f(pDust.u.uT, s.t);
    gl.uniform1f(pDust.u.uVel, s.vel);
    gl.uniform1f(pDust.u.uPx, dpr);
    gl.uniform1f(pDust.u.uFluid, flowOn ? 1 : 0);
    gl.uniform3fv(pDust.u.uColor, s.dustColor);
    gl.drawArrays(gl.POINTS, 0, dustN);

    if (nameN && s.nameVisible) {
      gl.useProgram(pName.p);
      gl.bindVertexArray(nameVAO);
      gl.uniform2f(pName.u.uCss, cssW, cssH);
      gl.uniform2f(pName.u.uMouse, s.mouseX, s.mouseY);
      gl.uniform2f(pName.u.uDrain, s.drainX, s.drainY);
      gl.uniform2f(pName.u.uFrom, s.from[0], s.from[1]);
      gl.uniform4f(pName.u.uBox, s.box.x, s.box.y, s.box.w, s.box.h);
      gl.uniform1f(pName.u.uT, s.t);
      gl.uniform1f(pName.u.uIntro, s.intro);
      gl.uniform1f(pName.u.uMelt, s.melt);
      gl.uniform1f(pName.u.uScroll, s.scroll);
      gl.uniform1f(pName.u.uMouseAmt, s.mouseAmt);
      gl.uniform1f(pName.u.uPx, dpr);
      gl.uniform1f(pName.u.uReform, s.reform);
      gl.uniform1f(pName.u.uSignY, s.signY);
      gl.uniform1f(pName.u.uRtl, s.rtl);
      gl.uniform3fv(pName.u.uC0, s.reform > 0 ? [0.72, 0.9, 1.0] : [1.0, 0.79, 0.45]);
      gl.uniform3fv(pName.u.uC1, s.reform > 0 ? [0.96, 0.99, 1.0] : [1.0, 0.93, 0.76]);
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

  return { gl, resize, setRoots, setBeast, setShoal, setName, setFossils, setChart, setMask, setLand, addRipple, addSeaRipple, render, lowerQuality };
}
