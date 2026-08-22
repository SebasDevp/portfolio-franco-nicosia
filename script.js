const gsap = window.gsap || null;
const THREE = window.THREE || null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const deviceMemory = Number(navigator.deviceMemory || 8);
const cpuCores = Number(navigator.hardwareConcurrency || 8);
const saveDataMode = Boolean(navigator.connection?.saveData);
const lowPowerMode = saveDataMode || deviceMemory <= 4 || cpuCores <= 4;
const mobileMedia = window.matchMedia('(max-width:900px)');
const coarsePointerMedia = window.matchMedia('(pointer: coarse)');
const mobileMode = mobileMedia.matches || (coarsePointerMedia.matches && window.innerWidth < 1100);
if(mobileMode) document.body.classList.add('mobile-experience');
if(lowPowerMode) document.body.classList.add('low-power-experience');
const getRenderDPR = () => {
  const dpr=window.devicePixelRatio||1;
  if(mobileMode) return Math.min(dpr, lowPowerMode ? .86 : .96);
  // En pantallas grandes el canvas ocupa toda la ventana. Un DPR alto multiplica
  // brutalmente los píxeles a renderizar sin aportar una diferencia visible real.
  const pixelLoad=window.innerWidth*window.innerHeight*Math.min(dpr,2)**2;
  const cap=lowPowerMode ? 1.0 : (pixelLoad>7000000 ? .95 : pixelLoad>4500000 ? 1.02 : window.innerWidth>1600 ? 1.08 : 1.14);
  return Math.min(dpr,cap);
};
const highPixelCost = () => (window.innerWidth*window.innerHeight*(window.devicePixelRatio||1)**2)>6500000;
const landingTargetFps = () => lowPowerMode ? 30 : (mobileMode ? 40 : (highPixelCost()?42:50));

/* La experiencia móvil tiene un orden propio. Si se cruza el breakpoint,
   recargamos una sola vez para no mezclar estados de navegación. */
mobileMedia.addEventListener?.('change',()=>window.location.reload());
coarsePointerMedia.addEventListener?.('change',()=>window.location.reload());
const runWhenIdle = (callback, timeout=900) => {
  if('requestIdleCallback' in window){
    return window.requestIdleCallback(callback,{timeout});
  }
  return window.setTimeout(callback,Math.min(timeout,420));
};

/* V31 — viewport/performance guardrails */
function syncViewportMetrics(){
  const viewport=window.visualViewport;
  const h=viewport?.height||window.innerHeight;
  document.documentElement.style.setProperty('--app-height',`${Math.round(h)}px`);
}
syncViewportMetrics();
window.visualViewport?.addEventListener('resize',syncViewportMetrics,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(syncViewportMetrics,120),{passive:true});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('page-is-hidden',document.hidden));

if(gsap){
  gsap.config({force3D:true});
  gsap.ticker.lagSmoothing(500,33);
}

const scenes = [...document.querySelectorAll('.scene')];
const routes = [...document.querySelectorAll('.route')];
const jumpButtons = document.querySelectorAll('[data-jump]');
const nextTriggers = document.querySelectorAll('.next-trigger');
const currentPageElement = document.getElementById('currentPage');
const directionArrow = document.getElementById('directionArrow');
const transitionOverlay = document.getElementById('transitionOverlay');
const transitionBeam = document.getElementById('transitionBeam');
const transitionFlare = document.getElementById('transitionFlare');
const transitionIndex = document.getElementById('transitionIndex');

const mobileSceneOrder = [0,1,2,3];
const desktopSceneOrder = [0,1,2,3];
const activeSceneOrder = mobileMode ? mobileSceneOrder : desktopSceneOrder;
const displayIndexForScene = sceneIndex => activeSceneOrder.indexOf(sceneIndex) + 1;

let currentScene = 0;
let isTransitioning = false;
let wheelAccumulator = 0;
let wheelResetTimer = null;
let ignoreWheelUntil = 0;
let reelVideoViewerOpen = false;

const forwardRoute = mobileMode ? {
  0:{target:1,direction:'down'},
  1:{target:2,direction:'down'},
  2:{target:3,direction:'down'},
  3:{target:0,direction:'up'}
} : {
  0:{target:1,direction:'right'},
  1:{target:2,direction:'right'},
  2:{target:3,direction:'down'},
  3:{target:0,direction:'left'}
};
const backwardRoute = mobileMode ? {
  0:{target:3,direction:'down'},
  3:{target:2,direction:'up'},
  2:{target:1,direction:'up'},
  1:{target:0,direction:'up'}
} : {
  0:{target:3,direction:'right'},
  3:{target:2,direction:'up'},
  2:{target:1,direction:'left'},
  1:{target:0,direction:'left'}
};
const vectors = {right:{x:1,y:0},left:{x:-1,y:0},down:{x:0,y:1},up:{x:0,y:-1}};

scenes.forEach((scene,index)=>{
  if(gsap){
    gsap.set(scene,{autoAlpha:index===currentScene?1:0,visibility:index===currentScene?'visible':'hidden',pointerEvents:index===currentScene?'auto':'none',xPercent:0,yPercent:0,scale:1,filter:'none',zIndex:index===currentScene?3:1});
  }else{
    scene.style.visibility=index===currentScene?'visible':'hidden';
    scene.style.opacity=index===currentScene?'1':'0';
  }
});

function configureMobileExperience(){
  if(!mobileMode)return;
  document.body.classList.add('mobile-experience');
  const mobileLabels={
    0:['01','Inicio'],
    1:['02','Franco'],
    2:['03','Trabajo'],
    3:['04','Reels']
  };
  routes.forEach(route=>{
    const sceneIndex=Number(route.dataset.jump);
    const data=mobileLabels[sceneIndex];
    if(!data)return;
    route.querySelector('span').textContent=data[0];
    route.querySelector('small').textContent=data[1];
  });
  const helper=landingSceneEl?.querySelector?.('.landing-name-helper span');
  if(helper)helper.textContent='DESLIZÁ EL DEDO · NOMBRE + OBJETO REACCIONAN';
}

function revealSceneContent(scene){
  const elements=scene.querySelectorAll('.reveal-item');
  if(!elements.length)return;
  if(!gsap){elements.forEach(el=>el.style.opacity='1');return;}
  gsap.killTweensOf(elements);
  gsap.fromTo(elements,{y:35,autoAlpha:0},{y:0,autoAlpha:1,duration:.9,stagger:.075,delay:.18,ease:'power4.out'});
}

let landingThreeActive=true;
function updateInterface(){
  currentPageElement.textContent=String(displayIndexForScene(currentScene)).padStart(2,'0');
  routes.forEach(route=>route.classList.remove('active'));
  document.querySelector(`.route[data-jump="${currentScene}"]`)?.classList.add('active');
  directionArrow.textContent={right:'→',left:'←',down:'↓',up:'↑'}[forwardRoute[currentScene].direction];
  const light=currentScene===0;
  document.body.classList.toggle('light-interface',light);
  document.body.dataset.scene=String(currentScene);
  landingThreeActive=light;
}

function playTransitionEffect(direction,from,target){
  if(!gsap)return;
  const vector=vectors[direction];
  transitionIndex.textContent=`${String(displayIndexForScene(from)).padStart(2,'0')} → ${String(displayIndexForScene(target)).padStart(2,'0')}`;
  gsap.killTweensOf([transitionOverlay,transitionBeam,transitionFlare,transitionIndex]);
  gsap.set(transitionOverlay,{visibility:'visible',autoAlpha:1});
  gsap.set(transitionFlare,{scale:.3,autoAlpha:0});
  if(vector.x!==0){
    gsap.set(transitionBeam,{top:'-20%',left:'50%',width:'20vw',height:'140%',xPercent:vector.x*650,yPercent:0,rotation:vector.x>0?7:-7});
    gsap.to(transitionBeam,{xPercent:vector.x*-650,duration:mobileMode?1.28:1.08,ease:'power4.inOut'});
  }else{
    gsap.set(transitionBeam,{left:'-20%',top:'50%',width:'140%',minWidth:0,height:'20vh',xPercent:0,yPercent:vector.y*650,rotation:0});
    gsap.to(transitionBeam,{yPercent:vector.y*-650,duration:mobileMode?1.28:1.08,ease:'power4.inOut'});
  }
  gsap.to(transitionFlare,{autoAlpha:.8,scale:1.6,duration:mobileMode?.34:.27,delay:mobileMode?.42:.35,yoyo:true,repeat:1,ease:'power2.out'});
  gsap.fromTo(transitionIndex,{scale:.8,autoAlpha:0},{scale:1,autoAlpha:.7,duration:mobileMode?.34:.27,delay:mobileMode?.14:.1,yoyo:true,repeat:1,repeatDelay:mobileMode?.28:.2,ease:'power3.out'});
  gsap.to(transitionOverlay,{autoAlpha:0,delay:mobileMode?1.03:.85,duration:mobileMode?.42:.35,onComplete:()=>gsap.set(transitionOverlay,{visibility:'hidden'})});
}

function transitionTo(target,direction){
  if(isTransitioning||target===currentScene)return;
  const oldIndex=currentScene,oldScene=scenes[oldIndex],newScene=scenes[target],vector=vectors[direction];
  if(mobileMode && 'scrollTop' in newScene)newScene.scrollTop=0;
  if(!gsap){
    oldScene.style.visibility='hidden';oldScene.style.opacity='0';oldScene.style.pointerEvents='none';
    newScene.style.visibility='visible';newScene.style.opacity='1';newScene.style.pointerEvents='auto';
    currentScene=target;updateInterface();revealSceneContent(newScene);return;
  }
  isTransitioning=true;playTransitionEffect(direction,oldIndex,target);
  const oldInner=oldScene.querySelector('.scene-inner'),newInner=newScene.querySelector('.scene-inner');
  gsap.killTweensOf([oldScene,newScene,oldInner,newInner]);
  gsap.set(newScene,{visibility:'visible',autoAlpha:1,pointerEvents:'none',zIndex:4,xPercent:vector.x*103,yPercent:vector.y*103,scale:1.025,filter:'none',force3D:true});
  if(newInner)gsap.set(newInner,{x:vector.x*75,y:vector.y*75,scale:1.015});
  gsap.set(oldScene,{zIndex:3});
  const tl=gsap.timeline({onComplete(){
    gsap.set(oldScene,{visibility:'hidden',autoAlpha:0,pointerEvents:'none',xPercent:0,yPercent:0,scale:1,filter:'none',zIndex:1});
    if(oldInner)gsap.set(oldInner,{x:0,y:0,scale:1});
    gsap.set(newScene,{pointerEvents:'auto',zIndex:3});
    isTransitioning=false;ignoreWheelUntil=performance.now()+(mobileMode?1050:300);
  }});
  tl.to(oldScene,{xPercent:vector.x*(mobileMode?-14:-20),yPercent:vector.y*(mobileMode?-14:-20),scale:mobileMode?.975:.96,autoAlpha:.12,filter:'none',force3D:true,duration:mobileMode?1.38:.96,ease:'power4.inOut'},0);
  if(oldInner)tl.to(oldInner,{x:vector.x*(mobileMode?-24:-42),y:vector.y*(mobileMode?-24:-42),scale:mobileMode?.994:.985,force3D:true,duration:mobileMode?1.38:.96,ease:'power4.inOut'},0);
  tl.to(newScene,{xPercent:0,yPercent:0,scale:1,filter:'none',force3D:true,duration:mobileMode?1.46:1.02,ease:'power4.inOut'},0);
  if(newInner)tl.to(newInner,{x:0,y:0,scale:1,force3D:true,duration:mobileMode?1.50:1.06,ease:'power4.out'},.03);
  currentScene=target;updateInterface();
  setTimeout(()=>{revealSceneContent(newScene);},mobileMode?640:390);
}

function goForward(){const route=forwardRoute[currentScene];transitionTo(route.target,route.direction)}
function goBackward(){const route=backwardRoute[currentScene];transitionTo(route.target,route.direction)}

window.addEventListener('wheel',event=>{
  event.preventDefault();
  if(reelVideoViewerOpen){wheelAccumulator=0;return;}
  if(isTransitioning||performance.now()<ignoreWheelUntil){wheelAccumulator=0;return;}
  wheelAccumulator+=event.deltaY;
  clearTimeout(wheelResetTimer);wheelResetTimer=setTimeout(()=>wheelAccumulator=0,mobileMode?280:170);
  const wheelThreshold=mobileMode?230:70;
  if(wheelAccumulator>wheelThreshold){wheelAccumulator=0;goForward()}else if(wheelAccumulator<-wheelThreshold){wheelAccumulator=0;goBackward()}
},{passive:false});
nextTriggers.forEach(button=>button.addEventListener('click',goForward));
jumpButtons.forEach(button=>button.addEventListener('click',()=>{
  const target=Number(button.dataset.jump);if(target===currentScene)return;
  const next=forwardRoute[currentScene],previous=backwardRoute[currentScene];
  if(next.target===target)return transitionTo(target,next.direction);
  if(previous.target===target)return transitionTo(target,previous.direction);
  transitionTo(target,target>currentScene?'right':'left');
}));
window.addEventListener('keydown',event=>{
  // El reproductor expandido de la página 04 toma control del teclado.
  if(reelVideoViewerOpen) return;
  // Cuando el escáner de la página 03 está abierto, las flechas pertenecen
  // al visor holográfico y no a la navegación entre páginas.
  if(typeof workContentHologramOpen !== 'undefined' && workContentHologramOpen) return;
  if(['ArrowRight','ArrowDown','PageDown'].includes(event.key)){event.preventDefault();goForward()}
  if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();goBackward()}
});

let touchStartX=0,touchStartY=0,touchStartTime=0,touchStartedOnSphere=false,touchStartScrollTop=0,touchStartedAtTop=false,touchStartedAtBottom=false,lastMobileNavigationAt=0;
let mobileEdgeIntentDirection=0,mobileEdgeIntentAt=0,mobileEdgeIntentTimer=null;
function resetMobileEdgeIntent(){
  mobileEdgeIntentDirection=0;mobileEdgeIntentAt=0;
  document.body.classList.remove('mobile-edge-armed');
  delete document.body.dataset.edgeDirection;
  clearTimeout(mobileEdgeIntentTimer);
}
function armMobileEdgeIntent(direction){
  mobileEdgeIntentDirection=direction;mobileEdgeIntentAt=performance.now();
  document.body.classList.add('mobile-edge-armed');
  document.body.dataset.edgeDirection=direction>0?'next':'prev';
  clearTimeout(mobileEdgeIntentTimer);
  mobileEdgeIntentTimer=setTimeout(resetMobileEdgeIntent,2400);
}
window.addEventListener('touchstart',event=>{
  const t=event.touches[0];
  touchStartX=t.clientX;touchStartY=t.clientY;touchStartTime=performance.now();
  touchStartedOnSphere=Boolean(event.target.closest('#photoSphere'));
  const scene=scenes[currentScene];
  touchStartScrollTop=scene?.scrollTop||0;
  touchStartedAtTop=touchStartScrollTop<=6;
  touchStartedAtBottom=Boolean(scene)&&scene.scrollHeight-scene.clientHeight-touchStartScrollTop<=8;
},{passive:true});
window.addEventListener('touchend',event=>{
  if(reelVideoViewerOpen||touchStartedOnSphere||isTransitioning)return;
  const t=event.changedTouches[0],dx=t.clientX-touchStartX,dy=t.clientY-touchStartY;
  const duration=performance.now()-touchStartTime;

  if(!mobileMode){
    if(Math.max(Math.abs(dx),Math.abs(dy))<65)return;
    if(Math.abs(dy)>Math.abs(dx)){dy<0?goForward():goBackward()}else{dx<0?goForward():goBackward()}
    return;
  }

  // Un swipe accidental nunca cambia de sección. Debe ser vertical, largo y deliberado.
  if(duration<210||Math.abs(dy)<145||Math.abs(dy)<Math.abs(dx)*1.22)return;
  const scene=scenes[currentScene];
  const scrollable=scene&&scene.scrollHeight>scene.clientHeight+14;
  const direction=dy<0?1:-1;

  // En escenas largas el primer gesto siempre pertenece al scroll. Al llegar al borde,
  // el primer overscroll arma la navegación y un segundo gesto confirma el cambio.
  if(scrollable){
    const atRelevantEdge=direction>0?touchStartedAtBottom:touchStartedAtTop;
    if(!atRelevantEdge){resetMobileEdgeIntent();return;}
    const now=performance.now();
    const confirmed=mobileEdgeIntentDirection===direction && now-mobileEdgeIntentAt>320 && now-mobileEdgeIntentAt<2400;
    if(!confirmed){armMobileEdgeIntent(direction);return;}
    resetMobileEdgeIntent();
  }else{
    // Heroes de una pantalla: gesto más largo y no repetible rápidamente.
    if(Math.abs(dy)<185||duration<250)return;
  }

  if(performance.now()-lastMobileNavigationAt<1450)return;
  lastMobileNavigationAt=performance.now();
  direction>0?goForward():goBackward();
},{passive:true});

/* Cursor */
const cursorDot=document.getElementById('cursorDot'),cursorRing=document.getElementById('cursorRing'),mouseGlow=document.getElementById('mouseGlow');
let mouseX=innerWidth/2,mouseY=innerHeight/2,ringX=mouseX,ringY=mouseY,glowX=mouseX,glowY=mouseY;
window.addEventListener('pointermove',event=>{
  mouseX=event.clientX;mouseY=event.clientY;
  cursorDot.style.transform=`translate3d(${mouseX}px,${mouseY}px,0) translate(-50%,-50%)`;
},{passive:true});

/* Un solo RAF para cursor + glow. Evita dos loops globales permanentes. */
(function pointerUiLoop(){
  if(mobileMode)return;
  if(!document.hidden){
    ringX+=(mouseX-ringX)*.13;ringY+=(mouseY-ringY)*.13;
    glowX+=(mouseX-glowX)*.045;glowY+=(mouseY-glowY)*.045;
    cursorRing.style.transform=`translate3d(${ringX}px,${ringY}px,0) translate(-50%,-50%)`;
    mouseGlow.style.transform=`translate3d(${glowX}px,${glowY}px,0) translate(-50%,-50%)`;
  }
  requestAnimationFrame(pointerUiLoop);
})();
document.querySelectorAll('button,a,.tilt,.photo-sphere').forEach(el=>{el.addEventListener('mouseenter',()=>cursorRing.classList.add('hovering'));el.addEventListener('mouseleave',()=>cursorRing.classList.remove('hovering'))});

/* Parallax / tilt / magnetic — setters cacheados para no crear tweens en cada pixel del mouse. */
const parallaxElements=[...document.querySelectorAll('.parallax')];
const parallaxSetters=gsap ? parallaxElements.map((el,index)=>({
  x:gsap.quickTo(el,'x',{duration:.62,ease:'power3.out'}),
  y:gsap.quickTo(el,'y',{duration:.62,ease:'power3.out'}),
  amount:12+index*8
})) : [];
window.addEventListener('pointermove',event=>{
  if(!gsap||innerWidth<=760||document.hidden||currentScene!==1)return;
  const nx=event.clientX/innerWidth-.5,ny=event.clientY/innerHeight-.5;
  parallaxSetters.forEach(item=>{item.x(nx*item.amount);item.y(ny*item.amount)});
},{passive:true});
document.querySelectorAll('.tilt').forEach(card=>{
  card.addEventListener('pointermove',event=>{if(!gsap||innerWidth<=760)return;const r=card.getBoundingClientRect(),nx=(event.clientX-r.left)/r.width-.5,ny=(event.clientY-r.top)/r.height-.5;gsap.to(card,{rotateY:nx*5,rotateX:ny*-5,scale:1.012,transformPerspective:1200,duration:.45,ease:'power3.out',overwrite:true})});
  card.addEventListener('pointerleave',()=>gsap&&gsap.to(card,{rotateX:0,rotateY:0,scale:1,duration:.7,ease:'power3.out'}));
});
document.querySelectorAll('.magnetic').forEach(el=>{
  el.addEventListener('pointermove',event=>{if(!gsap||innerWidth<=760)return;const r=el.getBoundingClientRect(),dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2;gsap.to(el,{x:dx*.11,y:dy*.11,duration:.35,ease:'power3.out'})});
  el.addEventListener('pointerleave',()=>gsap&&gsap.to(el,{x:0,y:0,duration:.58,ease:'elastic.out(1,.45)'}));
});

/* Landing name interactive fill */
const landingSceneEl=document.querySelector('.scene-landing');
const landingNameWrap=document.getElementById('landingNameWrap');
const landingScanline=document.getElementById('landingScanline');
let nameTargetFill=92,nameCurrentFill=92,nameTargetX=0,nameTargetY=0,nameCurrentX=0,nameCurrentY=0,nameTiltX=0,nameTiltY=0;
landingSceneEl.addEventListener('pointermove',event=>{
  if(currentScene!==0)return;
  const nx=event.clientX/innerWidth-.5;
  const ny=event.clientY/innerHeight;
  nameTargetFill=Math.max(2,Math.min(98,ny*108-4));
  nameTargetX=nx*8;
  nameTargetY=(ny-.5)*7;
  nameTiltX=(.5-ny)*1.4;
  nameTiltY=nx*1.8;
  landingSceneEl.classList.add('name-active');
  document.documentElement.style.setProperty('--line-x',`${Math.max(0,Math.min(100,event.clientX/innerWidth*100))}%`);
  if(gsap){gsap.to(landingScanline,{autoAlpha:.46,duration:.28,ease:'power2.out',overwrite:true})}
});
landingSceneEl.addEventListener('pointerleave',()=>{
  nameTargetFill=92;nameTargetX=0;nameTargetY=0;nameTiltX=0;nameTiltY=0;landingSceneEl.classList.remove('name-active');
  document.documentElement.style.setProperty('--line-x','50%');
  if(gsap)gsap.to(landingScanline,{autoAlpha:.30,duration:.5});
});
let nameLastFrameAt=0;
(function nameInteractionLoop(frameNow=0){
  const nameTargetFps=landingTargetFps();
  const nameCanDraw=!frameNow||frameNow-nameLastFrameAt>=1000/nameTargetFps;
  if(!document.hidden && currentScene===0 && nameCanDraw){
    nameLastFrameAt=frameNow||performance.now();
    nameCurrentFill+=(nameTargetFill-nameCurrentFill)*.075;
    nameCurrentX+=(nameTargetX-nameCurrentX)*.07;
    nameCurrentY+=(nameTargetY-nameCurrentY)*.07;
    document.documentElement.style.setProperty('--name-fill',`${nameCurrentFill}%`);
    document.documentElement.style.setProperty('--name-x',`${nameCurrentX}px`);
    document.documentElement.style.setProperty('--name-y',`${nameCurrentY}px`);
    document.documentElement.style.setProperty('--name-tilt-x',`${nameTiltX}deg`);
    document.documentElement.style.setProperty('--name-tilt-y',`${nameTiltY}deg`);
  }
  requestAnimationFrame(nameInteractionLoop);
})();

/* Landing Three */
const landingThree=document.getElementById('landingThree'),artifactFallback=document.getElementById('artifactFallback');
let landingRenderer=null,landingScene=null,landingCamera=null,landingKnot=null,landingWire=null,landingHaloA=null,landingHaloB=null,landingPoints=null,landingClock=null;
const landingPointer={x:0,y:0,smoothX:0,smoothY:0};
let landingBaseX=-3.50,landingBaseY=.04,landingBaseScale=1.18;
function initLandingThree(){
  if(!THREE){artifactFallback.classList.add('visible');return;}
  try{
    landingRenderer=new THREE.WebGLRenderer({canvas:landingThree,antialias:true,alpha:true,powerPreference:'high-performance'});
    landingRenderer.setPixelRatio(getRenderDPR());landingRenderer.setClearColor(0x000000,0);landingRenderer.outputColorSpace=THREE.SRGBColorSpace;landingRenderer.toneMapping=THREE.ACESFilmicToneMapping;landingRenderer.toneMappingExposure=1.05;
    landingScene=new THREE.Scene();landingCamera=new THREE.PerspectiveCamera(42,1,.1,100);landingCamera.position.z=7.25;
    landingScene.add(new THREE.AmbientLight(0xffffff,2.15));
    const key=new THREE.DirectionalLight(0xffffff,4.2);key.position.set(-4,5,6);landingScene.add(key);
    const green=new THREE.PointLight(0x69ff83,19,13,2);green.position.set(3,-1,4);landingScene.add(green);
    const soft=new THREE.PointLight(0xdfffe4,13,12,2);soft.position.set(-3,2,4);landingScene.add(soft);
    const geometry=new THREE.TorusKnotGeometry(.90,.25,mobileMode?(lowPowerMode?96:128):(lowPowerMode?132:168),mobileMode?(lowPowerMode?18:22):(lowPowerMode?24:30),2,3);
    const material=new THREE.MeshPhysicalMaterial({color:0x9effa8,roughness:.065,metalness:.02,transmission:.48,transparent:true,opacity:.91,thickness:.95,ior:1.4,clearcoat:1,clearcoatRoughness:.04,iridescence:.10,side:THREE.DoubleSide});
    landingKnot=new THREE.Mesh(geometry,material);landingKnot.position.set(landingBaseX,landingBaseY,1);landingScene.add(landingKnot);
    landingWire=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x218a43,wireframe:true,transparent:true,opacity:.052,depthWrite:false}));landingWire.position.copy(landingKnot.position);landingScene.add(landingWire);
    const haloGeometry=new THREE.TorusGeometry(1.34,.006,8,mobileMode?(lowPowerMode?56:72):(lowPowerMode?82:104)),haloMaterial=new THREE.MeshBasicMaterial({color:0x208b42,transparent:true,opacity:.105});
    landingHaloA=new THREE.Mesh(haloGeometry,haloMaterial);landingHaloA.rotation.x=Math.PI*.64;landingHaloA.position.set(landingBaseX,landingBaseY,.35);landingScene.add(landingHaloA);
    landingHaloB=new THREE.Mesh(haloGeometry,haloMaterial.clone());landingHaloB.scale.setScalar(1.18);landingHaloB.rotation.y=Math.PI*.63;landingHaloB.material.opacity=.045;landingHaloB.position.set(landingBaseX,landingBaseY,.18);landingScene.add(landingHaloB);
    const count=mobileMode?(lowPowerMode?28:40):(lowPowerMode?46:64),positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*5;positions[i*3+1]=(Math.random()-.5)*3.2;positions[i*3+2]=.1+Math.random()*1.3}
    const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));landingPoints=new THREE.Points(pGeo,new THREE.PointsMaterial({color:0x208c43,size:.011,transparent:true,opacity:.20}));landingScene.add(landingPoints);
    landingClock=new THREE.Clock();resizeLandingThree();renderLandingThree();
  }catch(error){console.error('Three.js error:',error);artifactFallback.classList.add('visible')}
}
function setLandingArtifactPointer(clientX,clientY){
  landingPointer.x=clientX/innerWidth*2-1;
  landingPointer.y=-(clientY/innerHeight*2-1);
}
window.addEventListener('pointermove',event=>{if(currentScene===0&&!document.hidden)setLandingArtifactPointer(event.clientX,event.clientY)},{passive:true});
landingSceneEl.addEventListener('touchmove',event=>{
  if(currentScene!==0||!event.touches.length)return;
  const t=event.touches[0];
  setLandingArtifactPointer(t.clientX,t.clientY);
  /* El gesto también alimenta la tipografía y la geometría sin bloquear el swipe. */
  const nx=t.clientX/innerWidth-.5,ny=t.clientY/innerHeight;
  nameTargetFill=Math.max(2,Math.min(98,ny*108-4));
  nameTargetX=nx*8;nameTargetY=(ny-.5)*7;nameTiltX=(.5-ny)*1.4;nameTiltY=nx*1.8;
  landingSceneEl.classList.add('name-active');
  document.documentElement.style.setProperty('--line-x',`${Math.max(0,Math.min(100,t.clientX/innerWidth*100))}%`);
},{passive:true});
landingSceneEl.addEventListener('touchend',()=>{
  nameTargetX=0;nameTargetY=0;nameTiltX=0;nameTiltY=0;
  landingPointer.x=0;landingPointer.y=0;
},{passive:true});
function resizeLandingThree(){
  if(!landingRenderer||!landingCamera)return;
  landingRenderer.setPixelRatio(getRenderDPR());landingRenderer.setSize(innerWidth,innerHeight,false);landingCamera.aspect=innerWidth/innerHeight;landingCamera.updateProjectionMatrix();
  // V9: smaller object in the left negative space, with only a slight overlap over the name.
  // V11: with the side card removed, the hero owns the full viewport.
  // The artifact moves closer to the name and overlaps it only slightly.
  // V12: the artifact grows into the left hero area and gently overlaps the first letters.
  // The overlap is intentional: enough to create depth, but never enough to compromise legibility.
  // V13: a very small move toward the typography. The scale stays intact;
  // only the horizontal relationship tightens so the 3D overlap feels more intentional.
  if(innerWidth>1650){landingBaseX=-3.08;landingBaseScale=1.075;}
  else if(innerWidth>1450){landingBaseX=-2.88;landingBaseScale=1.045;}
  else if(innerWidth>1100){landingBaseX=-2.60;landingBaseScale=1.005;}
  else if(innerWidth>760){landingBaseX=-1.29;landingBaseScale=.855;}
  else{landingBaseX=0;landingBaseScale=.74;}
  landingBaseY=mobileMode?1.28:(innerWidth>760?.04:.92);
  const scale=landingBaseScale;
  landingKnot.scale.setScalar(scale);landingWire.scale.setScalar(scale*1.006);landingHaloA.scale.setScalar(scale*.92);landingHaloB.scale.setScalar(scale*1.02);
  landingKnot.position.set(landingBaseX,landingBaseY,1);landingWire.position.copy(landingKnot.position);landingHaloA.position.set(landingBaseX,landingBaseY,.35);landingHaloB.position.set(landingBaseX,landingBaseY,.18);
}
let landingLastFrameAt=0;
function renderLandingThree(frameNow=0){
  if(document.hidden||!landingRenderer||!landingScene||!landingCamera||!landingThreeActive){
    window.setTimeout(()=>requestAnimationFrame(renderLandingThree),160);
    return;
  }
  const targetFps=landingTargetFps();
  const minFrameMs=1000/targetFps;
  if(frameNow&&frameNow-landingLastFrameAt<minFrameMs){requestAnimationFrame(renderLandingThree);return;}
  landingLastFrameAt=frameNow||performance.now();
  const t=landingClock.getElapsedTime();landingPointer.smoothX+=(landingPointer.x-landingPointer.smoothX)*.045;landingPointer.smoothY+=(landingPointer.y-landingPointer.smoothY)*.045;
  landingKnot.rotation.x=t*.24-landingPointer.smoothY*.14;landingKnot.rotation.y=t*.37+landingPointer.smoothX*.21;landingKnot.rotation.z=Math.sin(t*.25)*.10;
  landingKnot.position.x=landingBaseX+landingPointer.smoothX*.045;landingKnot.position.y=landingBaseY+landingPointer.smoothY*.035;landingWire.rotation.copy(landingKnot.rotation);landingWire.position.copy(landingKnot.position);
  landingHaloA.position.x=landingBaseX+landingPointer.smoothX*.026;landingHaloA.position.y=landingBaseY+landingPointer.smoothY*.018;landingHaloA.rotation.z=t*.05;landingHaloA.rotation.y=landingPointer.smoothX*.08;
  landingHaloB.position.x=landingBaseX-landingPointer.smoothX*.018;landingHaloB.position.y=landingBaseY-landingPointer.smoothY*.013;landingHaloB.rotation.z=-t*.035;landingHaloB.rotation.x=landingPointer.smoothY*.07;
  landingPoints.rotation.z=t*.009;landingPoints.position.x=landingBaseX*.30+landingPointer.smoothX*-.035;landingPoints.position.y=landingBaseY*.15;
  landingRenderer.render(landingScene,landingCamera);
  requestAnimationFrame(renderLandingThree);
}

/* Photo sphere — V16 refined reveal + idle teaser + WhatsApp core */
const photoSphere=document.getElementById('photoSphere'),sphereShell=document.getElementById('sphereShell'),spherePointer=document.getElementById('sphereRevealPointer'),sphereWhatsappHint=document.getElementById('sphereWhatsappHint'),microbotCanvas=document.getElementById('microbotCanvas'),microCtx=microbotCanvas.getContext('2d');
const sphereReveal={x:0,y:0,radius:0};
let sphereWidth=0,sphereHeight=0,sphereDPR=1,sphereRevealActive=false,sphereCenterActive=false,sphereIdleRunning=false,lastBotX=0,lastBotY=0,touchCloseTimer=null,idleTeaseTimer=null,idleTeaseCycle=0;
const sphereBots=[];
const botColors=['#e8ffe7','#caffc8','#8cff91','#55e76d','#2ca64f','#176632'];
const whatsappUrl='https://wa.me/5493424281088?text=Hola%20Franco%2C%20vi%20tu%20portfolio%20y%20quer%C3%ADa%20contactarte.';

function resizeSphereCanvas(){
  const rect=photoSphere.getBoundingClientRect();
  sphereWidth=rect.width;sphereHeight=rect.height;sphereDPR=Math.min(devicePixelRatio||1,mobileMode?(lowPowerMode?.90:1):(lowPowerMode?1:1.18));
  microbotCanvas.width=Math.round(sphereWidth*sphereDPR);microbotCanvas.height=Math.round(sphereHeight*sphereDPR);
  microbotCanvas.style.width=`${sphereWidth}px`;microbotCanvas.style.height=`${sphereHeight}px`;
  microCtx.setTransform(sphereDPR,0,0,sphereDPR,0,0);
  if(sphereReveal.x===0){sphereReveal.x=sphereWidth*.56;sphereReveal.y=sphereHeight*.37}
}
resizeSphereCanvas();
if(window.ResizeObserver)new ResizeObserver(resizeSphereCanvas).observe(photoSphere);

function applySphereMask(){
  const r=Math.max(sphereReveal.radius,.001);
  if(r<1){
    sphereShell.style.maskImage='none';
    sphereShell.style.webkitMaskImage='none';
    sphereShell.style.maskComposite='';
    sphereShell.style.webkitMaskComposite='';
    return;
  }

  /* V25: la apertura deja de ser un círculo perfecto.
     Varias elipses suaves se intersectan como una nube orgánica / microscópica. */
  const x=sphereReveal.x,y=sphereReveal.y;
  const feather=(rx,ry,cx,cy)=>`radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px,
    transparent 0%,transparent 58%,rgba(0,0,0,.06) 66%,rgba(0,0,0,.22) 78%,rgba(0,0,0,.58) 92%,#000 100%)`;
  const wobbleX=Math.sin((x+y)*.018)*r*.045;
  const wobbleY=Math.cos((x-y)*.016)*r*.04;
  const layers=[
    feather(r*.94,r*.82,x,y),
    feather(r*.58,r*.48,x+r*.37+wobbleX,y-r*.13),
    feather(r*.52,r*.43,x-r*.34,y+r*.18+wobbleY),
    feather(r*.40,r*.34,x+r*.08,y+r*.40),
    feather(r*.33,r*.30,x-r*.12,y-r*.40)
  ];
  const mask=layers.join(',');
  sphereShell.style.maskImage=mask;
  sphereShell.style.webkitMaskImage=mask;
  sphereShell.style.maskComposite='intersect';
  sphereShell.style.webkitMaskComposite='source-in, source-in, source-in, source-in';
}

class SphereBot{
  constructor(x,y,angle,force,accent=false){
    this.x=x;this.y=y;this.size=.45+Math.random()*1.45;this.length=this.size*(1.15+Math.random()*2.5);
    this.vx=Math.cos(angle)*force*(.4+Math.random()*.72);this.vy=Math.sin(angle)*force*(.4+Math.random()*.72);
    this.rotation=angle+(Math.random()-.5)*.75;this.spin=(Math.random()-.5)*.055;this.life=1;
    this.decay=.010+Math.random()*.019;this.drag=.968;this.color=botColors[Math.floor(Math.random()*botColors.length)];
    this.accent=accent||Math.random()>.78;
    this.shape=Math.random();
  }
  update(){this.vx*=this.drag;this.vy*=this.drag;this.x+=this.vx;this.y+=this.vy;this.rotation+=this.spin;this.life-=this.decay}
  draw(){
    if(this.life<=0)return;
    microCtx.save();microCtx.globalAlpha=Math.max(0,this.life)*(.42+(this.accent?.32:0));microCtx.translate(this.x,this.y);microCtx.rotate(this.rotation);microCtx.fillStyle=this.color;
    if(this.accent){microCtx.shadowColor=this.color;microCtx.shadowBlur=6}
    if(this.shape>.72){
      microCtx.beginPath();microCtx.arc(0,0,this.size*(this.accent?.82:.55),0,Math.PI*2);microCtx.fill();
    }else if(this.shape>.46){
      microCtx.rotate(Math.PI*.25);microCtx.fillRect(-this.size*.55,-this.size*.55,this.size*1.1,this.size*1.1);
    }else{
      microCtx.fillRect(-this.length/2,-this.size/2,this.length,this.size);
    }
    microCtx.restore();
  }
}

function spawnSphereBots(amount=16,quiet=false){
  if(sphereReveal.radius<10)return;
  for(let i=0;i<amount;i++){
    const angle=Math.random()*Math.PI*2;
    /* Partículas tanto en el borde como dentro de la zona revelada: evita leerlo como un aro. */
    const spawnRadius=sphereReveal.radius*(.28+Math.pow(Math.random(),.55)*.64);
    const x=sphereReveal.x+Math.cos(angle)*spawnRadius,y=sphereReveal.y+Math.sin(angle)*spawnRadius;
    const direction=Math.atan2(y-sphereReveal.y,x-sphereReveal.x)+(Math.random()-.5)*.62;
    sphereBots.push(new SphereBot(x,y,direction,(quiet?.28:.58)+Math.random()*(quiet?.52:1.05),quiet&&Math.random()>.64));
  }
  const cap=lowPowerMode?420:700;
  if(sphereBots.length>cap)sphereBots.splice(0,sphereBots.length-cap);
}

function drawSphereEdge(){
  if(sphereReveal.radius<8)return;
  const count=Math.max(24,Math.floor(sphereReveal.radius/3.8)),now=performance.now()*.00155;
  for(let i=0;i<count;i++){
    if((i+Math.floor(now*6))%4===0)continue;
    const angle=i/count*Math.PI*2;
    const lobe=1+Math.sin(angle*3.1+now*.55)*.055+Math.sin(angle*7.3-now)*.032;
    const noise=Math.sin(angle*11+now)*2.3+Math.sin(angle*17-now*.7)*1.15;
    const r=sphereReveal.radius*(.76*lobe)+noise;
    const x=sphereReveal.x+Math.cos(angle)*r,y=sphereReveal.y+Math.sin(angle)*r;
    const alpha=.065+(Math.sin(angle*5+now)+1)*.05;
    microCtx.save();microCtx.globalAlpha=alpha;microCtx.fillStyle=i%9===0?'#ecffec':'#75ff79';
    const d=i%9===0?1.35:.58;
    microCtx.beginPath();microCtx.arc(x,y,d,0,Math.PI*2);microCtx.fill();microCtx.restore();
  }
}

(function sphereBotLoop(){
  const active=currentScene===1&&(sphereRevealActive||sphereIdleRunning||sphereBots.length>0);
  if(!document.hidden&&active){
    microCtx.clearRect(0,0,sphereWidth,sphereHeight);drawSphereEdge();
    for(let i=sphereBots.length-1;i>=0;i--){const b=sphereBots[i];b.update();b.draw();if(b.life<=0)sphereBots.splice(i,1)}
    requestAnimationFrame(sphereBotLoop);
  }else{
    if(sphereBots.length===0)microCtx.clearRect(0,0,sphereWidth,sphereHeight);
    window.setTimeout(()=>requestAnimationFrame(sphereBotLoop),120);
  }
})();

function setSphereCenterState(active){
  if(sphereCenterActive===active)return;
  sphereCenterActive=active;photoSphere.classList.toggle('sphere-center-active',active);
  if(active){spawnSphereBots(lowPowerMode?24:38);if(gsap)gsap.to(spherePointer,{autoAlpha:.25,scale:.74,duration:.3,ease:'power2.out'})}
  else if(sphereRevealActive&&gsap){gsap.to(spherePointer,{autoAlpha:1,scale:1,duration:.3,ease:'power2.out'})}
}

function moveSphereReveal(clientX,clientY){
  const rect=photoSphere.getBoundingClientRect();
  sphereReveal.x=Math.max(0,Math.min(rect.width,clientX-rect.left));sphereReveal.y=Math.max(0,Math.min(rect.height,clientY-rect.top));
  const cx=rect.width*.5,cy=rect.height*.5;
  const normalized=Math.hypot(sphereReveal.x-cx,sphereReveal.y-cy)/(Math.min(rect.width,rect.height)*.5);
  setSphereCenterState(normalized<.235);
  if(gsap)gsap.to(spherePointer,{x:sphereReveal.x,y:sphereReveal.y,duration:.13,ease:'power3.out',overwrite:true});
  const d=Math.hypot(sphereReveal.x-lastBotX,sphereReveal.y-lastBotY);
  if(d>3.8){spawnSphereBots((lowPowerMode?9:14)+Math.floor(Math.random()*(lowPowerMode?7:12)));lastBotX=sphereReveal.x;lastBotY=sphereReveal.y}
  applySphereMask();
}

function openSphereReveal(){
  sphereRevealActive=true;sphereIdleRunning=false;clearTimeout(touchCloseTimer);clearTimeout(idleTeaseTimer);photoSphere.classList.remove('sphere-idle-tease');photoSphere.classList.add('revealing');
  const targetRadius=Math.min(sphereWidth*.52,266);
  if(!gsap){sphereReveal.radius=targetRadius;applySphereMask();return}
  gsap.to(spherePointer,{autoAlpha:sphereCenterActive?.25:1,scale:sphereCenterActive?.74:1,duration:.26,ease:'power3.out'});
  gsap.killTweensOf(sphereReveal);gsap.to(sphereReveal,{radius:targetRadius,duration:.52,ease:'power3.out',onUpdate:applySphereMask});
  setTimeout(()=>spawnSphereBots(lowPowerMode?34:58),60);
}

function closeSphereReveal({allowIdle=true}={}){
  sphereRevealActive=false;setSphereCenterState(false);photoSphere.classList.remove('revealing');
  if(gsap)gsap.to(spherePointer,{autoAlpha:0,scale:.72,duration:.28,ease:'power2.out'});
  if(!gsap){sphereReveal.radius=0;applySphereMask();if(allowIdle)scheduleIdleSphereTease();return}
  gsap.killTweensOf(sphereReveal);gsap.to(sphereReveal,{radius:0,duration:.68,ease:'power3.inOut',onUpdate:applySphereMask,onComplete:()=>{applySphereMask();if(allowIdle)scheduleIdleSphereTease()}});
}

function runIdleSphereTease(){
  if(currentScene!==1||sphereRevealActive||photoSphere.matches(':hover')||document.hidden)return scheduleIdleSphereTease();
  sphereIdleRunning=true;idleTeaseCycle++;
  photoSphere.classList.add('sphere-idle-tease');
  // Keep the teaser close to the face, but let it drift slightly between pulses.
  const positions=[[.56,.36],[.47,.42],[.62,.46],[.52,.32]];
  const [px,py]=positions[idleTeaseCycle%positions.length];
  sphereReveal.x=sphereWidth*px;sphereReveal.y=sphereHeight*py;
  const idleRadius=Math.min(sphereWidth*.20,102);
  if(!gsap){sphereReveal.radius=idleRadius;applySphereMask();setTimeout(()=>{sphereReveal.radius=0;applySphereMask();sphereIdleRunning=false;photoSphere.classList.remove('sphere-idle-tease');scheduleIdleSphereTease()},1250);return}
  gsap.killTweensOf(sphereReveal);
  gsap.fromTo(sphereReveal,{radius:0},{radius:idleRadius,duration:.62,ease:'power3.out',onUpdate:applySphereMask,onStart:()=>spawnSphereBots(lowPowerMode?18:30,true),onComplete:()=>{
    setTimeout(()=>{
      if(sphereRevealActive)return;
      gsap.to(sphereReveal,{radius:0,duration:.82,ease:'power3.inOut',onUpdate:applySphereMask,onComplete:()=>{sphereIdleRunning=false;photoSphere.classList.remove('sphere-idle-tease');scheduleIdleSphereTease()}});
    },720);
  }});
}

function scheduleIdleSphereTease(delay=2100){
  clearTimeout(idleTeaseTimer);
  idleTeaseTimer=setTimeout(runIdleSphereTease,delay);
}

photoSphere.addEventListener('pointerenter',e=>{
  if(e.pointerType==='touch')return;
  clearTimeout(idleTeaseTimer);sphereIdleRunning=false;photoSphere.classList.remove('sphere-idle-tease');
  moveSphereReveal(e.clientX,e.clientY);openSphereReveal();
});
photoSphere.addEventListener('pointermove',e=>{
  moveSphereReveal(e.clientX,e.clientY);if(!sphereRevealActive)openSphereReveal();
  if(e.pointerType!=='touch'&&gsap){const r=photoSphere.getBoundingClientRect(),nx=(e.clientX-r.left)/r.width-.5,ny=(e.clientY-r.top)/r.height-.5;gsap.to(photoSphere,{rotateY:nx*3.6,rotateX:ny*-3.6,duration:.46,transformPerspective:1150,ease:'power3.out',overwrite:'auto'})}
});
photoSphere.addEventListener('pointerleave',e=>{
  if(e.pointerType==='touch')return;
  closeSphereReveal();if(gsap)gsap.to(photoSphere,{rotateX:0,rotateY:0,duration:.78,ease:'power3.out'});
});
photoSphere.addEventListener('click',e=>{
  if(!sphereCenterActive)return;
  e.preventDefault();window.open(whatsappUrl,'_blank','noopener,noreferrer');
});
photoSphere.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;e.preventDefault();clearTimeout(idleTeaseTimer);moveSphereReveal(e.clientX,e.clientY);openSphereReveal();
});
photoSphere.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch')return;
  if(sphereCenterActive){window.open(whatsappUrl,'_blank','noopener,noreferrer');return}
  clearTimeout(touchCloseTimer);touchCloseTimer=setTimeout(()=>closeSphereReveal(),1000);
});

setInterval(()=>{if(!document.hidden&&currentScene===1&&sphereRevealActive&&sphereReveal.radius>35)spawnSphereBots(lowPowerMode?4:7)},145);
// First autonomous invitation. It only runs while the About scene is visible.
scheduleIdleSphereTease(1850);

/* Direction pulse */
setInterval(()=>{if(document.hidden||!gsap||isTransitioning||reelVideoViewerOpen)return;const vector=vectors[forwardRoute[currentScene].direction];gsap.fromTo(directionArrow,{x:0,y:0},{x:vector.x*4,y:vector.y*4,duration:.5,yoyo:true,repeat:1,ease:'power2.inOut'})},3000);

let layoutResizeFrame=0;
window.addEventListener('resize',()=>{
  cancelAnimationFrame(layoutResizeFrame);
  layoutResizeFrame=requestAnimationFrame(()=>{resizeSphereCanvas();applySphereMask();resizeLandingThree()});
},{passive:true});



/* =========================================================
   V14 — smooth cursor color field for name + sacred geometry
   ========================================================= */
const landingSacredGrid=document.getElementById('landingSacredGrid');
let reactiveNameTargetX=-68,reactiveNameTargetY=50,reactiveNameX=-68,reactiveNameY=50;
let reactiveGeoTargetX=50,reactiveGeoTargetY=50,reactiveGeoX=50,reactiveGeoY=50;

landingSceneEl.addEventListener('pointermove',event=>{
  if(currentScene!==0)return;
  const nameRect=landingNameWrap.getBoundingClientRect();
  // Deliberately allow values outside 0–100: when the cursor moves away,
  // the green field actually leaves the typography and it settles back to black.
  reactiveNameTargetX=Math.max(-85,Math.min(185,(event.clientX-nameRect.left)/nameRect.width*100));
  reactiveNameTargetY=Math.max(-85,Math.min(185,(event.clientY-nameRect.top)/nameRect.height*100));
  reactiveGeoTargetX=Math.max(0,Math.min(100,event.clientX/innerWidth*100));
  reactiveGeoTargetY=Math.max(0,Math.min(100,event.clientY/innerHeight*100));
});
landingSceneEl.addEventListener('touchmove',event=>{
  if(currentScene!==0||!event.touches.length)return;
  const t=event.touches[0],nameRect=landingNameWrap.getBoundingClientRect();
  reactiveNameTargetX=Math.max(-85,Math.min(185,(t.clientX-nameRect.left)/nameRect.width*100));
  reactiveNameTargetY=Math.max(-85,Math.min(185,(t.clientY-nameRect.top)/nameRect.height*100));
  reactiveGeoTargetX=Math.max(0,Math.min(100,t.clientX/innerWidth*100));
  reactiveGeoTargetY=Math.max(0,Math.min(100,t.clientY/innerHeight*100));
},{passive:true});

landingSceneEl.addEventListener('pointerleave',()=>{
  reactiveNameTargetX=-68;
  reactiveNameTargetY=50;
  reactiveGeoTargetX=50;
  reactiveGeoTargetY=50;
});

(function reactiveLandingColorLoop(){
  if(!document.hidden&&currentScene===0){
    reactiveNameX+=(reactiveNameTargetX-reactiveNameX)*.07;
    reactiveNameY+=(reactiveNameTargetY-reactiveNameY)*.07;
    reactiveGeoX+=(reactiveGeoTargetX-reactiveGeoX)*.055;
    reactiveGeoY+=(reactiveGeoTargetY-reactiveGeoY)*.055;
    document.documentElement.style.setProperty('--name-cursor-x',`${reactiveNameX}%`);
    document.documentElement.style.setProperty('--name-cursor-y',`${reactiveNameY}%`);
    document.documentElement.style.setProperty('--geo-x',`${reactiveGeoX}%`);
    document.documentElement.style.setProperty('--geo-y',`${reactiveGeoY}%`);
  }
  requestAnimationFrame(reactiveLandingColorLoop);
})();

console.info('[Portfolio] build V34 performance-balance');

async function boot(){try{await document.fonts.ready}catch(error){console.warn('No se pudieron esperar las fuentes.',error)}configureMobileExperience();initLandingThree();updateInterface();landingNameWrap.classList.add('is-ready');revealSceneContent(scenes[currentScene]);if(mobileMode&&currentScene===1)scheduleIdleSphereTease(1050)}
boot();

/* =========================================================
   V15 — WORK / SOCIAL SHOWCASE
   Carrusel de contenido + deck de cuentas de Instagram.
   Aislado de la landing para no alterar la primera escena.
========================================================= */

const workContentSlides = [
  { src:'https://turuleka.com/wp-content/uploads/2026/08/1.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 1' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/2.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 2' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/3.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 3' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/4.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 4' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/5.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 5' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/6.png',   brand:'TURULEKA', alt:'Carrusel diseñado para Turuleka, pieza 6' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/1-2.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 1' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/2-1.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 2' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/3-1.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 3' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/4-1.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 4' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/5-1.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 5' },
  { src:'https://turuleka.com/wp-content/uploads/2026/08/6-1.png', brand:'TALLER VG', alt:'Carrusel diseñado para Taller VG, pieza 6' }
];

const workContentShowcase = document.getElementById('contentShowcase');
const workContentImageA = document.getElementById('contentCarouselImageA');
const workContentImageB = document.getElementById('contentCarouselImageB');
const workContentBrand = document.getElementById('contentCarouselBrand');
const workContentCounter = document.getElementById('contentCarouselCounter');
const workContentRail = document.getElementById('contentCarouselRailProgress');
const workContentPrev = document.getElementById('contentCarouselPrev');
const workContentNext = document.getElementById('contentCarouselNext');

let workContentIndex = 0;
let workContentVisibleLayer = 'A';
let workContentBusy = false;
let workContentPaused = false;
let workContentHologramOpen = false;
let workContentTimer = null;

function workNormalizeIndex(index, length){
  return ((index % length) + length) % length;
}

function workPreloadSlide(index){
  const slide = workContentSlides[workNormalizeIndex(index, workContentSlides.length)];
  const img = new Image();
  img.src = slide.src;
}

function workUpdateContentMeta(index){
  const slide = workContentSlides[index];
  if(!slide) return;

  if(window.gsap && workContentBrand && workContentCounter){
    gsap.to([workContentBrand, workContentCounter],{
      autoAlpha:0,
      y:5,
      duration:.18,
      ease:'power2.in',
      overwrite:true,
      onComplete(){
        workContentBrand.textContent = slide.brand;
        workContentCounter.textContent = `${String(index + 1).padStart(2,'0')} / ${String(workContentSlides.length).padStart(2,'0')}`;
        gsap.fromTo([workContentBrand, workContentCounter],{autoAlpha:0,y:-4},{autoAlpha:1,y:0,duration:.34,ease:'power3.out'});
      }
    });
  }else{
    if(workContentBrand) workContentBrand.textContent = slide.brand;
    if(workContentCounter) workContentCounter.textContent = `${String(index + 1).padStart(2,'0')} / ${String(workContentSlides.length).padStart(2,'0')}`;
  }

  if(workContentRail){
    workContentRail.style.transform = `translateY(${index * 100}%)`;
  }
}

async function workGoToContentSlide(targetIndex){
  if(workContentBusy || !workContentImageA || !workContentImageB) return;

  const nextIndex = workNormalizeIndex(targetIndex, workContentSlides.length);
  if(nextIndex === workContentIndex) return;

  workContentBusy = true;

  const currentImage = workContentVisibleLayer === 'A' ? workContentImageA : workContentImageB;
  const incomingImage = workContentVisibleLayer === 'A' ? workContentImageB : workContentImageA;
  const slide = workContentSlides[nextIndex];

  incomingImage.classList.remove('is-visible');
  incomingImage.style.zIndex = '2';
  currentImage.style.zIndex = '1';
  incomingImage.src = slide.src;
  incomingImage.alt = slide.alt;

  try{
    if(incomingImage.decode) await incomingImage.decode();
  }catch(error){
    // El navegador puede rechazar decode si la imagen ya está en caché;
    // no bloqueamos la transición por eso.
  }

  requestAnimationFrame(()=>{
    incomingImage.classList.add('is-visible');
    currentImage.classList.remove('is-visible');
  });

  workContentIndex = nextIndex;
  workContentVisibleLayer = workContentVisibleLayer === 'A' ? 'B' : 'A';
  workUpdateContentMeta(workContentIndex);
  workPreloadSlide(workContentIndex + 1);

  window.setTimeout(()=>{
    workContentBusy = false;
  },760);
}

function workScheduleContentAutoplay(){
  window.clearTimeout(workContentTimer);
  if(document.hidden || currentScene!==2 || workContentPaused || workContentHologramOpen) return;

  workContentTimer = window.setTimeout(async ()=>{
    if(currentScene!==2 || document.hidden) return;
    await workGoToContentSlide(workContentIndex + 1);
    workScheduleContentAutoplay();
  },3400);
}

function workManualContentMove(delta){
  workGoToContentSlide(workContentIndex + delta).finally(()=>{
    workScheduleContentAutoplay();
  });
}

if(workContentPrev){
  workContentPrev.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    workManualContentMove(-1);
  });
}

if(workContentNext){
  workContentNext.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    workManualContentMove(1);
  });
}

if(workContentShowcase){
  workContentShowcase.addEventListener('mouseenter',()=>{
    workContentPaused = true;
    window.clearTimeout(workContentTimer);
  });

  workContentShowcase.addEventListener('mouseleave',()=>{
    if(workContentHologramOpen) return;
    workContentPaused = false;
    workScheduleContentAutoplay();
  });

  workContentShowcase.addEventListener('focusin',()=>{
    workContentPaused = true;
    window.clearTimeout(workContentTimer);
  });

  workContentShowcase.addEventListener('focusout',()=>{
    workContentPaused = false;
    workScheduleContentAutoplay();
  });
}

workPreloadSlide(1);
workUpdateContentMeta(0);
workScheduleContentAutoplay();

/* ---------------------------------------------------------
   INSTAGRAM CARD DECK
--------------------------------------------------------- */

const workInstagramDeck = document.getElementById('instagramDeck');
const workInstagramCards = workInstagramDeck ? Array.from(workInstagramDeck.querySelectorAll('.instagram-profile-card')) : [];
const workInstagramNext = document.getElementById('instagramDeckNext');
const workInstagramDots = Array.from(document.querySelectorAll('#instagramDeckDots i'));

let workInstagramIndex = 0;
let workInstagramAnimating = false;

function workRenderInstagramDeck(){
  const total = workInstagramCards.length;
  if(!total) return;

  workInstagramCards.forEach((card,index)=>{
    card.classList.remove('is-front','is-middle','is-back');

    const offset = workNormalizeIndex(index - workInstagramIndex,total);

    if(offset === 0){
      card.classList.add('is-front');
      card.tabIndex = 0;
      card.setAttribute('aria-hidden','false');
    }else if(offset === 1){
      card.classList.add('is-middle');
      card.tabIndex = -1;
      card.setAttribute('aria-hidden','true');
    }else{
      card.classList.add('is-back');
      card.tabIndex = -1;
      card.setAttribute('aria-hidden','true');
    }
  });

  workInstagramDots.forEach((dot,index)=>{
    dot.classList.toggle('active',index === workInstagramIndex);
  });
}

function workNextInstagramCard(){
  if(workInstagramAnimating || !workInstagramCards.length) return;

  workInstagramAnimating = true;
  const leavingCard = workInstagramCards[workInstagramIndex];
  leavingCard.classList.add('is-leaving');

  window.setTimeout(()=>{
    leavingCard.classList.add('is-resetting');
    workInstagramIndex = workNormalizeIndex(workInstagramIndex + 1,workInstagramCards.length);
    workRenderInstagramDeck();
    leavingCard.classList.remove('is-leaving');

    // Reinsertamos la tarjeta detrás sin que cruce toda la pantalla.
    void leavingCard.offsetWidth;
    requestAnimationFrame(()=>{
      leavingCard.classList.remove('is-resetting');
      workInstagramAnimating = false;
    });
  },430);
}

if(workInstagramNext){
  workInstagramNext.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    workNextInstagramCard();
  });
}

if(workInstagramDeck){
  let workDeckTouchStartX = 0;

  workInstagramDeck.addEventListener('touchstart',event=>{
    if(!event.touches.length) return;
    workDeckTouchStartX = event.touches[0].clientX;
  },{passive:true});

  workInstagramDeck.addEventListener('touchend',event=>{
    if(!event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - workDeckTouchStartX;
    if(dx > 45) workNextInstagramCard();
  },{passive:true});
}

workRenderInstagramDeck();

/* Pausamos el autoplay visual cuando la pestaña no está activa. */
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    window.clearTimeout(workContentTimer);
  }else if(!workContentPaused){
    workScheduleContentAutoplay();
  }
});


/* =========================================================
   V19 — HOVER 1S / VISTA COMPLETA HOLOGRÁFICA
   Mantiene el carrusel intacto y despliega la pieza completa
   desde el centro hacia afuera con una lectura tipo holograma.
========================================================= */

const workHologramPreview = document.getElementById('contentHologramPreview');
const workHologramStage = document.getElementById('hologramPreviewStage');
const workHologramImage = document.getElementById('hologramPreviewImage');
const workHologramBrand = document.getElementById('hologramPreviewBrand');
const workHologramCounter = document.getElementById('hologramPreviewCounter');
const workHologramFrame = workHologramStage ? workHologramStage.querySelector('.hologram-preview-frame') : null;
const workHologramPrev = document.getElementById('hologramPreviewPrev');
const workHologramNext = document.getElementById('hologramPreviewNext');
const workContentViewport = document.getElementById('contentCarouselViewport');

let workHologramHoverTimer = null;
let workHologramCloseTimer = null;
let workHologramPointerX = 0;
let workHologramPointerY = 0;
let workHologramNavBusy = false;
let workHologramWheelLocked = false;

function workCancelHologramHover(){
  window.clearTimeout(workHologramHoverTimer);
  workHologramHoverTimer = null;
}

function workOpenHologramPreview(){
  if(!workHologramPreview || !workHologramImage || currentScene !== 2) return;

  const slide = workContentSlides[workContentIndex];
  if(!slide) return;

  workContentHologramOpen = true;
  workContentPaused = true;
  window.clearTimeout(workContentTimer);

  workHologramImage.src = slide.src;
  workHologramImage.alt = slide.alt || 'Vista completa de la pieza del carrusel';
  if(workHologramBrand) workHologramBrand.textContent = slide.brand;
  if(workHologramCounter){
    workHologramCounter.textContent = `${String(workContentIndex + 1).padStart(2,'0')} / ${String(workContentSlides.length).padStart(2,'0')}`;
  }

  workHologramPreview.setAttribute('aria-hidden','false');

  // Reinicia la expansión radial incluso si la vista ya fue utilizada antes.
  workHologramPreview.classList.remove('is-open');
  void workHologramPreview.offsetWidth;
  workHologramPreview.classList.add('is-open');
}

function workCloseHologramPreview(){
  workCancelHologramHover();
  window.clearTimeout(workHologramCloseTimer);
  if(!workHologramPreview || !workContentHologramOpen) return;

  workContentHologramOpen = false;
  workHologramPreview.classList.remove('is-open');
  workHologramPreview.setAttribute('aria-hidden','true');

  const stillOverShowcase = Boolean(workContentShowcase && workContentShowcase.matches(':hover'));
  workContentPaused = stillOverShowcase;
  if(!workContentPaused) workScheduleContentAutoplay();
}

function workScheduleHologramHover(){
  if(workContentHologramOpen || currentScene !== 2) return;
  workCancelHologramHover();
  workHologramHoverTimer = window.setTimeout(()=>{
    workOpenHologramPreview();
  },1000);
}

/* ---------------------------------------------------------
   V20 — NAVEGACIÓN DENTRO DE LA VISTA HOLOGRÁFICA
   Sin cerrar el escáner: anterior/siguiente, rueda y teclado.
   Cada cambio sincroniza también el carrusel original y dispara
   un micro glitch direccional de corta duración.
--------------------------------------------------------- */

function workSyncHologramMeta(){
  const slide = workContentSlides[workContentIndex];
  if(!slide) return;

  if(workHologramImage){
    workHologramImage.src = slide.src;
    workHologramImage.alt = slide.alt || 'Vista completa de la pieza del carrusel';
  }
  if(workHologramBrand) workHologramBrand.textContent = slide.brand;
  if(workHologramCounter){
    workHologramCounter.textContent = `${String(workContentIndex + 1).padStart(2,'0')} / ${String(workContentSlides.length).padStart(2,'0')}`;
  }
}

function workSetHologramControlsDisabled(disabled){
  [workHologramPrev,workHologramNext].forEach(button=>{
    if(button) button.disabled = Boolean(disabled);
  });
}

function workPlayHologramGlitch(direction){
  if(!workHologramFrame) return;

  workHologramFrame.classList.remove('is-glitching','is-glitch-next','is-glitch-prev');
  void workHologramFrame.offsetWidth;
  workHologramFrame.classList.add('is-glitching',direction > 0 ? 'is-glitch-next' : 'is-glitch-prev');

  window.setTimeout(()=>{
    workHologramFrame.classList.remove('is-glitching','is-glitch-next','is-glitch-prev');
  },390);
}

async function workNavigateHologram(delta){
  if(!workContentHologramOpen || workHologramNavBusy || workContentBusy || !delta) return;

  workHologramNavBusy = true;
  workSetHologramControlsDisabled(true);
  workPlayHologramGlitch(delta);

  // Pequeño desfase para que el corte visual ocurra justo antes del nuevo frame.
  await new Promise(resolve=>window.setTimeout(resolve,105));

  const targetIndex = workNormalizeIndex(workContentIndex + delta,workContentSlides.length);
  const targetSlide = workContentSlides[targetIndex];

  // Precargamos el frame del escáner; el carrusel base se mantiene sincronizado.
  if(targetSlide){
    const preload = new Image();
    preload.src = targetSlide.src;
    try{
      if(preload.decode) await preload.decode();
    }catch(error){
      // La caché o CORS pueden impedir decode; el cambio sigue funcionando.
    }
  }

  await workGoToContentSlide(targetIndex);
  workSyncHologramMeta();

  // El carrusel base conserva un bloqueo breve; respetamos ese tiempo para evitar saltos.
  window.setTimeout(()=>{
    workHologramNavBusy = false;
    workSetHologramControlsDisabled(false);
  },690);
}

if(workHologramPrev){
  workHologramPrev.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    workNavigateHologram(-1);
  });
}

if(workHologramNext){
  workHologramNext.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    workNavigateHologram(1);
  });
}

if(workHologramStage){
  // La rueda dentro del escáner navega las piezas y no cambia de página.
  workHologramStage.addEventListener('wheel',event=>{
    if(!workContentHologramOpen) return;
    event.preventDefault();
    event.stopPropagation();

    if(workHologramWheelLocked) return;
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if(Math.abs(dominantDelta) < 8) return;

    workHologramWheelLocked = true;
    workNavigateHologram(dominantDelta > 0 ? 1 : -1);
    window.setTimeout(()=>{ workHologramWheelLocked = false; },780);
  },{passive:false});
}

if(workContentViewport){
  workContentViewport.addEventListener('pointerenter',event=>{
    if(event.pointerType === 'touch') return;
    workHologramPointerX = event.clientX;
    workHologramPointerY = event.clientY;
    workScheduleHologramHover();
  });

  workContentViewport.addEventListener('pointermove',event=>{
    if(event.pointerType === 'touch') return;
    workHologramPointerX = event.clientX;
    workHologramPointerY = event.clientY;

    // Los controles manuales continúan siendo controles, no disparadores del preview.
    if(event.target.closest('.content-carousel-btn')){
      workCancelHologramHover();
      return;
    }

    if(!workContentHologramOpen && !workHologramHoverTimer){
      workScheduleHologramHover();
    }
  });

  workContentViewport.addEventListener('pointerleave',()=>{
    if(!workContentHologramOpen) workCancelHologramHover();
  });
}

// Como el holograma visual no bloquea el puntero, medimos la cercanía a la pieza
// ampliada y la retiramos de manera elegante cuando el usuario realmente se aleja.
window.addEventListener('pointermove',event=>{
  if(!workContentHologramOpen || !workHologramStage) return;

  const rect = workHologramStage.getBoundingClientRect();
  const pad = 72;
  const inside = event.clientX >= rect.left - pad && event.clientX <= rect.right + pad &&
                 event.clientY >= rect.top - pad && event.clientY <= rect.bottom + pad;

  window.clearTimeout(workHologramCloseTimer);
  if(!inside){
    workHologramCloseTimer = window.setTimeout(workCloseHologramPreview,260);
  }
});

if(workContentPrev){
  workContentPrev.addEventListener('click',workCloseHologramPreview,{capture:true});
}
if(workContentNext){
  workContentNext.addEventListener('click',workCloseHologramPreview,{capture:true});
}

window.addEventListener('keydown',event=>{
  if(!workContentHologramOpen) return;

  if(event.key === 'Escape'){
    event.preventDefault();
    workCloseHologramPreview();
    return;
  }

  if(event.key === 'ArrowRight' || event.key === 'ArrowDown'){
    event.preventDefault();
    event.stopImmediatePropagation();
    workNavigateHologram(1);
    return;
  }

  if(event.key === 'ArrowLeft' || event.key === 'ArrowUp'){
    event.preventDefault();
    event.stopImmediatePropagation();
    workNavigateHologram(-1);
  }
});

// Si se abandona la página de trabajo, nunca dejamos la vista suspendida.
const workOriginalUpdateInterface = updateInterface;
updateInterface = function(){
  workOriginalUpdateInterface();
  if(currentScene !== 2 && workContentHologramOpen){
    workCloseHologramPreview();
  }
};


/* =========================================================
   V25 — VIDEO ENGINE ESTABILIZADO
   - conserva los MP4 remotos de Turuleka
   - precarga escalonada para aprovechar caché HTTP
   - no destruye el src al cerrar (evita volver a descargar)
   - feedback real de buffering / stalled / playing
   - reduce trabajo visual mientras el video está reproduciendo
========================================================= */

const reelViewer = document.getElementById('reelVideoViewer');
const reelViewerStage = reelViewer?.querySelector('.reel-viewer-stage');
const reelViewerFrame = document.getElementById('reelViewerFrame');
const reelViewerVideo = document.getElementById('reelViewerVideo');
const reelViewerLabel = document.getElementById('reelViewerLabel');
const reelViewerClose = document.getElementById('reelViewerClose');
const reelViewerLoading = document.getElementById('reelViewerLoading');
const reelViewerLoadingText = reelViewerLoading?.querySelector('span');
const reelViewerError = document.getElementById('reelViewerError');
const reelViewerBackdrop = reelViewer?.querySelector('[data-close-reel-viewer]');
const reelViewerGlow = reelViewer?.querySelector('.reel-viewer-glow');
const reelOpenButtons = [...document.querySelectorAll('[data-open-reel]')];
const reelDeviceVideos = [...document.querySelectorAll('.reel-device-video')];
const reelDevices = [...document.querySelectorAll('.reel-device[data-reel-src]')];
let reelViewerRestoreFocus = null;
let reelViewerLoadToken = 0;
let reelWarmupGeneration = 0;
let reelLastRequestedSrc = '';

function formatVideoDuration(seconds){
  if(!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function setReelLoadingText(text='PREPARANDO VIDEO'){
  if(reelViewerLoadingText) reelViewerLoadingText.textContent=text;
}

function getBufferedAhead(video){
  if(!video || !video.buffered?.length || !Number.isFinite(video.currentTime)) return 0;
  const t=video.currentTime;
  for(let i=0;i<video.buffered.length;i++){
    if(t>=video.buffered.start(i)-.06 && t<=video.buffered.end(i)+.06){
      return Math.max(0,video.buffered.end(i)-t);
    }
  }
  return 0;
}

/* Los mockups funcionan también como caché de precarga. El navegador puede
   reutilizar esos bytes cuando el mismo URL se abre en el visor grande. */
function warmReelMedia(video,{aggressive=false}={}){
  if(!video) return;
  const wanted=aggressive?'auto':'none';
  if(video.preload!==wanted) video.preload=wanted;
  video.muted=true;
  video.playsInline=true;
  video.disableRemotePlayback=true;
  if(aggressive && video.readyState<2){
    try{video.load()}catch(error){}
  }
}

function warmReelsForScene(sceneIndex=currentScene){
  const generation=++reelWarmupGeneration;
  const center=document.querySelector('.reel-device-main .reel-device-video');
  const sides=reelDeviceVideos.filter(video=>video!==center);

  // Desde Trabajo anticipamos el siguiente paso sin descargar todo de golpe.
  if(sceneIndex===2){
    runWhenIdle(()=>{
      if(generation!==reelWarmupGeneration || currentScene!==2 || document.hidden) return;
      warmReelMedia(center,{aggressive:true});
    },1000);
    return;
  }

  if(sceneIndex!==3) return;
  warmReelMedia(center,{aggressive:true});
  sides.forEach((video,index)=>{
    runWhenIdle(()=>{
      if(generation!==reelWarmupGeneration || currentScene!==3 || document.hidden) return;
      warmReelMedia(video,{aggressive:true});
    },650+index*450);
  });
}

reelDeviceVideos.forEach(video=>{
  const device=video.closest('.reel-device');
  const durationLabel=device?.querySelector('.reel-duration');
  warmReelMedia(video,{aggressive:false});

  video.addEventListener('loadedmetadata',()=>{
    if(durationLabel) durationLabel.textContent=formatVideoDuration(video.duration);
    if(Number.isFinite(video.duration)&&video.duration>.08){
      try{
        if(typeof video.fastSeek==='function') video.fastSeek(Math.min(.06,video.duration*.01));
        else video.currentTime=Math.min(.06,video.duration*.01);
      }catch(error){}
    }
  });
  video.addEventListener('loadeddata',()=>device?.classList.add('has-video-frame'));
  video.addEventListener('error',()=>{
    device?.classList.add('video-missing');
    if(durationLabel) durationLabel.textContent='VIDEO';
  });

  device?.addEventListener('pointerenter',()=>warmReelMedia(video,{aggressive:true}),{passive:true});
  device?.addEventListener('focusin',()=>warmReelMedia(video,{aggressive:true}));
});

function resetReelViewerVisualState(){
  if(!reelViewer) return;
  reelViewer.classList.remove('is-ready','is-playing','is-buffering','has-error');
  setReelLoadingText('PREPARANDO VIDEO');
  if(reelViewerError) reelViewerError.style.display='';
}

function sizeReelViewerToVideo(){
  if(!reelViewer || !reelViewerVideo) return;
  const videoW=reelViewerVideo.videoWidth||1080;
  const videoH=reelViewerVideo.videoHeight||1920;
  const ratio=Math.max(.2,Math.min(5,videoW/videoH));
  const mobile=window.innerWidth<=760;
  const horizontalRoom=window.innerWidth-(mobile?24:120);
  const verticalRoom=window.innerHeight-(mobile?104:116);
  let frameW=Math.min(horizontalRoom,verticalRoom*ratio);
  let frameH=frameW/ratio;
  if(frameH>verticalRoom){frameH=verticalRoom;frameW=frameH*ratio}
  frameW=Math.max(mobile?220:250,frameW);
  frameH=Math.max(mobile?300:320,frameH);
  reelViewer.style.setProperty('--viewer-frame-w',`${Math.round(frameW)}px`);
  reelViewer.style.setProperty('--viewer-frame-h',`${Math.round(frameH)}px`);
  reelViewer.style.setProperty('--viewer-aspect',String(ratio));
}

function markReelBuffering(reason='BUFFERING'){
  if(!reelVideoViewerOpen || !reelViewer) return;
  reelViewer.classList.add('is-buffering');
  reelViewer.classList.remove('is-playing');
  setReelLoadingText(reason==='STALLED'?'RECUPERANDO STREAM':'CARGANDO BUFFER');
}

function markReelPlayable(){
  if(!reelVideoViewerOpen || !reelViewer) return;
  reelViewer.classList.add('is-ready');
  if(reelViewerVideo?.paused){
    // listo, pero todavía no está reproduciendo
    reelViewer.classList.remove('is-buffering');
  }
}

function markReelPlaying(){
  if(!reelVideoViewerOpen || !reelViewer) return;
  reelViewer.classList.add('is-ready','is-playing');
  reelViewer.classList.remove('is-buffering');
}

if(reelViewerVideo){
  reelViewerVideo.preload='auto';
  reelViewerVideo.playsInline=true;
  reelViewerVideo.disableRemotePlayback=true;
  reelViewerVideo.addEventListener('loadedmetadata',()=>{sizeReelViewerToVideo();markReelPlayable()});
  reelViewerVideo.addEventListener('loadeddata',markReelPlayable);
  reelViewerVideo.addEventListener('canplay',markReelPlayable);
  reelViewerVideo.addEventListener('playing',markReelPlaying);
  reelViewerVideo.addEventListener('waiting',()=>markReelBuffering('BUFFERING'));
  reelViewerVideo.addEventListener('stalled',()=>markReelBuffering('STALLED'));
  reelViewerVideo.addEventListener('progress',()=>{
    if(reelVideoViewerOpen && reelViewer.classList.contains('is-buffering') && reelViewerVideo.readyState>=3 && getBufferedAhead(reelViewerVideo)>.7){
      reelViewer.classList.remove('is-buffering');
    }
  });
  reelViewerVideo.addEventListener('pause',()=>{
    if(reelVideoViewerOpen) reelViewer?.classList.remove('is-playing');
  });
  reelViewerVideo.addEventListener('error',()=>{
    if(!reelVideoViewerOpen) return;
    reelViewer?.classList.add('has-error');
    reelViewer?.classList.remove('is-buffering','is-playing');
  });
}

async function openReelViewer(button){
  if(!reelViewer || !reelViewerVideo || !button) return;
  const src=button.dataset.openReel;
  const label=button.dataset.reelLabel||'REEL';
  if(!src) return;

  reelViewerRestoreFocus=button;
  reelVideoViewerOpen=true;
  wheelAccumulator=0;
  resetReelViewerVisualState();
  if(reelViewerLabel) reelViewerLabel.textContent=label;
  reelViewer.setAttribute('aria-hidden','false');
  reelViewer.classList.add('is-open','is-buffering');
  document.body.classList.add('reel-viewer-open');

  if(gsap){
    gsap.killTweensOf([reelViewer,reelViewerStage,reelViewerGlow]);
    gsap.set(reelViewer,{autoAlpha:1,visibility:'visible'});
    gsap.fromTo(reelViewerStage,{autoAlpha:0,scale:.9,y:12},{autoAlpha:1,scale:1,y:0,duration:.58,ease:'power4.out',force3D:true});
    gsap.fromTo(reelViewerGlow,{autoAlpha:0,scale:.58},{autoAlpha:.72,scale:1,duration:.72,ease:'power3.out',force3D:true});
  }

  const token=++reelViewerLoadToken;
  const currentAttr=reelViewerVideo.getAttribute('src')||'';
  const sameSource=currentAttr===src || reelViewerVideo.currentSrc===src;

  try{
    reelViewerVideo.pause();
    reelViewerVideo.preload='auto';
    reelViewerVideo.playbackRate=1;
    reelViewerVideo.defaultPlaybackRate=1;

    /* V25: no borramos el src al cerrar. Si es el mismo URL, conservamos buffer/cache. */
    if(!sameSource){
      reelLastRequestedSrc=src;
      reelViewerVideo.src=src;
      reelViewerVideo.load();
    }

    const resetTime=()=>{
      try{
        if(typeof reelViewerVideo.fastSeek==='function') reelViewerVideo.fastSeek(0);
        else reelViewerVideo.currentTime=0;
      }catch(error){}
    };

    if(reelViewerVideo.readyState>=1) resetTime();
    else reelViewerVideo.addEventListener('loadedmetadata',()=>{
      if(token===reelViewerLoadToken) resetTime();
    },{once:true});

    /* play() sigue ocurriendo dentro de la acción de usuario. Con la precarga previa,
       Chrome normalmente arranca con varios segundos ya disponibles. */
    const playPromise=reelViewerVideo.play();
    if(playPromise&&typeof playPromise.catch==='function'){
      playPromise.catch(error=>{
        if(token!==reelViewerLoadToken || !reelVideoViewerOpen) return;
        // Si el navegador bloquea autoplay, dejamos el video listo y controles visibles.
        reelViewer.classList.add('is-ready');
        reelViewer.classList.remove('is-buffering');
        console.debug('Reproducción esperando interacción:',error?.name||error);
      });
    }

    if(reelViewerVideo.readyState>=2){
      sizeReelViewerToVideo();
      markReelPlayable();
    }
  }catch(error){
    if(token===reelViewerLoadToken) reelViewer.classList.add('has-error');
  }

  window.setTimeout(()=>reelViewerClose?.focus({preventScroll:true}),320);
}

function closeReelViewer({restoreFocus=true}={}){
  if(!reelViewer || !reelVideoViewerOpen) return;
  reelVideoViewerOpen=false;
  reelViewerLoadToken++;
  wheelAccumulator=0;

  if(reelViewerVideo){
    reelViewerVideo.pause();
    try{reelViewerVideo.currentTime=0}catch(error){}
    // Intencionalmente NO removeAttribute('src') / load(): preservamos el buffer.
  }

  const finish=()=>{
    reelViewer.classList.remove('is-open','is-ready','is-playing','is-buffering','has-error');
    reelViewer.setAttribute('aria-hidden','true');
    document.body.classList.remove('reel-viewer-open');
    if(gsap) gsap.set(reelViewer,{visibility:'hidden'});
    if(restoreFocus&&reelViewerRestoreFocus) reelViewerRestoreFocus.focus({preventScroll:true});
  };

  if(gsap){
    gsap.killTweensOf([reelViewer,reelViewerStage,reelViewerGlow]);
    gsap.to(reelViewerStage,{autoAlpha:0,scale:.96,y:6,duration:.27,ease:'power3.in',force3D:true});
    gsap.to(reelViewerGlow,{autoAlpha:0,scale:.85,duration:.25,ease:'power2.in',force3D:true});
    gsap.to(reelViewer,{autoAlpha:0,duration:.29,ease:'power2.in',onComplete:finish});
  }else finish();
}

reelOpenButtons.forEach(button=>{
  button.addEventListener('pointerenter',()=>{
    const src=button.dataset.openReel;
    const deviceVideo=reelDeviceVideos.find(video=>video.getAttribute('src')===src);
    warmReelMedia(deviceVideo,{aggressive:true});
  },{passive:true});
  button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();openReelViewer(button);
  });
});

reelViewerClose?.addEventListener('click',event=>{event.preventDefault();closeReelViewer()});
reelViewerBackdrop?.addEventListener('click',()=>closeReelViewer());

window.addEventListener('keydown',event=>{
  if(!reelVideoViewerOpen) return;
  if(event.key==='Escape'){
    event.preventDefault();event.stopImmediatePropagation();closeReelViewer();return;
  }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)){
    if(event.key===' '&&document.activeElement===reelViewerVideo) return;
    event.stopImmediatePropagation();
  }
},true);

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(reelVideoViewerOpen&&reelViewerVideo) reelViewerVideo.pause();
    window.clearTimeout(workContentTimer);
  }else{
    if(currentScene===2&&!workContentPaused) workScheduleContentAutoplay();
    warmReelsForScene(currentScene);
  }
});

/* Un único wrapper final para sincronizar tareas costosas con la escena visible. */
const v25BaseUpdateInterface=updateInterface;
updateInterface=function(){
  v25BaseUpdateInterface();
  if(currentScene!==3&&reelVideoViewerOpen) closeReelViewer({restoreFocus:false});
  if(currentScene===1) scheduleIdleSphereTease(1100); else clearTimeout(idleTeaseTimer);
  if(currentScene===2) workScheduleContentAutoplay(); else window.clearTimeout(workContentTimer);
  warmReelsForScene(currentScene);
};

window.addEventListener('resize',()=>{
  if(reelVideoViewerOpen&&reelViewerVideo?.videoWidth) sizeReelViewerToVideo();
},{passive:true});

/* Primera precarga liviana: sólo metadata. La carga agresiva comienza al acercarse a Reels. */
/* V34: sin precarga global de reels; se activan al acercarse a la escena 04. */



/* =========================================================
   V29 — MOBILE REELS: DECK HORIZONTAL / ACTIVE FOCUS
   - Todos los teléfonos parten compactos.
   - El que queda centrado o se toca crece y recupera color.
   - Swipe horizontal con snap entre reels.
   - El botón PLAY conserva el visor original.
========================================================= */
(function initV29MobileReels(){
  if(!mobileMode) return;

  const row=document.querySelector('.scene-reels .reel-devices-row');
  const cards=[...document.querySelectorAll('.scene-reels .reel-device[data-reel-src]')];
  if(!row||!cards.length) return;

  let activeCard=cards.find(card=>card.classList.contains('reel-device-main'))||cards[0];
  let scrollRaf=0;
  let settleTimer=0;

  const centerCard=(card,{smooth=true}={})=>{
    if(!card) return;
    const target=card.offsetLeft-(row.clientWidth-card.offsetWidth)/2;
    row.scrollTo({left:Math.max(0,target),behavior:smooth?'smooth':'auto'});
  };

  const setActiveCard=(card,{center=false,smooth=true}={})=>{
    if(!card||card===activeCard && !center) return;
    cards.forEach(item=>{
      const active=item===card;
      item.classList.toggle('is-mobile-active',active);
      item.setAttribute('aria-current',active?'true':'false');
    });
    activeCard=card;
    if(center) centerCard(card,{smooth});
    warmReelMedia(card.querySelector('.reel-device-video'),{aggressive:true});
  };

  const nearestToCenter=()=>{
    const bounds=row.getBoundingClientRect();
    const cx=bounds.left+bounds.width/2;
    let winner=activeCard;
    let best=Infinity;
    cards.forEach(card=>{
      const rect=card.getBoundingClientRect();
      const distance=Math.abs((rect.left+rect.width/2)-cx);
      if(distance<best){best=distance;winner=card}
    });
    return winner;
  };

  cards.forEach(card=>{
    card.tabIndex=0;
    card.addEventListener('click',event=>{
      if(event.target.closest('.reel-play')) return;
      setActiveCard(card,{center:true,smooth:true});
    });
    card.addEventListener('focusin',()=>setActiveCard(card,{center:true,smooth:true}));
  });

  row.addEventListener('scroll',()=>{
    if(scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf=requestAnimationFrame(()=>{
      const nearest=nearestToCenter();
      if(nearest!==activeCard) setActiveCard(nearest,{center:false});
    });
    clearTimeout(settleTimer);
    settleTimer=setTimeout(()=>centerCard(activeCard,{smooth:!lowPowerMode}),lowPowerMode?180:130);
  },{passive:true});

  // Evita que un swipe horizontal dentro del deck intente cambiar de escena.
  row.addEventListener('touchstart',event=>event.stopPropagation(),{passive:true});
  row.addEventListener('touchmove',event=>event.stopPropagation(),{passive:true});
  row.addEventListener('touchend',event=>event.stopPropagation(),{passive:true});

  // Estado inicial: reel central activo, pero todos siguen visibles y navegables.
  cards.forEach(card=>card.classList.remove('is-mobile-active'));
  setActiveCard(activeCard,{center:false});
  requestAnimationFrame(()=>requestAnimationFrame(()=>centerCard(activeCard,{smooth:false})));

  const v29BaseUpdateInterface=updateInterface;
  updateInterface=function(){
    v29BaseUpdateInterface();
    if(currentScene===3){
      requestAnimationFrame(()=>centerCard(activeCard,{smooth:false}));
    }
  };
})();



/* =========================================================
   V33 — AUDIO AMBIENTE / SOUND ON POR DEFECTO
========================================================= */
(function initPortfolioSound(){
  const audio=document.getElementById('ambientMusic');
  const control=document.getElementById('soundControl');
  const stateLabel=document.getElementById('soundControlState');
  if(!audio||!control||!stateLabel)return;

  const SOUND_VOLUME=mobileMode ? .20 : .24;
  const DUCK_VOLUME=.035;
  let soundWanted=true;          // Cada carga nueva inicia con intención ON.
  let unlocked=false;
  let fadeRaf=0;
  let retryTimer=0;
  let ducked=false;

  audio.muted=false;
  audio.defaultMuted=false;
  audio.volume=0;
  audio.loop=true;
  audio.autoplay=true;
  audio.preload='auto';
  audio.playsInline=true;

  const clamp=value=>Math.max(0,Math.min(1,value));
  function cancelFade(){if(fadeRaf)cancelAnimationFrame(fadeRaf);fadeRaf=0}
  function fadeTo(target,duration=760,onDone){
    cancelFade();
    target=clamp(target);
    const from=Number.isFinite(audio.volume)?audio.volume:0;
    const started=performance.now();
    const tick=now=>{
      const p=Math.min(1,(now-started)/Math.max(1,duration));
      const eased=1-Math.pow(1-p,3);
      audio.volume=clamp(from+(target-from)*eased);
      if(p<1)fadeRaf=requestAnimationFrame(tick);
      else{fadeRaf=0;onDone?.()}
    };
    fadeRaf=requestAnimationFrame(tick);
  }
  function renderSoundUI(){
    const actuallyPlaying=!audio.paused&&!audio.ended&&audio.readyState>=2;
    control.classList.toggle('is-off',!soundWanted);
    control.classList.toggle('is-on',soundWanted);
    control.classList.toggle('is-waiting',soundWanted&&!actuallyPlaying);
    control.setAttribute('aria-pressed',String(soundWanted));
    control.setAttribute('aria-label',soundWanted?'Apagar música de fondo':'Activar música de fondo');
    // La intención es ON desde el inicio. No mostramos READY/OFF cuando
    // el navegador simplemente está esperando el primer gesto permitido.
    stateLabel.textContent=soundWanted?'ON':'OFF';
  }
  function desiredVolume(){return ducked?DUCK_VOLUME:SOUND_VOLUME}
  async function startSound({gesture=false}={}){
    if(!soundWanted)return false;
    window.clearTimeout(retryTimer);
    try{
      audio.muted=false;
      const promise=audio.play();
      if(promise&&typeof promise.then==='function')await promise;
      unlocked=true;
      fadeTo(desiredVolume(),gesture?620:1100);
      renderSoundUI();
      return true;
    }catch(error){
      // Autoplay audible puede ser bloqueado por el navegador. El primer
      // pointer/touch/key en cualquier parte vuelve a ejecutar play().
      renderSoundUI();
      return false;
    }
  }
  function stopSound(){
    soundWanted=false;
    ducked=false;
    renderSoundUI();
    fadeTo(0,360,()=>audio.pause());
  }
  async function turnSoundOn(){
    soundWanted=true;
    renderSoundUI();
    await startSound({gesture:true});
  }
  control.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    soundWanted?stopSound():turnSoundOn();
  });

  // La primera interacción en CUALQUIER lugar libera el audio en Chrome,
  // Safari y navegadores móviles que bloquean autoplay audible.
  const unlockFromGesture=()=>{
    if(!soundWanted||(!audio.paused&&unlocked))return;
    startSound({gesture:true});
  };
  window.addEventListener('pointerdown',unlockFromGesture,{capture:true,passive:true});
  window.addEventListener('touchstart',unlockFromGesture,{capture:true,passive:true});
  window.addEventListener('keydown',unlockFromGesture,{capture:true,passive:true});
  window.addEventListener('click',unlockFromGesture,{capture:true,passive:true});

  // Intentos tempranos: funcionan automáticamente cuando el navegador ya
  // autoriza sonido para el sitio. Si no, quedan listos para el primer gesto.
  renderSoundUI();
  startSound();
  retryTimer=window.setTimeout(()=>{if(soundWanted&&audio.paused)startSound()},500);
  window.addEventListener('pageshow',()=>{if(soundWanted&&audio.paused)startSound()},{passive:true});

  audio.addEventListener('playing',()=>{
    unlocked=true;
    fadeTo(desiredVolume(),audio.volume<.02?850:260);
    renderSoundUI();
  });
  audio.addEventListener('pause',renderSoundUI);
  audio.addEventListener('canplay',()=>{if(soundWanted&&audio.paused)startSound()},{once:true});
  audio.addEventListener('error',()=>{
    console.warn('No se pudo cargar la música ambiente desde el servidor remoto.');
    renderSoundUI();
  });

  // Si un reel reproduce su propio audio, la música ambiente baja de nivel
  // automáticamente y vuelve con un fade al cerrar/pausar el reel.
  if(typeof reelViewerVideo!=='undefined'&&reelViewerVideo){
    const duck=()=>{
      if(!soundWanted||audio.paused)return;
      ducked=true;
      fadeTo(DUCK_VOLUME,260);
    };
    const restore=()=>{
      if(!soundWanted)return;
      ducked=false;
      if(!audio.paused)fadeTo(SOUND_VOLUME,520);
    };
    reelViewerVideo.addEventListener('playing',duck);
    reelViewerVideo.addEventListener('pause',restore);
    reelViewerVideo.addEventListener('ended',restore);
    reelViewerVideo.addEventListener('error',restore);
  }

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    if(soundWanted&&audio.paused)startSound();
  });
})();
