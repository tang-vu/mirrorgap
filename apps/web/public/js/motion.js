// GSAP is served locally from /vendor. DOM labels remain the source of truth.
export const motionReady = () =>
  Boolean(window.gsap && window.ScrollTrigger && !matchMedia("(prefers-reduced-motion: reduce)").matches);

export function openingMotion(root) {
  if (!motionReady()) return () => {};
  const gsap = window.gsap;
  const rail = root.querySelector(".apparatus-rail");
  if (!rail) return () => {};
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.from(rail, { scaleX: 0, transformOrigin: "left center", duration: 0.35 }, 0)
    .from(root.querySelector(".apparatus-plane"), { opacity: 0, y: 24, duration: 0.35 }, 0)
    .from(
      root.querySelectorAll(".apparatus-plate"),
      { opacity: 0, rotationY: -48, x: -45, stagger: 0.13, duration: 0.75 },
      0.2,
    )
    .fromTo(
      root.querySelector(".apparatus-beam"),
      { xPercent: -55, opacity: 0 },
      { xPercent: 90, opacity: 0.9, duration: 0.75 },
      0.7,
    )
    .from(
      root.querySelectorAll(".apparatus-mark"),
      { opacity: 0, scale: 0.5, stagger: 0.07, duration: 0.3 },
      0.8,
    )
    .from(root.querySelector(".apparatus-carriage"), { opacity: 0, y: -45, duration: 0.55 }, 1.2)
    .from(root.querySelector(".bench-inspector"), { opacity: 0, y: 20, duration: 0.5 }, 1.4);
  let visible = true;
  const update = () => (visible && !document.hidden ? tl.resume() : tl.pause());
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
  });
  observer.observe(root);
  document.addEventListener("visibilitychange", update);
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", update);
    root.querySelector(".apparatus-carriage")?.__moveTween?.kill();
    tl.kill();
  };
}

export function moveCarriage(root, left) {
  const carriage = root.querySelector(".apparatus-carriage");
  if (!carriage) return;
  if (motionReady()) {
    carriage.__moveTween?.kill();
    carriage.__moveTween = window.gsap.to(carriage, {
      left: `${left}%`,
      duration: 0.65,
      ease: "power3.inOut",
      overwrite: true,
    });
  } else carriage.style.left = `${left}%`;
}

export function journeyMotion(root) {
  if (!motionReady()) return () => {};
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  const stage = root.querySelector(".story-stage");
  const layout = root.querySelector(".journey-layout");
  if (!stage || !layout) return () => {};
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: layout,
      start: "top 18%",
      end: "bottom 82%",
      scrub: 0.35,
      invalidateOnRefresh: true,
    },
  });
  tl.to(stage.querySelector(".story-bracket"), { scaleX: 0.37, duration: 1 }, 0)
    .to(stage.querySelector(".story-specimen"), { rotationY: 0, xPercent: -14, duration: 1 }, 0)
    .to(stage.querySelector(".story-beam"), { xPercent: 190, opacity: 0, duration: 1 }, 0)
    .to(stage.querySelector(".story-measure"), { opacity: 1, y: 0, duration: 0.4 }, 0.7)
    .to(stage.querySelector(".story-specimen"), { xPercent: -27, rotationY: 14, duration: 1 }, 1)
    .to(stage.querySelectorAll(".story-slip"), { opacity: 1, x: 0, stagger: 0.12, duration: 0.8 }, 1.2)
    .to(stage.querySelectorAll(".story-link"), { strokeDashoffset: 0, stagger: 0.08, duration: 0.8 }, 1.4)
    .to(stage.querySelector(".story-dossier"), { opacity: 1, y: 0, duration: 1 }, 2.05)
    .to(stage.querySelectorAll(".story-slip"), { y: -18, duration: 0.7 }, 2.2)
    .to(stage.querySelector(".story-specimen"), { scale: 0.78, xPercent: -42, duration: 0.8 }, 2.2);
  const nav = root.querySelectorAll("[data-chapter]");
  const sections = root.querySelectorAll(".journey-chapter");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting)
          nav.forEach((button) =>
            button.setAttribute(
              "aria-current",
              String(button.dataset.chapter === entry.target.dataset.index),
            ),
          );
    },
    { rootMargin: "-30% 0px -45% 0px" },
  );
  sections.forEach((section) => observer.observe(section));
  return () => {
    tl.scrollTrigger?.kill();
    tl.kill();
    observer.disconnect();
  };
}

export function sealMotion(root) {
  const sheet = root.querySelector(".seal-sheet");
  if (!sheet) return { pending() {}, result() {}, reset() {}, dispose() {} };
  let timeline;
  let stampTween;
  let offsetTween;
  const stop = () => {
    timeline?.kill();
    stampTween?.kill();
    offsetTween?.kill();
    timeline = null;
    stampTween = null;
    offsetTween = null;
  };
  const pending = () => {
    sheet.dataset.state = "pending";
    if (!motionReady()) return;
    stop();
    window.gsap.set(root.querySelectorAll(".seal-connection"), { strokeDashoffset: 500 });
    window.gsap.set(root.querySelector(".seal-lens"), { xPercent: 0 });
    timeline = window.gsap.timeline();
    timeline
      .to(root.querySelectorAll(".seal-connection"), { strokeDashoffset: 0, duration: 0.4, stagger: 0.08 })
      .to(root.querySelector(".seal-lens"), { xPercent: 290, duration: 0.8, ease: "power1.inOut" }, 0);
  };
  const result = (ok) => {
    sheet.dataset.state = ok ? "passed" : "failed";
    if (motionReady()) {
      stampTween = window.gsap.fromTo(
        root.querySelector(".seal-stamp"),
        { scale: 1.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4 },
      );
      if (!ok)
        offsetTween = window.gsap.to(root.querySelector(".seal-altered"), {
          x: 26,
          rotation: 3,
          duration: 0.4,
        });
    }
  };
  const reset = () => {
    stop();
    sheet.dataset.state = "ready";
    window.gsap?.set(root.querySelector(".seal-altered"), { clearProps: "transform" });
    window.gsap?.set(root.querySelector(".seal-lens"), { clearProps: "transform" });
    window.gsap?.set(root.querySelectorAll(".seal-connection"), { clearProps: "strokeDashoffset" });
  };
  return { pending, result, reset, dispose: stop };
}
