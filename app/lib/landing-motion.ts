"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setChest } from "@/lib/chest-hinge";

gsap.registerPlugin(ScrollTrigger);

function splitWords(el: Element) {
  const text = el.textContent || "";
  el.textContent = "";
  const words = text.split(/(\s+)/).filter(Boolean);
  const inners: HTMLElement[] = [];
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(w));
      continue;
    }
    const outer = document.createElement("span");
    outer.style.display = "inline-block";
    outer.style.overflow = "hidden";
    outer.style.verticalAlign = "bottom";
    const inner = document.createElement("span");
    inner.style.display = "inline-block";
    inner.textContent = w;
    outer.appendChild(inner);
    el.appendChild(outer);
    inners.push(inner);
  }
  return inners;
}

export function initLandingMotion(root: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return () => {};

  const ctx = gsap.context(() => {
    const h1 = root.querySelector("[data-reveal-h1]");
    if (h1) {
      gsap.from(splitWords(h1), {
        yPercent: 110,
        duration: 1,
        ease: "power4.out",
        stagger: 0.06,
        delay: 0.1,
      });
    }

    gsap.from(root.querySelectorAll("[data-hero-fade]"), {
      opacity: 0,
      y: 16,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.1,
      delay: 0.45,
    });

    gsap.from(root.querySelectorAll("[data-chest-wrap]"), {
      opacity: 0,
      y: 30,
      scale: 0.96,
      duration: 1.2,
      ease: "power3.out",
      delay: 0.3,
    });

    const hero = root.querySelector("[data-hero]");
    const chestSvg = root.querySelector<SVGSVGElement>(
      "svg[data-hero-chest], .hero svg.chest",
    );
    if (hero && chestSvg) {
      // Open early: ~first 120px of scroll, ease-out so the lid moves right away.
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "+=120",
        scrub: true,
        onUpdate: (self) => {
          const t = self.progress;
          const eased = 1 - (1 - t) * (1 - t); // power2.out
          setChest(chestSvg, 30 * eased);
        },
      });
      // Parallax still tracks the full hero exit.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom top",
            scrub: 0.2,
          },
        })
        .to(root.querySelectorAll("[data-chest-wrap]"), { y: 60, ease: "none" }, 0)
        .to(
          root.querySelectorAll("[data-hero-copy]"),
          { y: -60, opacity: 0.2, ease: "none" },
          0,
        );
    }

    root.querySelectorAll("[data-reveal-h2]").forEach((h) => {
      gsap.from(splitWords(h), {
        yPercent: 110,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.04,
        scrollTrigger: { trigger: h, start: "top 85%" },
      });
    });

    gsap.utils
      .toArray<HTMLElement>(root.querySelectorAll("[data-fade]"))
      .forEach((e) => {
        gsap.from(e, {
          opacity: 0,
          y: 24,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: e, start: "top 90%" },
        });
      });

    const attack = root.querySelector("[data-attack]");
    const termLines = root.querySelectorAll("[data-term-line]");
    if (attack && termLines.length) {
      gsap.set(termLines, { opacity: 0 });
      const at = gsap.timeline({
        scrollTrigger: {
          trigger: attack,
          start: "top top",
          end: "+=1200",
          pin: true,
          scrub: 0.4,
        },
      });
      termLines.forEach((line, i) => {
        at.to(line, { opacity: 1, duration: 0.5 }, i * 0.5);
        if (line.getAttribute("data-term-line") === "rejected") {
          at.to(
            line,
            { x: -6, duration: 0.08, yoyo: true, repeat: 3 },
            i * 0.5,
          );
          at.to(
            root.querySelectorAll("[data-term]"),
            {
              borderColor: "#FF5C61",
              duration: 0.15,
              yoyo: true,
              repeat: 1,
            },
            i * 0.5,
          );
        }
      });
    }

    root.querySelectorAll<HTMLElement>("[data-count]").forEach((e) => {
      const target = Number(e.dataset.count || 0);
      const prefix = e.dataset.prefix || "";
      const suffix = e.dataset.suffix || "";
      const o = { v: 0 };
      gsap.to(o, {
        v: target,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: e, start: "top 90%" },
        onUpdate: () => {
          e.textContent =
            prefix + Math.round(o.v).toLocaleString("en-US") + suffix;
        },
      });
    });

    const wm = root.querySelector("[data-wordmark]");
    const foot = root.querySelector("[data-footer]");
    if (wm && foot) {
      gsap.from(wm, {
        yPercent: 40,
        ease: "none",
        scrollTrigger: {
          trigger: foot,
          start: "top bottom",
          end: "bottom bottom",
          scrub: true,
        },
      });
    }
  }, root);

  return () => ctx.revert();
}
