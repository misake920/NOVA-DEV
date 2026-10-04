import { useEffect, useRef } from 'react';
export default function BackgroundParticles({paused}:{paused:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null),stop=useRef(paused);
  useEffect(()=>{stop.current=paused;},[paused]);
  useEffect(()=>{const el=canvas.current;if(!el)return;const context=el.getContext('2d');if(!context)return;let width=0,height=0,frame=0,last=0,visible=document.visibilityState==='visible';const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');let dots:{x:number;y:number;r:number;speed:number;alpha:number}[]=[];
    const resize=()=>{width=window.innerWidth;height=window.innerHeight;const ratio=Math.min(window.devicePixelRatio,1.5);el.width=width*ratio;el.height=height*ratio;context.setTransform(ratio,0,0,ratio,0,0);dots=Array.from({length:width<600?18:44},(_,i)=>({x:((i*197.3)%997)/997*width,y:((i*337.7)%991)/991*height,r:.7+(i%3)*.55,speed:4+i%6,alpha:.12+(i%5)*.04}));draw(0);};
    const draw=(dt:number)=>{context.clearRect(0,0,width,height);for(const dot of dots){if(!stop.current&&!reduce.matches){dot.y-=dot.speed*dt;dot.x+=Math.sin(dot.y*.003)*dt*2;if(dot.y<0)dot.y=height;}context.beginPath();context.fillStyle='rgba(255,16,45,'+dot.alpha+')';context.shadowBlur=6;context.shadowColor='#ff102d';context.arc(dot.x,dot.y,dot.r,0,Math.PI*2);context.fill();}};
    const animate=(time:number)=>{frame=requestAnimationFrame(animate);if(!visible||time-last<40)return;const dt=Math.min((time-last)/1000,.08);last=time;if(!stop.current&&!reduce.matches)draw(dt);};
    const visibility=()=>{visible=document.visibilityState==='visible';last=performance.now();};resize();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);frame=requestAnimationFrame(animate);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return <canvas className="background-particles" ref={canvas} aria-hidden="true"/>;
}
