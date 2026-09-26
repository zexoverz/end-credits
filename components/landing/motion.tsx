"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MOTION as M } from "@/lib/copy/motion";
import m from "@/app/landing/motion.module.css";

const MotionContext = createContext({
  enabled: false,
  paused: false,
  reduced: false,
  toggle: () => {},
});
const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(callback: () => void) {
  const media = window.matchMedia(reducedQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getReduced = () => window.matchMedia(reducedQuery).matches;
const serverReduced = () => true;
export function usePageMotion() {
  return useContext(MotionContext);
}

export function LandingMotion({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    getReduced,
    serverReduced,
  );
  const enabled = !paused && !reduced;
  useEffect(() => {
    const node = root.current;
    if (!node || !enabled) return;
    const animations = new Set<Animation>();
    let scrollFrame = 0;
    let pointerFrame = 0;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const hero = node.querySelector<HTMLElement>("[data-hero-scene]");
    const zones = node.querySelectorAll<HTMLElement>("[data-motion-zone]");
    const reveals = node.querySelectorAll<HTMLElement>("[data-reveal]");
    const reveal = (element: HTMLElement) => {
      if (element.dataset.revealed) return;
      element.dataset.revealed = "true";
      const headline = element.dataset.reveal === "headline";
      const animation = element.animate(
        [
          {
            opacity: 0,
            transform: `translateY(${headline ? 24 : 18}px)`,
            ...(headline ? { clipPath: "inset(0 0 100% 0)" } : {}),
          },
          {
            opacity: 1,
            transform: "translateY(0)",
            ...(headline ? { clipPath: "inset(0 0 0% 0)" } : {}),
          },
        ],
        {
          duration: headline ? 850 : 650,
          delay: Number(element.dataset.delay ?? 0),
          easing: "cubic-bezier(.2,.7,.2,1)",
          fill: "backwards",
        },
      );
      animations.add(animation);
      animation.onfinish = () => {
        animations.delete(animation);
        animation.cancel();
      };
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (element.hasAttribute("data-motion-zone")) {
            element.dataset.inView = String(entry.isIntersecting);
            if (entry.isIntersecting) element.dataset.seen = "true";
          }
          if (entry.isIntersecting && element.hasAttribute("data-reveal"))
            reveal(element);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -20px 0px" },
    );
    zones.forEach((element) => observer.observe(element));
    reveals.forEach((element) => observer.observe(element));
    const updateScroll = () => {
      scrollFrame = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      node.style.setProperty(
        "--reading-progress",
        String(total > 0 ? Math.min(1, window.scrollY / total) : 0),
      );
      if (hero?.dataset.inView === "true")
        hero.style.setProperty(
          "--scene-scroll",
          `${Math.min(20, window.scrollY * 0.045)}px`,
        );
    };
    const scroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };
    const resetPointer = () => {
      hero?.style.setProperty("--pointer-x", "0px");
      hero?.style.setProperty("--pointer-y", "0px");
    };
    const pointer = (event: PointerEvent) => {
      if (!hero || !fine.matches || pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const bounds = hero.getBoundingClientRect();
        hero.style.setProperty(
          "--pointer-x",
          `${Math.max(-8, Math.min(8, ((event.clientX - bounds.left) / bounds.width - 0.5) * 16))}px`,
        );
        hero.style.setProperty(
          "--pointer-y",
          `${Math.max(-6, Math.min(6, ((event.clientY - bounds.top) / bounds.height - 0.5) * 12))}px`,
        );
      });
    };
    const visibility = () => {
      node.dataset.suspended = String(document.hidden);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    document.addEventListener("visibilitychange", visibility);
    hero?.addEventListener("pointermove", pointer);
    hero?.addEventListener("pointerleave", resetPointer);
    updateScroll();
    visibility();
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(pointerFrame);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      document.removeEventListener("visibilitychange", visibility);
      hero?.removeEventListener("pointermove", pointer);
      hero?.removeEventListener("pointerleave", resetPointer);
      resetPointer();
      hero?.style.setProperty("--scene-scroll", "0px");
    };
  }, [enabled]);
  return (
    <MotionContext.Provider
      value={{
        enabled,
        paused,
        reduced,
        toggle: () => setPaused((value) => !value),
      }}
    >
      <div
        ref={root}
        id="top"
        className={`${className} ${m.motionSite}`}
        data-page-motion={enabled ? "on" : "off"}
      >
        <div className={m.progress} aria-hidden="true" />
        {children}
      </div>
    </MotionContext.Provider>
  );
}
export function MotionToggle() {
  const { enabled, reduced, toggle } = usePageMotion();
  return (
    <button
      type="button"
      className={m.toggle}
      onClick={toggle}
      disabled={reduced}
      aria-pressed={enabled}
      title={reduced ? M.preference : undefined}
    >
      <span aria-hidden="true">{enabled ? "Ⅱ" : "▷"}</span>
      {reduced ? M.reduced : enabled ? M.pause : M.play}
    </button>
  );
}
