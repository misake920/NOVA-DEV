import { useEffect, useRef } from "react";
import gsap from "gsap";
import "./cursor-glow.css";

/** Decorative pointer light. The native cursor and every target stay usable. */
export default function CursorGlow({ paused }: { paused: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const aura = auraRef.current;
    const pointer = pointerRef.current;
    if (!root || !aura || !pointer) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposeMotion = () => {};

    const configure = () => {
      disposeMotion();
      root.style.visibility = "hidden";
      root.style.opacity = "0";
      if (paused || !finePointer.matches || reducedMotion.matches) {
        root.style.display = "none";
        return;
      }
      root.style.display = "block";
      let visible = false;
      let removeListeners = () => {};
      const context = gsap.context(() => {
        gsap.set([aura, pointer], { xPercent: -50, yPercent: -50 });
        const auraX = gsap.quickTo(aura, "x", {
          duration: 0.48,
          ease: "power3.out",
        });
        const auraY = gsap.quickTo(aura, "y", {
          duration: 0.48,
          ease: "power3.out",
        });
        const pointerX = gsap.quickTo(pointer, "x", {
          duration: 0.12,
          ease: "power2.out",
        });
        const pointerY = gsap.quickTo(pointer, "y", {
          duration: 0.12,
          ease: "power2.out",
        });
        const show = () => {
          if (visible) return;
          visible = true;
          gsap.to(root, { autoAlpha: 1, duration: 0.28, overwrite: true });
        };
        const hide = () => {
          visible = false;
          gsap.to(root, { autoAlpha: 0, duration: 0.22, overwrite: true });
        };
        const move = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          if (!visible)
            gsap.set([aura, pointer], { x: event.clientX, y: event.clientY });
          auraX(event.clientX);
          auraY(event.clientY);
          pointerX(event.clientX);
          pointerY(event.clientY);
          show();
        };
        const hover = (event: PointerEvent) => {
          const target = event.target;
          root.dataset.interactive =
            target instanceof Element &&
            target.closest(
              'a, button, input, textarea, select, [role="button"], summary',
            )
              ? "true"
              : "false";
        };
        const press = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          gsap.fromTo(
            pointer,
            { scale: 0.78 },
            { scale: 1, duration: 0.3, ease: "power2.out", overwrite: true },
          );
        };
        const leave = (event: PointerEvent) => {
          if (!event.relatedTarget) hide();
        };
        const visibility = () => {
          if (document.hidden) hide();
        };
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerover", hover, { passive: true });
        window.addEventListener("pointerdown", press, { passive: true });
        window.addEventListener("pointerout", leave, { passive: true });
        window.addEventListener("blur", hide);
        document.addEventListener("visibilitychange", visibility);
        removeListeners = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerover", hover);
          window.removeEventListener("pointerdown", press);
          window.removeEventListener("pointerout", leave);
          window.removeEventListener("blur", hide);
          document.removeEventListener("visibilitychange", visibility);
          // quickTo reuses a tween; dispose these even after its event callback runs.
          auraX.tween.kill();
          auraY.tween.kill();
          pointerX.tween.kill();
          pointerY.tween.kill();
          gsap.killTweensOf([root, aura, pointer]);
        };
      });
      disposeMotion = () => {
        removeListeners();
        context.revert();
      };
    };

    configure();
    finePointer.addEventListener("change", configure);
    reducedMotion.addEventListener("change", configure);
    return () => {
      disposeMotion();
      finePointer.removeEventListener("change", configure);
      reducedMotion.removeEventListener("change", configure);
    };
  }, [paused]);

  return (
    <div ref={rootRef} className="ghost-cursor-glow" aria-hidden="true">
      <div ref={auraRef} className="ghost-cursor-aura" />
      <div ref={pointerRef} className="ghost-cursor-point">
        <span className="ghost-cursor-ring" />
        <span className="ghost-cursor-core" />
        <span className="ghost-cursor-cross ghost-cursor-cross-x" />
        <span className="ghost-cursor-cross ghost-cursor-cross-y" />
      </div>
    </div>
  );
}
