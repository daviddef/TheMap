/* The Record Atlas story tour: the engine. Loaded only when the tour opens (public/js/start-tour-gate.js fetches this file, start-tour.css and the
   chapters fragment /start-tour.html). Nothing in it runs until window.raTourInit(host, data, maskText) is called. */
(function(){
'use strict';
window.raTourInit=function(host,D,MASK_RLE){
const $=(s,r=host)=>r.querySelector(s), $$=(s,r=host)=>Array.from(r.querySelectorAll(s));
const TAU=Math.PI*2, RAD=Math.PI/180;
const clamp=(x,a=0,b=1)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const easeOut=t=>1-Math.pow(1-clamp(t),3);
const easeInOut=t=>{t=clamp(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const fract=x=>x-Math.floor(x);
function hash2(i,j){let h=(Math.imul(i,374761393)+Math.imul(j,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296}
function rngMaker(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
const MOB=()=>innerWidth<860;
const RMQ=matchMedia('(prefers-reduced-motion: reduce)');
let RM=RMQ.matches;
const SERIF='Fraunces, Georgia, "Times New Roman", serif', SANS='"Source Sans 3", "Helvetica Neue", Arial, sans-serif', MONO='"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/* ============ the land: a coarse 0.25 degree mask (Natural Earth 110m, rasterised at build time, run-length coded) ============ */
const MW=1440, MH=720, MASK=new Uint8Array(MW*MH);
(function(){const rows=MASK_RLE.split(';');for(let j=0;j<MH;j++){const runs=rows[j].split(',');let i=0,v=0;for(const r of runs){const n=parseInt(r,36);if(v)MASK.fill(1,j*MW+i,j*MW+i+n);i+=n;v^=1}}})();
const landAt=(lon,lat)=>{const i=((lon+180)*4)|0,j=((90-lat)*4)|0;return(i<0||i>=MW||j<0||j>=MH)?0:MASK[j*MW+i]};

/* ============ a lattice of dots, nested: level 0 is every 4 degrees, level 4 every 0.25 ============ */
const LAT0=-58, LAT1=84, LATU=.25, LONU=.3;
const NJ=Math.round((LAT1-LAT0)/LATU)+1, NI=Math.round(360/LONU);
const tzTab=new Uint8Array(Math.max(NJ,NI)+1);for(let n=0;n<tzTab.length;n++){if(n===0){tzTab[n]=4;continue}let c=0,m=n;while(!(m&1)&&c<4){m>>=1;c++}tzTab[n]=c}
const LV=[0,1,2,3,4].map(()=>({lon:[],lat:[],sd:[]}));
(function(){
  for(let j=0;j<NJ;j++){const lat=LAT0+j*LATU,tj=tzTab[j];
    for(let i=0;i<NI;i++){const ti=tzTab[i], lev=4-Math.min(tj,ti), lon=-180+i*LONU;
      let land;
      if(lev<=1){const dl=LATU*(1<<(4-lev))/3, dn=LONU*(1<<(4-lev))/3;let c=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)c+=landAt(lon+b*dn,lat+a*dl);land=c>=3}
      else land=landAt(lon,lat);
      if(land){const L=LV[lev];L.lon.push(lon);L.lat.push(lat);L.sd.push(hash2(i,j))}
    }}
  for(const L of LV){L.n=L.lon.length;L.lon=Float32Array.from(L.lon);L.lat=Float32Array.from(L.lat);L.sd=Float32Array.from(L.sd);L.cost=new Uint8Array(L.n)}
})();
function lowerBound(arr,n,x){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(arr[m]<x)lo=m+1;else hi=m}return lo}

/* ============ palette (dark values; the port reads the Atlas --acc-* tokens) ============ */
const PAL=['#5C7E8D','#4FC17F','#A9D24B','#E3B341','#F28C3A','#FF9A8C','#B592D9','#93A8B3','#5B7284','#D1A154','#77A87E','#C86A50','#4E9DAF','#6A808B','#6FB6C6','#E8E6DF'];
const PA=[.8,1,1,1,1,1,1,.95,.85,1,1,1,1,.7,1,1];
const C={base:0,free:1,account:2,index:3,mixed:4,paid:5,cat:6,onsite:7,none:8,hab:9,ita:10,yug:11,hrv:12,oth:13,acc:14,ink:15};

/* illustrative cost field: small coloured islands in a mostly grey world */
const BLOBS=[
  [15.3,45,3.0,[1,1,2,2,3,4,6,7],1],[12,43.5,3.6,[1,2,3,3,6],.55],[2.5,47,4.5,[3,6,7,5],.45],[-2,53,4,[5,5,3,2],.6],[19,50,4.5,[3,7,6,2],.5],
  [-88,39,11,[2,2,3,5,1],.6],[145,-35,7,[3,5,5,2],.6],[-58,-33,5,[3,6,2],.5],[26,-30,5,[3,7,2],.5],[30,-18,4,[7,6],.5],[78,22,7,[7,6,3],.4]
].filter(b=>b[2]>0);
function costField(lon,lat,sd){
  let tot=0,best=0,bl=null;
  const cl=Math.cos(lat*RAD);
  for(let k=0;k<BLOBS.length;k++){const b=BLOBS[k],dx=(lon-b[0])*cl,dy=lat-b[1],w=Math.exp(-(dx*dx+dy*dy)/(b[2]*b[2]));tot+=w*b[4];if(w>best){best=w;bl=b}}
  const p=.03+.8*Math.min(1,tot), u=fract(sd*91.7);
  if(u>=p)return C.none;
  const pick=fract(sd*377.1);
  if(bl&&best>.25)return bl[3][(pick*bl[3].length)|0];
  return 1+((pick*7)|0);
}

/* ============ views: one for the tour canvas, one for the stand-in map ============ */
function makeView(cv){return{cv,ctx:cv.getContext('2d'),W:0,H:0,dpr:1,fx:.5,fy:.5,cam:{lon:12,lat:24,lz:Math.log(330)},tcam:{lon:12,lat:24,lz:Math.log(330)},r:1.4,vw:330}}
function sizeView(v){const w=v.cv.clientWidth,h=v.cv.clientHeight;if(!w||!h)return false;const dpr=Math.min(window.devicePixelRatio||1,w*h>1.3e6?1.5:2);v.dpr=dpr;v.cv.width=Math.round(w*dpr);v.cv.height=Math.round(h*dpr);v.W=w;v.H=h;return true}
function stepCam(v,dt,jump){const c=v.cam,t=v.tcam,k=jump?1:1-Math.exp(-dt*2.2);c.lon+=(t.lon-c.lon)*k;c.lat+=(t.lat-c.lat)*k;c.lz+=(t.lz-c.lz)*k;v.vw=Math.exp(c.lz)}
let PX=0,PY=0;
function proj(v,lon,lat){const k=v.W/v.vw,cx=Math.max(.55,Math.cos(v.cam.lat*RAD));PX=v.W*v.fx+(lon-v.cam.lon)*k*cx;PY=v.H*v.fy-(lat-v.cam.lat)*k}
const OUT={c:0,a:1,b:0};
function drawDots(v,o){
  const ctx=v.ctx,W=v.W,H=v.H,cam=v.cam,vw=v.vw;
  const k=W/vw,cx=Math.max(.55,Math.cos(cam.lat*RAD)),kx=k*cx;
  const lonMin=cam.lon-(W*v.fx+30)/kx,lonMax=cam.lon+(W*(1-v.fx)+30)/kx,latMax=cam.lat+(H*v.fy+30)/k,latMin=cam.lat-(H*(1-v.fy)+30)/k;
  const s0=k*4, la=[0,0,0,0,0];let rT=1.2;
  for(let l=0;l<5;l++){const sp=s0/(1<<l);la[l]=sstep(3.2,6.5,sp);if(la[l]>.5)rT=clamp(.19*sp,.9,3.6)}
  v.r+=(rT-v.r)*(o.jump?1:Math.min(1,(o.dt||.016)*8));const r=v.r;
  const clock=o.clock||0,par=o.par,px=o.px||0,py=o.py||0,rip=o.ripples||[],fx=o.fx,dim=o.dim==null?1:o.dim,tw=o.tw;
  const P=new Array(16*6), G=[];for(let i=0;i<16;i++)G.push([]);
  const cxs=W*v.fx,cys=H*v.fy;
  for(let l=0;l<5;l++){
    if(la[l]<.01)continue;const L=LV[l],lat=L.lat,lon=L.lon,sd=L.sd,n=L.n;
    let i=lowerBound(lat,n,latMin);
    for(;i<n;i++){
      const la_=lat[i];if(la_>latMax)break;const lo=lon[i];if(lo<lonMin||lo>lonMax)continue;const s=sd[i];
      let sx=cxs+(lo-cam.lon)*kx,sy=cys-(la_-cam.lat)*k;
      if(par){const z=(s-.5)*2;sx+=px*9*z;sy+=py*9*z}
      OUT.c=0;OUT.a=1;OUT.b=0;
      if(fx){if(o.needCost){let cc=L.cost[i];if(!cc){cc=L.cost[i]=costField(lo,la_,s)+1}OUT.cost=cc-1}fx(lo,la_,s,OUT,sx,sy)}
      let e=0;
      for(let q=0;q<rip.length;q++){const R=rip[q],age=clock-R.t0;if(age<0||age>2.6)continue;const d=Math.hypot(sx-R.x,sy-R.y),w=R.w||70;const u=(d-age*R.sp)/w;e+=Math.exp(-u*u)*(1-age/2.6)*R.k}
      let a=OUT.a*dim,c=OUT.c,b=OUT.b;
      if(e>.04){a=Math.min(1,a+e*.9);b=Math.max(b,e);if(c===0||c===8)c=C.acc}
      if(tw)a*=.9+.1*Math.sin(clock*.9+s*37);
      const ab=Math.min(5,Math.round(a*la[l]*5));if(ab<=0)continue;
      const idx=c*6+ab;let p=P[idx];if(!p)p=P[idx]=new Path2D();p.moveTo(sx+r,sy);p.arc(sx,sy,r,0,TAU);
      if(b>.4)G[c].push(sx,sy,b);
    }
  }
  ctx.setTransform(v.dpr,0,0,v.dpr,0,0);ctx.clearRect(0,0,W,H);
  for(let c=0;c<16;c++){const g=G[c];if(!g.length)continue;ctx.fillStyle=PAL[c];ctx.beginPath();for(let q=0;q<g.length;q+=3){ctx.moveTo(g[q]+r*3.4,g[q+1]);ctx.arc(g[q],g[q+1],r*3.4,0,TAU)}ctx.globalAlpha=.17;ctx.fill()}
  for(let idx=0;idx<P.length;idx++){const p=P[idx];if(!p)continue;const c=(idx/6)|0,ab=idx%6;ctx.globalAlpha=ab/5*PA[c];ctx.fillStyle=PAL[c];ctx.fill(p)}
  ctx.globalAlpha=1;
}

/* ============ small drawing helpers ============ */
function txt(ctx,s,x,y,font,color,align,alpha){ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.textBaseline='alphabetic';if(alpha!=null)ctx.globalAlpha=alpha;ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#0B1218E6';ctx.strokeText(s,x,y);ctx.fillText(s,x,y);ctx.globalAlpha=1}
function rrect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function star5(ctx,cx,cy,R,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:R;ctx.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}ctx.closePath()}
function drawFlag(ctx,id,x,y,w,h){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  const bands=(cols,vert)=>{cols.forEach((c,i)=>{ctx.fillStyle=c;if(vert)ctx.fillRect(x+w*i/cols.length,y,w/cols.length+.5,h);else ctx.fillRect(x,y+h*i/cols.length,w,h/cols.length+.5)})};
  if(id==='ah'){ctx.fillStyle='#E0B73A';ctx.fillRect(x,y,w,h);ctx.fillStyle='#16110A';ctx.fillRect(x,y,w,h/2)}
  else if(id==='disp'){ctx.fillStyle='#24323C';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#6C7F8A';ctx.lineWidth=Math.max(1,w/40);for(let i=-h;i<w;i+=w/9){ctx.beginPath();ctx.moveTo(x+i,y+h);ctx.lineTo(x+i+h,y);ctx.stroke()}}
  else if(id==='it'){bands(['#1F9A5B','#F2F0EA','#D4363B'],true)}
  else if(id==='yu'){bands(['#2A4E9C','#F2F0EA','#C93A3A'],false);ctx.fillStyle='#C93A3A';ctx.strokeStyle='#E0B73A';ctx.lineWidth=Math.max(1,h/28);star5(ctx,x+w/2,y+h/2,h*.2,h*.08);ctx.fill();ctx.stroke()}
  else if(id==='hr'){bands(['#C8202F','#F2F0EA','#1F3F8F'],false);const sw=h*.3,sx=x+w/2-sw/2,sy=y+h/2-sw/2.2;ctx.fillStyle='#F2F0EA';ctx.fillRect(sx,sy,sw,sw*1.1);ctx.fillStyle='#C8202F';const q=sw/4;for(let a=0;a<4;a++)for(let b=0;b<4;b++)if((a+b)%2===0)ctx.fillRect(sx+b*q,sy+a*q*1.1,q,q*1.1);ctx.strokeStyle='#1F3F8F';ctx.lineWidth=Math.max(1,h/40);ctx.strokeRect(sx,sy,sw,sw*1.1)}
  ctx.restore();ctx.strokeStyle='#0008';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
$$('canvas[data-flag]').forEach(c=>drawFlag(c.getContext('2d'),c.dataset.flag,0,0,c.width,c.height));

/* ============ state ============ */
const S={open:false,i:0,t:0,clock:0,ripples:[],ptr:{x:0,y:0,sx:0,sy:0},typed:null};
const tour=makeView($('#tr-cv'));
const root=host, chEls=$$('.ch');
const ctxT=tour.ctx;
let stage={x:0,y:0,w:100,h:100};
/* on a phone the stage ends where the caption begins, and the caption can be five lines: measure the longest and tell the CSS (--narr-h) */
function fitNarr(ch){const n=$('.narr',ch);if(!n)return;const cb=$('.capbox',n);let capH=cb?cb.offsetHeight:0;$$('.cap',n).forEach(c=>{capH=Math.max(capH,c.offsetHeight)});ch.style.setProperty('--narr-h',Math.ceil(n.offsetHeight-(cb?cb.offsetHeight:0)+capH)+'px')}
function readStage(){const ch=$('.ch:not([hidden])',root);if(ch)fitNarr(ch);const el=$('.ch:not([hidden]) .st',root)||$('.st',root);if(!el)return;const r=el.getBoundingClientRect();stage={x:r.left,y:r.top,w:r.width,h:r.height}}
function homeCam(M){return M?{lon:14,lat:30,lz:Math.log(150)}:{lon:12,lat:24,lz:Math.log(330)}}
function setCam(v,c,jump){v.tcam.lon=c.lon;v.tcam.lat=c.lat;v.tcam.lz=c.lz!=null?c.lz:Math.log(c.vw);if(jump)stepCam(v,0,true)}

/* ============ chapters ============ */
const PLACES=D.places;
const P1={key:'fiume',cur:'',old:'',mt:-9,manual:false,yr:1850};
function rulerAt(pl,y){if(!pl.rulers)return null;for(const r of pl.rulers)if(y<r[0])return r;return pl.rulers[pl.rulers.length-1]}
function nameAt(pl,y){for(const n of pl.names)if(y<n[0])return n[1];return pl.names[pl.names.length-1][1]}
function setupYear1(){
  const pl=PLACES[P1.key],s=$('#tr-y1');s.min=pl.y0;s.max=pl.y1;s.value=pl.y0;P1.manual=false;P1.cur='';P1.old='';
  const stops=[];if(pl.rulers){let prev=pl.y0;pl.rulers.forEach(r=>{const e=Math.min(r[0],pl.y1),a=(prev-pl.y0)/(pl.y1-pl.y0)*100,b=(e-pl.y0)/(pl.y1-pl.y0)*100;stops.push(`${r[3]} ${a}% ${b}%`);prev=e});s.style.setProperty('--track',`linear-gradient(90deg,${stops.join(',')})`)}
  else{const b=(1982-pl.y0)/(pl.y1-pl.y0)*100;s.style.setProperty('--track',`linear-gradient(90deg,#51636E 0 ${b}%,#4FB6C6 ${b}% 100%)`)}
  {const ticks=[pl.y0];(pl.rulers||pl.names).forEach(r=>{if(r[0]>pl.y0&&r[0]<pl.y1&&r[0]-ticks[ticks.length-1]>=(pl.y1-pl.y0)*.07)ticks.push(r[0])});if(pl.y1-ticks[ticks.length-1]<(pl.y1-pl.y0)*.07)ticks.pop();ticks.push(pl.y1);$('#tr-y1t').innerHTML=ticks.map(y=>`<span style="left:${(y-pl.y0)/(pl.y1-pl.y0)*100}%">${y}</span>`).join('')}
  $('#tr-y1alt').textContent=P1.key==='fiume'?'Try '+PLACES.salisbury.names[0][1]:'Try '+PLACES.fiume.names[0][1];
  $('#tr-y1n').textContent=pl.note;
}
$('#tr-y1').addEventListener('input',()=>{P1.manual=true;redraw()});
$('#tr-y1alt').addEventListener('click',()=>{P1.key=P1.key==='fiume'?'salisbury':'fiume';setupYear1();placeCam();S.t=RM?11:1.4;P1.t0=S.t;redraw()});

/* spellings: particle letters */
const NP=560;
const pp={x:new Float32Array(NP),y:new Float32Array(NP),vx:new Float32Array(NP),vy:new Float32Array(NP),tx:new Float32Array(NP),ty:new Float32Array(NP),a:new Float32Array(NP),ta:new Float32Array(NP),sx:new Float32Array(NP),sy:new Float32Array(NP)};
const FORMS=D.forms.map((f,i)=>[f,[.15,2.6,4.4,6.0][i]]);
let pForm=-1,pFlyInit=false;
const off=document.createElement('canvas'),octx=off.getContext('2d',{willReadFrequently:true});
function sampleWord(word,size){
  octx.font=`600 ${size}px ${SERIF}`;const w=Math.ceil(octx.measureText(word).width)+20,h=Math.ceil(size*1.5);
  off.width=w;off.height=h;octx.clearRect(0,0,w,h);octx.font=`600 ${size}px ${SERIF}`;octx.textAlign='center';octx.textBaseline='middle';octx.fillStyle='#fff';octx.fillText(word,w/2,h/2+size*.04);
  const d=octx.getImageData(0,0,w,h).data,g=Math.max(2,Math.round(size/17)),pts=[];
  for(let y=0;y<h;y+=g)for(let x=0;x<w;x+=g)if(d[(y*w+x)*4+3]>120)pts.push([x-w/2,y-h/2]);
  const rnd=rngMaker(7+word.length);for(let i=pts.length-1;i>0;i--){const j=(rnd()*(i+1))|0;const t=pts[i];pts[i]=pts[j];pts[j]=t}
  return pts;
}
function wordCenter(){const M=MOB();return{x:stage.x+stage.w/2,y:M?stage.y+stage.h*.2:stage.y+stage.h*.2,size:M?Math.min(54,innerWidth*.13):clamp(innerWidth*.05,56,92)}}
function setWord(word,burst){
  const wc=wordCenter(),pts=sampleWord(word,wc.size),rnd=rngMaker(31);
  for(let i=0;i<NP;i++){
    if(i<pts.length){pp.tx[i]=wc.x+pts[i][0];pp.ty[i]=wc.y+pts[i][1];pp.ta[i]=.95}
    else{pp.tx[i]=wc.x+(rnd()-.5)*wc.size*5;pp.ty[i]=wc.y+(rnd()-.5)*wc.size;pp.ta[i]=0}
    if(burst){const a=rnd()*TAU,s=140+rnd()*260;pp.vx[i]+=Math.cos(a)*s;pp.vy[i]+=Math.sin(a)*s}
  }
}
function initParticles(){const wc=wordCenter(),rnd=rngMaker(5);for(let i=0;i<NP;i++){pp.x[i]=wc.x+(rnd()-.5)*wc.size*8;pp.y[i]=wc.y+(rnd()-.5)*wc.size*4;pp.vx[i]=pp.vy[i]=0;pp.a[i]=0}pForm=-1;pFlyInit=false}
const PINS2=D.pins;

/* regimes: illustrative borders */
function reg(lon,lat,y){
  if(lon<6||lon>29||lat<39||lat>51.6)return C.base;
  const ital=lon<13.5&&lat<46.6&&lat>37, corner=lon>=13.4&&lon<=15.3&&lat>=44.3&&lat<=46.0, core=lon>=13.4&&lon<=23&&lat>=41.5&&lat<=46.7, north=lon>=9.5&&lat>=46.0&&lon<26;
  if(y<1918){if(ital)return y>=1861?C.ita:C.oth;if(core||corner)return lat>42.8?C.hab:C.oth;if(north)return C.hab;return C.oth}
  if(y<1945){if(ital)return C.ita;if(corner)return y>=1924?C.ita:C.oth;if(core)return C.yug;return C.oth}
  if(y<1991){if(ital)return C.ita;if(core||corner)return C.yug;return C.oth}
  if(ital)return C.ita;
  if(core||corner){if(lat>45.4&&lon<16.4)return C.oth;if(lon>16&&lat<45.2)return C.oth;if(lon>19.4)return C.oth;return C.hrv}
  return C.oth;
}

/* tree */
const PEOPLE=[
  {k:'you',n:'You',s:'You',pl:'Melbourne'},{k:'mum',n:'Mother',s:'Mother',pl:'Melbourne'},{k:'dad',n:'Father',s:'Father',pl:'Melbourne'},
  {k:'nonna',n:'Nonna',s:'Nonna',by:1921,dy:1998,pl:'Fiume'},{k:'nonno',n:'Nonno',s:'Nonno',by:1919,dy:1987,pl:'Trieste'},
  {k:'nm',n:"Nonna's mother",s:'Her mother',by:1895,dy:1951,pl:'Fiume'},{k:'nf',n:"Nonna's father",s:'Her father',by:1890,dy:1944,pl:'Fiume'},
  {k:'om',n:"Nonno's mother",s:'His mother',by:1893,dy:1960,pl:'Trieste'},{k:'of',n:"Nonno's father",s:'His father',by:1888,dy:1950,pl:'Trieste'}
];
const TREEPOS={you:[.63,.9],mum:[.41,.66],dad:[.86,.66],nonna:[.2,.42],nonno:[.62,.42],nm:[.08,.17],nf:[.32,.17],om:[.52,.17],of:[.76,.17]};
const SKYPOS={you:[.56,.82],mum:[.42,.62],dad:[.84,.68],nonna:[.22,.46],nonno:[.6,.4],nm:[.1,.2],nf:[.34,.1],om:[.56,.2],of:[.84,.26]};
const EDGES=[['you','mum'],['you','dad'],['mum','nonna'],['mum','nonno'],['nonna','nm'],['nonna','nf'],['nonno','om'],['nonno','of']];
const VIEWS=[['tree',0],['fan',5.2],['sky',7.5],['life',9.8],['lanes',12.0],['tree',14.2]];
const TN={nodes:null,view:'tree',edgeA:0,tree:1};
function initNodes(){TN.nodes=PEOPLE.map((p,i)=>({p,x:0,y:0,w:10,h:10,r:4,a:0,at:1.9+i*.28,tx:0,ty:0,tw:10,th:10,mode:'tree',started:false}));TN.byk={};TN.nodes.forEach(n=>TN.byk[n.p.k]=n);TN.view='tree';TN.edgeA=0}
function viewAt(t){let v='tree';for(const q of VIEWS)if(t>=q[1])v=q[0];return v}
function layoutTree(view){
  const M=MOB(),R=stage,W=R.w,H=R.h,N=TN.nodes;
  const cardW=M?86:116,cardH=M?38:46;
  if(view==='tree'){N.forEach(n=>{const q=TREEPOS[n.p.k];n.tx=R.x+Math.max(cardW/2,Math.min(W-cardW/2,q[0]*W));n.ty=R.y+(M?44:54)+q[1]*(H-(M?70:90));n.tw=cardW;n.th=cardH;n.mode='card'})}
  else if(view==='fan'){
    const cx=R.x+W/2,cy=R.y+H-(M?26:36),Rm=Math.min(H-(M?70:110),W/2-(M?34:46)),rad=[0,Rm*.36,Rm*.68,Rm];
    const slots={you:[0,0],mum:[1,0],dad:[1,1],nonna:[2,0],nonno:[2,1],nm:[3,0],nf:[3,1],om:[3,2],of:[3,3]};
    N.forEach(n=>{const [g,s]=slots[n.p.k];if(g===0){n.tx=cx;n.ty=cy}else{const th=Math.PI-(s+.5)/(1<<g)*Math.PI;n.tx=cx+Math.cos(th)*rad[g];n.ty=cy-Math.sin(th)*rad[g]}n.tw=M?58:72;n.th=M?24:28;n.mode='chip'})}
  else if(view==='sky'){N.forEach(n=>{const q=SKYPOS[n.p.k];n.tx=R.x+16+q[0]*(W-32);n.ty=R.y+(M?44:56)+q[1]*(H-(M?80:100));const s=n.p.k==='you'?13:n.p.by?(8+(1930-n.p.by)/12):9;n.tw=n.th=Math.max(8,Math.min(14,s));n.mode='star'})}
  else if(view==='life'){
    const order=['nf','of','om','nm','nonno','nonna','mum','dad','you'],x0=R.x+(M?82:112),x1=R.x+W-(M?64:84),rowH=(H-(M?64:84))/order.length;
    const yr=y=>x0+(y-1885)/(2000-1885)*(x1-x0);
    N.forEach(n=>{const i=order.indexOf(n.p.k);n.ty=R.y+(M?54:68)+i*rowH+rowH/2;if(n.p.by){n.tx=(yr(n.p.by)+yr(n.p.dy))/2;n.tw=yr(n.p.dy)-yr(n.p.by);}else{n.tx=x1-14;n.tw=22}n.th=M?11:14;n.mode='bar'})}
  else if(view==='lanes'){
    const lanes={Fiume:.2,Trieste:.5,Melbourne:.8},x0=R.x+(M?76:104),x1=R.x+W-(M?36:46);
    const FX={nf:.07,nm:.27,nonna:.47,of:.07,om:.27,nonno:.47,mum:.64,dad:.81,you:.96};
    N.forEach(n=>{n.ty=R.y+(M?54:66)+lanes[n.p.pl]*(H-(M?90:120));const f=FX[n.p.k];n.tx=x0+f*(x1-x0);n.tw=M?58:80;n.th=M?26:32;n.mode='chip'})}
}
function drawTree(t,dt){
  const ctx=ctxT,M=MOB(),R=stage;
  if(!TN.nodes)initNodes();
  const view=RM?'tree':viewAt(t);
  if(view!==TN.view||!TN.laid||TN.lw!==R.w+'x'+R.h+M){TN.view=view;TN.lw=R.w+'x'+R.h+M;TN.laid=true;layoutTree(view);if(RM)TN.nodes.forEach(n=>{n.x=n.tx;n.y=n.ty;n.w=n.tw;n.h=n.th})}
  const ft=Math.min(1,dt*6.5),fileX=R.x+(M?46:64),fileY=R.y+R.h*.86;
  const inP=easeOut((t-.2)/1.2);
  // file
  const fa=RM?.0:clamp(inP)*(1-sstep(4.6,5.8,t));
  if(fa>.01){
    const fx=lerp(R.x-120,fileX,inP),fyy=fileY,fw=M?44:54,fh=M?56:68;
    ctx.save();ctx.globalAlpha=fa;ctx.fillStyle='#1E2A34';ctx.strokeStyle='#6FB6C6';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(fx-fw/2,fyy-fh/2);ctx.lineTo(fx+fw/2-12,fyy-fh/2);ctx.lineTo(fx+fw/2,fyy-fh/2+12);ctx.lineTo(fx+fw/2,fyy+fh/2);ctx.lineTo(fx-fw/2,fyy+fh/2);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(fx+fw/2-12,fyy-fh/2);ctx.lineTo(fx+fw/2-12,fyy-fh/2+12);ctx.lineTo(fx+fw/2,fyy-fh/2+12);ctx.stroke();ctx.restore();
    txt(ctx,'family.ged',fx,fyy+fh/2+16,`500 12px ${MONO}`,'#A6B4BC','center',fa);
  }
  TN.fileX=fileX;TN.fileY=fileY;
  const eA={tree:1,fan:.7,sky:.5,life:0,lanes:0}[view];TN.edgeA+=(eA-TN.edgeA)*(RM?1:Math.min(1,dt*5));
  const N=TN.nodes;
  for(const n of N){
    const on=RM||t>=n.at;
    if(on&&!n.started){n.started=true;n.x=fileX;n.y=fileY;n.w=8;n.h=8}
    if(on){const k=RM?1:ft;n.x+=(n.tx-n.x)*k;n.y+=(n.ty-n.y)*k;n.w+=(n.tw-n.w)*k;n.h+=(n.th-n.h)*k;n.a+=((1)-n.a)*(RM?1:Math.min(1,dt*4))}
  }
  // fan guides: rings and the faint places where nobody is recorded
  TN.fanA=(TN.fanA||0)+(((view==='fan')?1:0)-(TN.fanA||0))*(RM?1:Math.min(1,dt*5));
  if(TN.fanA>.02){const cx=R.x+R.w/2,cy=R.y+R.h-(M?26:36),Rm=Math.min(R.h-(M?70:110),R.w/2-(M?34:46));ctx.save();ctx.strokeStyle='#6FB6C6';ctx.globalAlpha=.16*TN.fanA;ctx.lineWidth=1;[.36,.68,1].forEach(f=>{ctx.beginPath();ctx.arc(cx,cy,Rm*f,Math.PI,TAU);ctx.stroke()});for(let s=1;s<8;s++){const th=Math.PI-s/8*Math.PI;ctx.beginPath();ctx.moveTo(cx+Math.cos(th)*Rm*.68,cy-Math.sin(th)*Rm*.68);ctx.lineTo(cx+Math.cos(th)*Rm,cy-Math.sin(th)*Rm);ctx.stroke()}ctx.restore()}
  // edges
  if(TN.edgeA>.02){
    ctx.save();ctx.strokeStyle='#6FB6C6';ctx.lineWidth=view==='sky'?1:1.5;if(view==='sky')ctx.setLineDash([2,4]);
    for(const [c,p] of EDGES){const a=TN.byk[c],b=TN.byk[p];if(a.a<.3||b.a<.3)continue;const al=Math.min(a.a,b.a)*TN.edgeA*(view==='sky'?.55:.6);ctx.globalAlpha=al;ctx.beginPath();
      if(view==='tree'){const y0=a.y-a.h/2,y1=b.y+b.h/2,ym=(y0+y1)/2;ctx.moveTo(a.x,y0);ctx.bezierCurveTo(a.x,ym,b.x,ym,b.x,y1)}else{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}
      ctx.stroke()}
    ctx.restore();
  }
  // nodes
  for(const n of N){
    if(n.a<.02)continue;const p=n.p,x=n.x,y=n.y,w=n.w,h=n.h,star=n.mode==='star',bar=n.mode==='bar';
    ctx.globalAlpha=n.a;
    if(star){
      const g=ctx.createRadialGradient(x,y,0,x,y,w*2.6);g.addColorStop(0,'#E8E6DFCC');g.addColorStop(1,'#E8E6DF00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,w*2.6,0,TAU);ctx.fill();
      ctx.fillStyle=p.k==='you'?'#6FB6C6':'#F0E6CC';ctx.beginPath();ctx.arc(x,y,w/2,0,TAU);ctx.fill();
      txt(ctx,p.s,x+w+4,y+4,`400 ${M?11:12}px ${SANS}`,'#A6B4BC','left',n.a);
    }else if(bar){
      const living=!p.by;ctx.fillStyle=living?'#46596A':'#6FB6C6';rrect(ctx,x-w/2,y-h/2,w,h,h/2);ctx.fill();
      txt(ctx,p.s,R.x+4,y+4,`600 ${M?11:12.5}px ${SANS}`,'#E8E6DF','left',n.a);
      txt(ctx,living?'living':`${p.by}-${p.dy}`,x+w/2+6,y+4,`400 10px ${MONO}`,'#8797A0','left',living?0:n.a*.9);
    }else{
      const big=h>40, fill=p.k==='you'?'#1B2E36':'#17212A';
      ctx.fillStyle=fill;ctx.strokeStyle=p.k==='you'?'#6FB6C6':'#3F515C';ctx.lineWidth=1.2;rrect(ctx,x-w/2,y-h/2,w,h,big?9:6);ctx.fill();ctx.stroke();
      const lab=(big||n.mode==='card')?p.n:p.s;
      if(big){txt(ctx,lab,x,y-2,`600 ${M?12:13.5}px ${SANS}`,'#E8E6DF','center',n.a);txt(ctx,p.by?`${p.by}-${p.dy}`:'name only',x,y+14,`400 ${M?10:11}px ${MONO}`,'#8797A0','center',n.a)}
      else{ctx.font=`600 ${M?11:12}px ${SANS}`;let s=p.s;while(ctx.measureText(s).width>w-8&&s.length>3)s=s.slice(0,-1);txt(ctx,s,x,y+4,`600 ${M?11:12}px ${SANS}`,'#E8E6DF','center',n.a)}
    }
    ctx.globalAlpha=1;
  }
  // lane labels
  if(view==='lanes'){const lanes=[['Fiume',.2],['Trieste',.5],['Melbourne',.8]];lanes.forEach(l=>{const y=R.y+(M?54:66)+l[1]*(R.h-(M?90:120));ctx.strokeStyle='#2A3841';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(R.x,y+(M?20:25));ctx.lineTo(R.x+R.w,y+(M?20:25));ctx.stroke();txt(ctx,l[0],R.x,y-(M?16:22),`500 11px ${MONO}`,'#8797A0','left')})}
  // the red cross: a line that stops here
  if(t>=14.5||RM){const d=TN.byk.dad,al=RM?1:clamp((t-14.5)/.6);if(d.a>.5&&view==='tree'){const x=d.x,y=d.y+d.h/2+12;ctx.save();ctx.globalAlpha=al;ctx.strokeStyle='#D66E55';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-5,y-5);ctx.lineTo(x+5,y+5);ctx.moveTo(x+5,y-5);ctx.lineTo(x-5,y+5);ctx.stroke();ctx.restore();txt(ctx,'no parent recorded',x,y+20,`400 10px ${MONO}`,'#D66E55','center',al)}}
  // view chips
  const chips=$$('#tr-vchips .chip');chips.forEach(c=>c.classList.toggle('on',c.dataset.v===view&&t>=5))
}

/* compass */
const JOURNEY=[{n:'Fiume',lon:14.44,lat:45.33,y:1921,l:'Fiume'},{n:'Genoa',lon:8.93,lat:44.41,y:1949,l:'Genoa'},{n:'Melbourne',lon:144.96,lat:-37.81,y:1950.3,l:'Melbourne'}];
const C8={manual:false};
$('#tr-y8').addEventListener('input',()=>{C8.manual=true;redraw()});
function drawCompass(t,dt){
  const ctx=ctxT,v=tour,M=MOB();
  const yr=C8.manual?+$('#tr-y8').value:(RM?1951:lerp(1921,1951,easeInOut((t-1.2)/8)));
  if(!C8.manual)$('#tr-y8').value=yr;
  $('#tr-y8v').textContent=Math.floor(yr);
  const pts=JOURNEY.map(p=>{proj(v,p.lon,p.lat);return[PX,PY]});
  // arcs
  for(let i=0;i<2;i++){
    const a=pts[i],b=pts[i+1],y0=JOURNEY[i].y,y1=JOURNEY[i+1].y,pr=clamp((yr-y0)/(y1-y0));if(pr<=0)continue;
    const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2-Math.hypot(b[0]-a[0],b[1]-a[1])*.28-8;
    ctx.save();ctx.strokeStyle='#8FCEDC';ctx.lineWidth=2;ctx.setLineDash([2,6]);ctx.lineCap='round';ctx.beginPath();
    const N=40,upto=Math.floor(N*pr);for(let q=0;q<=upto;q++){const u=q/N,x=(1-u)*(1-u)*a[0]+2*(1-u)*u*mx+u*u*b[0],y=(1-u)*(1-u)*a[1]+2*(1-u)*u*my+u*u*b[1];q?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.restore();
    if(pr<1){const u=pr,x=(1-u)*(1-u)*a[0]+2*(1-u)*u*mx+u*u*b[0],y=(1-u)*(1-u)*a[1]+2*(1-u)*u*my+u*u*b[1];drawCase(ctx,x,y,M?.8:1)}
  }
  // pins
  JOURNEY.forEach((p,i)=>{const drop=clamp((yr-p.y+.6)/1.4);if(drop<=0)return;const [x,y]=pts[i],e=RM?1:easeOut(drop),bounce=RM?0:Math.sin(drop*Math.PI*2.2)*(1-drop)*10;
    const yy=y-(1-e)*60-Math.max(0,bounce);
    ctx.save();ctx.globalAlpha=Math.min(1,drop*2);
    ctx.fillStyle='#D66E55';ctx.beginPath();ctx.arc(x,yy-14,7,0,TAU);ctx.fill();ctx.beginPath();ctx.moveTo(x-5,yy-10);ctx.lineTo(x,yy);ctx.lineTo(x+5,yy-10);ctx.fill();ctx.fillStyle='#0B1218';ctx.beginPath();ctx.arc(x,yy-14,2.5,0,TAU);ctx.fill();
    if(drop>=1&&!RM){const ph=(S.clock*.8+i*.3)%1;ctx.strokeStyle='#D66E55';ctx.globalAlpha=.5*(1-ph);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,4+ph*16,0,TAU);ctx.stroke()}
    ctx.restore();
    const right=i===1?-1:1;
    txt(ctx,`${p.l} ${Math.floor(p.y)}`,x+(i===1?-12:12),y+(i===2?22:i===1?20:20),`500 ${M?11:12.5}px ${MONO}`,'#E8E6DF',i===1?'right':'left',Math.min(1,drop*2));
  });
  // suitcase at the end
  if(yr>=JOURNEY[2].y){const [x,y]=pts[2];drawCase(ctx,x+(M?-18:-22),y-34,M?.9:1.1)}
}
function drawCase(ctx,x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='#D1A154';ctx.strokeStyle='#0B1218';ctx.lineWidth=1.2;rrect(ctx,-8,-5,16,11,2);ctx.fill();ctx.stroke();ctx.strokeStyle='#D1A154';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-3,-5);ctx.lineTo(-3,-8);ctx.lineTo(3,-8);ctx.lineTo(3,-5);ctx.stroke();ctx.restore()}

/* chapter table */
const CH=[];
const wc=()=>({x:stage.x+stage.w/2,y:stage.y+stage.h/2});
CH[0]={still:6.5,cam:M=>homeCam(M),
  enter(){S.ripples.push({x:stage.x+stage.w/2,y:stage.y+stage.h/2,t0:S.clock+.3,sp:380,k:1.1})},
  fx(lo,la,s,o){const e=0;o.a=.9},
  draw(t){const ctx=ctxT;proj(tour,14.44,45.33);if(!RM&&t>3&&S.clock-(CH[0].last||0)>3.4){CH[0].last=S.clock;S.ripples.push({x:PX,y:PY,t0:S.clock,sp:300,k:.8,w:90})}const a=sstep(3.2,4.2,t);if(a>0&&!RM||RM){const ph=(S.clock*.7)%1;ctx.save();ctx.strokeStyle='#6FB6C6';ctx.fillStyle='#6FB6C6';ctx.globalAlpha=(RM?.9:a*.9);ctx.beginPath();ctx.arc(PX,PY,3,0,TAU);ctx.fill();if(!RM){ctx.globalAlpha=a*(1-ph)*.8;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(PX,PY,4+ph*22,0,TAU);ctx.stroke()}ctx.restore()}}
};
CH[1]={still:11,cam:M=>{const c=PLACES[P1.key].cam;return{lon:c.lon,lat:c.lat,lz:Math.log(M?c.mvw:c.vw)}},
  enter(){setupYear1();P1.t0=0},
  fx(lo,la,s,o){},
  draw(t,dt){
    const ctx=ctxT,pl=PLACES[P1.key],M=MOB();
    const yr=P1.manual?+$('#tr-y1').value:(RM?pl.y1-(P1.key==='fiume'?0:0):lerp(pl.y0,pl.y1,easeInOut((t-1.4)/8.4)));
    if(!P1.manual)$('#tr-y1').value=yr;
    const Y=Math.round(yr);$('#tr-y1v').textContent=Y;
    const nm=nameAt(pl,Y);if(nm!==P1.cur){P1.old=P1.cur;P1.cur=nm;P1.mt=S.clock}
    const rl=rulerAt(pl,Y);$('#tr-y1w').textContent=rl?rl[1]:(pl.kind?(Y<pl.names[0][0]?pl.kind:'the name today'):'');
    proj(tour,pl.lon,pl.lat);const x=PX,y=PY;
    // pin with pulse
    const ph=(S.clock*.6)%1;ctx.save();ctx.fillStyle='#D66E55';ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.fill();if(!RM){ctx.strokeStyle='#D66E55';ctx.globalAlpha=.7*(1-ph);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,5+ph*20,0,TAU);ctx.stroke()}ctx.restore();
    const fs=M?36:clamp(innerWidth*.034,40,58),ly=y-(M?62:84),m=RM?1:easeOut((S.clock-P1.mt)/.8);
    ctx.save();ctx.strokeStyle='#6FB6C6';ctx.globalAlpha=.6;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,ly+8);ctx.stroke();ctx.restore();
    const showFlag=!!rl,fw=showFlag?fs*1.15:0,fh=fs*.76;
    ctx.font=`600 ${fs}px ${SERIF}`;const tw=Math.max(ctx.measureText(P1.cur).width,ctx.measureText(P1.old||'').width*(m<1?1:0));
    const total=tw+(showFlag?fw+14:0),x0=Math.max(12,Math.min(tour.W-total-12,x-total/2));
    if(showFlag){drawFlag(ctx,rl[2],x0,ly-fh+4,fw,fh)}
    const tx=x0+(showFlag?fw+14:0);
    if(P1.old&&m<1){txt(ctx,P1.old,tx,ly-m*18,`600 ${fs}px ${SERIF}`,'#E8E6DF','left',1-m)}
    txt(ctx,P1.cur,tx,ly+(1-m)*(P1.old?18:0),`600 ${fs}px ${SERIF}`,P1.cur==='Fiume'||P1.cur==='Salisbury'?'#D1A154':'#8FCEDC','left',P1.old?m:1);
    if(rl)txt(ctx,rl[1],x0,ly+22,`400 ${M?11:12.5}px ${MONO}`,'#A6B4BC','left',1);
  }
};
CH[2]={still:15,cam:M=>M?{lon:22,lat:30,lz:Math.log(270)}:{lon:20,lat:27,lz:Math.log(318)},
  enter(){initParticles()},
  fx(lo,la,s,o){o.a=.55},
  draw(t,dt){
    const ctx=ctxT,v=tour,M=MOB();
    if(pForm===-1){setWord(FORMS[0][0],false);pForm=0}
    for(let q=pForm+1;q<FORMS.length;q++)if(t>=FORMS[q][1]){pForm=q;setWord(FORMS[q][0],!RM)}
    const flyT=7.4,flying=t>=flyT;
    if(flying&&!pFlyInit){pFlyInit=true;for(let i=0;i<NP;i++){pp.sx[i]=pp.x[i];pp.sy[i]=pp.y[i]}}
    const jr=rngMaker(11),pins=PINS2.map(p=>{proj(v,p[1],p[2]);return[PX,PY,p[0]]});
    ctx.save();
    for(let i=0;i<NP;i++){
      if(RM&&!flying){pp.x[i]=pp.tx[i];pp.y[i]=pp.ty[i];pp.a[i]=pp.ta[i]}
      else if(!flying){const k=RM?1:Math.min(1,dt*1);pp.vx[i]+=((pp.tx[i]-pp.x[i])*38-pp.vx[i]*9)*dt;pp.vy[i]+=((pp.ty[i]-pp.y[i])*38-pp.vy[i]*9)*dt;pp.x[i]+=pp.vx[i]*dt;pp.y[i]+=pp.vy[i]*dt;pp.a[i]+=(pp.ta[i]-pp.a[i])*Math.min(1,dt*6)}
      else{
        const g=i%6,pn=pins[g],r1=jr(),r2=jr(),ex=pn[0]+(r1-.5)*(g===0?44:34),ey=pn[1]+(r2-.5)*(g===0?44:34);
        const u=RM?1:clamp((t-flyT-(i%60)*.014)/1.5),e=easeInOut(u);
        const sx=pp.sx[i],sy=pp.sy[i],mx=(sx+ex)/2,my=Math.min(sy,ey)-90-(i%7)*8;
        pp.x[i]=(1-e)*(1-e)*sx+2*(1-e)*e*mx+e*e*ex;pp.y[i]=(1-e)*(1-e)*sy+2*(1-e)*e*my+e*e*ey;
        pp.a[i]+=(pp.ta[i]-pp.a[i])*Math.min(1,(dt||1)*6);if(RM)pp.a[i]=pp.ta[i];
      }
    }
    for(let g=0;g<6;g++){
      ctx.fillStyle=flying&&g>0?'#F0E6CC':'#8FCEDC';ctx.beginPath();
      for(let i=g;i<NP;i+=6){const a=pp.a[i];if(a<.05)continue;ctx.moveTo(pp.x[i]+1.7,pp.y[i]);ctx.arc(pp.x[i],pp.y[i],1.7,0,TAU)}
      ctx.globalAlpha=.9;ctx.fill();
    }
    ctx.globalAlpha=1;ctx.restore();
    // pins and labels
    const lt=sstep(8.6,9.6,t);
    if(flying||RM){pins.forEach((p,i)=>{ctx.fillStyle='#E8E6DF';ctx.globalAlpha=Math.max(lt,RM?1:0);ctx.beginPath();ctx.arc(p[0],p[1],3,0,TAU);ctx.fill();
      if(i===0){txt(ctx,D.forms[0],p[0]-12,p[1]+(M?30:36),`400 ${M?11:12.5}px ${MONO}`,'#E8E6DF','right',Math.max(lt,RM?1:0));txt(ctx,D.forms.slice(1,3).join(' · '),p[0]-12,p[1]+(M?44:52),`400 ${M?11:12.5}px ${MONO}`,'#E8E6DF','right',Math.max(lt,RM?1:0))}
      else txt(ctx,`${D.forms[3]} · ${p[2]}`,p[0],p[1]+(M?26:30),`400 ${M?10.5:12}px ${MONO}`,'#E8E6DF','center',Math.max(lt,RM?1:0));
      ctx.globalAlpha=1})}
    if(!flying){const wcn=wordCenter();const f=FORMS[Math.max(0,pForm)];txt(ctx,pForm===0?'the family spelling':'another spelling in the catalogue',wcn.x,wcn.y+wcn.size*.95,`400 ${M?11:12.5}px ${MONO}`,'#8797A0','center',1)}
  }
};
CH[3]={still:14,cam:M=>M?{lon:16.5,lat:45,lz:Math.log(17)}:{lon:16.5,lat:45.2,lz:Math.log(27)},
  yr:1850,
  enter(){CH[3].yr=1850},
  fx(lo,la,s,o){const r=reg(lo,la,CH[3].yr);if(r){o.c=r;o.a=r===C.oth?.7:1;if(r!==C.oth)o.b=.5}else o.a=.3},
  draw(t,dt){
    const ctx=ctxT,v=tour,M=MOB();
    CH[3].yr=RM?2000:lerp(1850,2000,easeInOut((t-2.4)/7.6));$('#tr-y3v').textContent=Math.round(CH[3].yr);
    proj(v,14.44,45.33);const x=PX,y=PY;ctx.save();ctx.fillStyle='#E8E6DF';ctx.beginPath();ctx.arc(x,y,4,0,TAU);ctx.fill();txt(ctx,'Fiume / Rijeka',x+9,y+4,`500 ${M?11:12.5}px ${MONO}`,'#E8E6DF','left');ctx.restore();
    const c3=$('#tr-c3');if(c3){const lx=clamp(x-stage.x+16,0,Math.max(0,stage.w-190)),ly=clamp(y-stage.y-76,50,stage.h-120);c3.style.left=lx+'px';c3.style.top=ly+'px'}
    const ha=RM?1:sstep(10.4,11.6,t);
    if(ha>.01){
      const k=v.W/v.vw,cl=Math.max(.55,Math.cos(v.cam.lat*RAD));
      const hubs=D.hubs;
      for(const h of hubs){proj(v,h[0],h[1]);ctx.save();ctx.globalAlpha=ha;ctx.strokeStyle=h[4];ctx.fillStyle=h[4];ctx.lineWidth=1.6;ctx.setLineDash([6,6]);ctx.beginPath();ctx.ellipse(PX,PY,h[2]*k*cl,h[2]*k,0,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=ha*.07;ctx.fill();ctx.restore();
        txt(ctx,h[3],PX,Math.min(PY+(h[5]>0?h[2]*k+20:-h[2]*k-10),stage.y+stage.h-(M?190:150)),`500 ${M?12:14}px ${SANS}`,h[4],'center',ha)}
      proj(v,18.0,45.6);txt(ctx,D.hubNote,PX,PY,`400 ${M?9.5:11}px ${MONO}`,'#E8E6DF','center',ha*.9)
    }
  }
};
// ch4: sweep and shelf
CH[4]={still:12,cam:M=>M?{lon:15,lat:45,lz:Math.log(22)}:{lon:15.4,lat:44.6,lz:Math.log(30)},
  camAt(t,M){return t<5.2?(M?{lon:10,lat:30,lz:Math.log(150)}:{lon:14,lat:30,lz:Math.log(250)}):CH[4].cam(M)},
  needCost:true,
  sweep:0,
  fx(lo,la,s,o){
    const R=CH[4].sweep,cl=Math.cos(la*RAD),d=Math.hypot((lo-15)*cl,la-45);
    if(d<R){o.c=o.cost;o.a=o.cost===C.none?.85:1;if(R-d<5)o.b=.9*(1-(R-d)/5)}else{o.c=C.none;o.a=.6}
  },
  draw(t,dt){
    const ctx=ctxT,v=tour,M=MOB();
    CH[4].sweep=RM?400:Math.max(0,(t-1.6)*58);
    proj(v,14.44,45.33);const x=PX,y=PY;
    const sa=RM?1:sstep(6.4,7.2,t);
    if(sa>.01){
      ctx.save();ctx.fillStyle='#E8E6DF';ctx.beginPath();ctx.arc(x,y,3.5,0,TAU);ctx.fill();ctx.restore();
      const cols=[1,2,3,4,5,6,7],bx=x+(M?14:22),by=y-(M?14:18);let idx=0;
      for(let col=0;col<5;col++){const n=3+((col*2)%3);for(let r=0;r<n;r++){const g=RM?1:easeOut((t-6.4-idx*.06)/.5);idx++;if(g<=0)continue;const h=(M?15:20)+(((col*7+r*3)%5)*2),w=M?5:6.5,xx=bx+col*(w+2),yy=by-r*(h+2)*.0-g*0;const yb=by-r*(M?17:22);
        ctx.fillStyle=PAL[cols[(col*3+r*2)%7]];ctx.globalAlpha=.95;ctx.fillRect(xx,yb-h*g,w,h*g);ctx.globalAlpha=1}}
      txt(ctx,'register volumes',bx,by+16,`400 ${M?10.5:12}px ${MONO}`,'#A6B4BC','left',sa);
      txt(ctx,D.volumesText+' in the Atlas',bx,by+31,`400 ${M?10.5:12}px ${MONO}`,'#E8E6DF','left',sa)
    }
    const ga=RM?1:sstep(10.2,11,t);
    if(ga>.01){proj(v,18.2,43.4);const gx=PX,gy=PY;ctx.save();ctx.globalAlpha=ga;ctx.strokeStyle='#E8E6DF';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(gx,gy,9,0,TAU);ctx.stroke();ctx.beginPath();ctx.moveTo(gx+7,gy+7);ctx.lineTo(gx+30,gy+30);ctx.lineTo(gx+(M?56:92),gy+30);ctx.stroke();ctx.restore();txt(ctx,'nobody has looked',gx+(M?60:96),gy+34,`500 ${M?11:12.5}px ${MONO}`,'#E8E6DF','left',ga)}
  }
};
CH[5]={still:5,cam:M=>M?{lon:134,lat:-27,lz:Math.log(78)}:{lon:128,lat:-27,lz:Math.log(86)},needCost:true,
  fx(lo,la,s,o){o.c=o.cost;o.a=o.cost===C.none?.5:1},
  draw(t){const ctx=ctxT,M=MOB();proj(tour,144.96,-37.81);const al=RM?1:sstep(.6,1.4,t);ctx.save();ctx.globalAlpha=al;ctx.fillStyle='#D66E55';ctx.beginPath();ctx.arc(PX,PY,5,0,TAU);ctx.fill();ctx.restore();txt(ctx,'Melbourne',PX-10,PY+4,`500 ${M?11:12.5}px ${MONO}`,'#E8E6DF','right',al);proj(tour,134,-25);txt(ctx,'Australia',PX,PY,`400 ${M?12:14}px ${SERIF}`,'#A6B4BC','center',al)}
};
CH[6]={still:9,cam:M=>M?{lon:15.4,lat:44.8,lz:Math.log(24)}:{lon:15.4,lat:44.8,lz:Math.log(34)},fx(lo,la,s,o){o.a=.32},draw(){}};
CH[7]={still:16,cam:M=>homeCam(M),fx(lo,la,s,o){o.a=.4},
  enter(){TN.nodes=null;initNodes();TN.laid=false},
  draw(t,dt){drawTree(t,dt)}};
CH[8]={still:11,cam:M=>M?{lon:80,lat:2,lz:Math.log(210)}:{lon:80,lat:4,lz:Math.log(262)},
  enter(){C8.manual=false},
  fx(lo,la,s,o){o.a=.75},
  draw(t,dt){drawCompass(t,dt)}};
CH[9]={still:6,cam:M=>homeCam(M),fx(lo,la,s,o){o.a=.4},draw(){}};
CH[10]={still:6,cam:M=>homeCam(M),fx(lo,la,s,o){o.a=.4},draw(){}};
CH[11]={still:9,cam:M=>homeCam(M),needCost:true,sweep:0,
  fx(lo,la,s,o){
    const cl=Math.cos(la*RAD),d=Math.hypot((lo-15)*cl,la-45),R=CH[11].sweep;
    if(d>R){o.c=C.onsite;o.a=1;return}
    if(s<.033){o.c=C.acc;o.a=1;o.b=.8}else if(s<.146){o.c=o.cost===C.none?C.free:o.cost;o.a=1}else{o.c=C.none;o.a=.5}
    if(R-d<6)o.b=Math.max(o.b,.5);
  },
  draw(t){CH[11].sweep=RM?500:Math.max(0,(t-.8)*75)}
};
CH[12]={still:3,cam:M=>homeCam(M),needCost:true,fx(lo,la,s,o){o.c=o.cost;o.a=o.cost===C.none?.55:1},
  draw(t){if(!RM&&S.clock-(CH[12].last||0)>1.4){CH[12].last=S.clock;S.ripples.push({x:tour.W*(.2+Math.random()*.7),y:tour.H*(.25+Math.random()*.5),t0:S.clock,sp:330,k:.9})}}};

/* ============ engine ============ */
function placeCam(jump){
  const ch=CH[S.i],M=MOB();readStage();
  const c=(ch.camAt?ch.camAt(S.t,M):ch.cam(M));
  const st=stage;tour.fx=clamp((st.x+st.w/2)/(tour.W||1),.3,.8);tour.fy=clamp((st.y+st.h/2)/(tour.H||1),.28,.7);
  if(S.i===2){tour.fy=M?.5:.56;tour.fx=M?.5:.58}
  if(S.i===8){tour.fx=.5;tour.fy=M?.38:.44}
  setCam(tour,c,jump||RM);
}
let tlCache=new WeakMap();
function tickDom(t,force){
  const sec=chEls[S.i];if(!sec)return;
  const caps=$$('.cap',sec);let lastCap=-1;caps.forEach((c,i)=>{if(t>=+c.dataset.at)lastCap=i});
  caps.forEach((c,i)=>{const on=RM?true:i===lastCap;if(c.classList.contains('in')!==on)c.classList.toggle('in',on)});
  $$('[data-at]',sec).forEach(el=>{
    if(el.classList.contains('cap'))return;
    const at=+el.dataset.at,un=el.dataset.until!=null?+el.dataset.until:Infinity,on=t>=at&&t<un,cls=el.dataset.cls||'in';
    if(el.classList.contains(cls)!==on)el.classList.toggle(cls,on);
  });
  // counters
  $$('.cnt',sec).forEach(el=>{const to=+el.dataset.to,par=el.closest('[data-at]'),at=par?+par.dataset.at:0,p=RM?1:easeOut((t-at-.2)/1.8),val=Math.round(to*p),key=el.dataset.fmt||'n';
    let s;if(key==='m')s=(to*p/1e6).toFixed(2)+'M';else if(key==='pct')s=(to*p/10).toFixed(1)+'%';else s=val.toLocaleString('en-GB');if(el.textContent!==s)el.textContent=s});
  if(S.i===11){const f=[['#tr-af1','Example Town Archive',5.8],['#tr-af2','example.org/registers',7.0],['#tr-af3','Images, free, no account',8.2]];f.forEach(a=>{const n=RM?99:Math.max(0,Math.floor((t-a[2])*24)),s=a[1].slice(0,n);const el=$(a[0]);if(el.textContent!==s)el.textContent=s})}
  if(S.i===0){const ink=$('#tr-ink');const on=t>=2.6;if(ink.classList.contains('in')!==on)ink.classList.toggle('in',on)}
}
function step(dt){
  const ch=CH[S.i];if(!ch)return;
  if(!RM){S.clock+=dt;S.t+=dt}
  if(S.i===4)placeCam(false);
  S.ptr.sx+=(S.ptr.x-S.ptr.sx)*(1-Math.exp(-dt*3));S.ptr.sy+=(S.ptr.y-S.ptr.sy)*(1-Math.exp(-dt*3));
  stepCam(tour,dt,RM);
  S.ripples=S.ripples.filter(r=>S.clock-r.t0<2.7);
  drawDots(tour,{clock:S.clock,dt,fx:ch.fx,needCost:ch.needCost,ripples:RM?[]:S.ripples,par:!RM,px:S.ptr.sx,py:S.ptr.sy,tw:!RM,jump:RM});
  ctxT.setTransform(tour.dpr,0,0,tour.dpr,0,0);
  if(ch.draw)ch.draw(S.t,dt);
  tickDom(S.t);
}
let raf=0,last=0;
function loop(ts){raf=0;if(!S.open||document.hidden)return;const dt=Math.min(.05,(ts-last)/1000||.016);last=ts;step(dt);if(!RM)raf=requestAnimationFrame(loop)}
function kick(){if(S.open&&!document.hidden&&!raf){last=performance.now();raf=requestAnimationFrame(loop)}}
function redraw(){if(S.open)step(0.0001)}
document.addEventListener('visibilitychange',kick);
function resizeAll(){if(S.open){sizeView(tour);readStage();placeCam(true);TN.laid=false;if(S.i===2){pForm=-1}redraw()}}
let rz=0;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(resizeAll,120)});
/* ---------- chapter navigation ---------- */
const rail=$('#tr-rail');
chEls.forEach((el,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Chapter ${i+1} of ${chEls.length}: ${el.dataset.title}`);b.addEventListener('click',()=>go(i));rail.appendChild(b)});
const live=$('#tr-live');
function go(i,opts){
  i=clamp(i,0,chEls.length-1);opts=opts||{};
  chEls.forEach((el,j)=>{el.hidden=j!==i;if(j!==i)$$('[data-at]',el).forEach(e=>e.classList.remove(e.dataset.cls||'in'))});
  if(i===1)P1.key=opts.place||'fiume';
  S.i=i;S.t=RM?CH[i].still:(opts.t||0);S.ripples=[];$('#tr-ink').classList.remove('in');
  const el=chEls[i];
  $$('#tr-rail button').forEach((b,j)=>{b.classList.toggle('cur',j===i);b.classList.toggle('done',j<i);b.toggleAttribute('aria-current',j===i)});
  $('#tr-where').textContent=`${i+1} / ${chEls.length}  ${el.dataset.title}`;
  $('#tr-prev').disabled=i===0;$('#tr-next').disabled=i===chEls.length-1;
  live.textContent=`Chapter ${i+1} of ${chEls.length}. ${el.dataset.title}. ${el.dataset.sr||''}`;
  readStage();
  if(CH[i].enter)CH[i].enter();
  placeCam(true);
  if(i===1&&opts.place){P1.key=opts.place;setupYear1();placeCam(true)}
  if(i===2){pForm=-1;initParticles()}
  if(opts.t&&i===2){pForm=-1}
  redraw();kick();
}
function next(){go(S.i+1)}function prev(){go(S.i-1)}

/* ---------- open / close ---------- */
let opener=null,onClose=null,inerted=[],prevOverflow='';
const rootNode=host.getRootNode(),shadowHost=rootNode.host||null;
/* The page behind is made inert (not hidden): focus and screen-reader reading stay inside the dialog, and everything is restored on close. */
function setPageInert(on){
  if(on){inerted=[];Array.from(document.body.children).forEach(el=>{if(el===shadowHost||el===host||/^(SCRIPT|STYLE|LINK)$/.test(el.tagName))return;if(!el.inert){el.inert=true;inerted.push(el)}})}
  else{inerted.forEach(el=>{el.inert=false});inerted=[]}
}
function openTour(i,from,cb){
  if(S.open)return;opener=from||document.activeElement;onClose=cb||null;
  S.open=true;host.hidden=false;setPageInert(true);prevOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
  host.classList.toggle('rm',RM);
  void host.offsetWidth;host.classList.add('open');
  addEventListener('keydown',onKey);
  sizeView(tour);readStage();
  setTimeout(()=>{host.focus({preventScroll:true})},30);
  go(i||0);kick();
}
function closeTour(){
  if(!S.open)return;S.open=false;host.classList.remove('open');setPageInert(false);document.documentElement.style.overflow=prevOverflow;
  removeEventListener('keydown',onKey);
  if(raf){cancelAnimationFrame(raf);raf=0}
  setTimeout(()=>{if(!S.open)host.hidden=true},600);
  try{const m=document.getElementById('main');if(opener&&opener.isConnected&&opener.focus)opener.focus();else if(m)m.focus({preventScroll:true})}catch(e){}
  if(onClose){const f=onClose;onClose=null;try{f()}catch(e){}}
}
host.setAttribute('tabindex','-1');
$('#tr-skip').addEventListener('click',closeTour);
$('#tr-prev').addEventListener('click',prev);$('#tr-next').addEventListener('click',next);
$('#tr-end-close').addEventListener('click',closeTour);$('#tr-end-again').addEventListener('click',()=>go(0));
function onKey(e){
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tg=(e.composedPath&&e.composedPath()[0])||e.target,typing=tg&&(tg.tagName==='INPUT'&&tg.type!=='range'||tg.tagName==='TEXTAREA');
  const act=rootNode.activeElement;
  if(e.key==='Escape'){e.preventDefault();closeTour();return}
  if(e.key==='Tab'){const f=$$('a[href],button:not([disabled]),input,[tabindex="0"]').filter(n=>n.offsetParent!==null&&getComputedStyle(n).visibility!=='hidden');if(!f.length)return;const a=f[0],b=f[f.length-1];if(e.shiftKey&&(act===a||act===host||!act)){e.preventDefault();b.focus()}else if(!e.shiftKey&&act===b){e.preventDefault();a.focus()}return}
  if(typing||(tg&&tg.type==='range'))return;
  if(tg&&(tg.tagName==='BUTTON'||tg.tagName==='A')&&(e.key===' '||e.key==='Enter'))return;
  if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();next()}
  else if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();prev()}
  else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(chEls.length-1)}
}
// swipe and pointer
let sw=null;
root.addEventListener('pointerdown',e=>{sw={x:e.clientX,y:e.clientY,t:performance.now()};if(!e.target.closest('button,a,input,.ctl')&&!RM)S.ripples.push({x:e.clientX,y:e.clientY,t0:S.clock,sp:420,k:1.2})});
root.addEventListener('pointerup',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.6&&performance.now()-sw.t<700&&!e.target.closest('input,.vchips')){dx<0?next():prev()}sw=null});
let lastRip=0;
root.addEventListener('pointermove',e=>{const w=innerWidth,h=innerHeight;S.ptr.x=(e.clientX/w-.5)*2;S.ptr.y=(e.clientY/h-.5)*2;if(!RM&&e.pointerType==='mouse'&&S.clock-lastRip>.35){lastRip=S.clock;S.ripples.push({x:e.clientX,y:e.clientY,t0:S.clock,sp:340,k:.55,w:60})}});

/* ---------- the hero search ---------- */
const fold=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z ]/g,'').trim();
const MATCH=D.match.map(m=>[new RegExp(m[0]),m[1]]);
const q=$('#tr-q'),hint=$('#tr-hint');let qTimer=0;
function evalQ(go_){
  const v=q.value.trim();if(!v){hint.textContent='';return false}
  const f=fold(v);for(const m of MATCH)if(m[0].test(f)){
    hint.textContent='Found in the story. Taking you there.';clearTimeout(qTimer);qTimer=setTimeout(()=>{go(m[1].ch,{place:m[1].place,t:m[1].t});if(m[1].t&&RM===false){S.t=m[1].t}},go_?60:650);return true}
  hint.innerHTML=`Not one of the story's examples. <a href="${D.base}/?q=${encodeURIComponent(v)}">Search the Atlas for &ldquo;${v.replace(/[<>&"]/g,'')}&rdquo;</a>`;return false;
}
q.addEventListener('input',()=>{clearTimeout(qTimer);qTimer=setTimeout(()=>evalQ(false),450)});
$('#tr-askform').addEventListener('submit',e=>{e.preventDefault();clearTimeout(qTimer);evalQ(true)});
$$('[data-try]').forEach(b=>b.addEventListener('click',()=>{q.value=b.dataset.try;evalQ(true)}));

/* ---------- ledger scribbles ---------- */
(function(){
  const g=$('#tr-ledlines');if(!g)return;const rnd=rngMaker(99);let h='';
  for(let i=0;i<9;i++){const y=40+i*33;h+=`<line x1="14" y1="${y}" x2="408" y2="${y}" stroke="#2E241833" stroke-width="1"/>`;
    if(i===2||i===4)continue;const len=120+rnd()*230;let d=`M30 ${y-5}`;for(let x=30;x<30+len;x+=5+rnd()*4){d+=` L${x.toFixed(1)} ${(y-4-rnd()*12).toFixed(1)}`}h+=`<path d="${d}" fill="none" stroke="#2E2418" stroke-opacity=".5" stroke-width="1.3" stroke-linejoin="round"/>`}
  h+=`<line x1="22" y1="8" x2="22" y2="322" stroke="#8A3A2A55" stroke-width="1.2"/><line x1="14" y1="40" x2="14" y2="322" stroke="none"/>`;g.innerHTML=h;
})();

/* ---------- reduced motion toggles live ---------- */
function applyRM(){host.classList.toggle('rm',RM);if(S.open){go(S.i);}}
if(RMQ.addEventListener)RMQ.addEventListener('change',e=>{RM=e.matches;applyRM()});
host.classList.toggle('rm',RM);

/* ---------- boot ---------- */
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(S.open){TN.laid=false;pForm=-1;redraw()}});
return {open:openTour,close:closeTour,go,S,CH,get RM(){return RM},set RM(v){RM=v;applyRM()},tick(s){for(let x=0;x<s;x+=1/30)step(1/30)}};
};
})();
