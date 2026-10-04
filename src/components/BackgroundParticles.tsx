import { useEffect, useRef } from "react";

/** Decorative red dust; this canvas never represents commercial activity. */
export default function BackgroundParticles({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0,
      height = 0,
      frame = 0,
      last = 0;
    let particles: {
      x: number;
      y: number;
      radius: number;
      speed: number;
      alpha: number;
      phase: number;
    }[] = [];
    const draw = (elapsed: number, time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        particle.y -= elapsed * particle.speed;
        particle.x += elapsed * Math.sin(particle.phase + time * 0.00018) * 4;
        if (particle.y < -10) particle.y = height + 10;
        const shimmer =
          paused || reduced.matches
            ? 1
            : 0.78 + Math.sin(time * 0.001 + particle.phase) * 0.22;
        ctx.fillStyle = `rgba(255, 0, 55, ${particle.alpha * shimmer})`;
        ctx.shadowColor = "#ff003b";
        ctx.shadowBlur = particle.radius > 1.3 ? 13 : 5;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
        if (particle.radius > 1.8) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = `rgba(255, 0, 55, ${particle.alpha * 0.22})`;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y + 3);
          ctx.lineTo(particle.x - 2, particle.y + 15);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    };
    const animate = (time: number) => {
      if (time - last >= 33) {
        draw(Math.min((time - last) / 1000, 0.06), time);
        last = time;
      }
      frame = requestAnimationFrame(animate);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      if (!paused && !reduced.matches && document.visibilityState === "visible")
        frame = requestAnimationFrame(animate);
      else draw(0, last);
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: width < 600 ? 22 : 62 }, (_, i) => ({
        x: (((i * 197.3) % 997) / 997) * width,
        y: (((i * 337.7) % 991) / 991) * height,
        radius: 0.6 + (i % 5) * 0.35,
        speed: 5 + (i % 9),
        alpha: 0.2 + (i % 5) * 0.085,
        phase: i * 1.83,
      }));
      draw(0, performance.now());
    };
    resize();
    schedule();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, [paused]);
  return (
    <canvas className="background-particles" ref={canvas} aria-hidden="true" />
  );
}
