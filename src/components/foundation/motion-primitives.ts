import { Variants } from "motion/react";

/* ======================================================================
   Slipwise Motion Primitives — Phase 7 Polish
   Restrained, premium motion for shell and shared interactions.
   ====================================================================== */

const easeOut = [0.16, 1, 0.3, 1];
const easeInOut = [0.4, 0, 0.2, 1];
const easeSpring = { type: "spring", stiffness: 400, damping: 30 } as const;

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: easeInOut } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, y: 4, transition: { duration: 0.15, ease: easeInOut } },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: easeInOut } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.22, ease: easeOut },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: 0.14, ease: easeInOut },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, x: 4, transition: { duration: 0.15, ease: easeInOut } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, x: -4, transition: { duration: 0.15, ease: easeInOut } },
};

export const panelAppear: Variants = {
  hidden: { opacity: 0, y: -8, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.25, ease: easeOut },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.99,
    transition: { duration: 0.15, ease: easeInOut },
  },
};

export const drawerSlide: Variants = {
  hidden: { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: easeOut } },
  exit: { opacity: 0, x: "100%", transition: { duration: 0.2, ease: easeInOut } },
};

export const backdropFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: easeOut } },
};

export const listStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.02, delayChildren: 0.02 },
  },
};

export const listStaggerItem: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.18, ease: easeOut } },
};

export const hoverScale = {
  scale: 1.02,
  transition: { duration: 0.2, ease: easeOut },
};

export const tapScale = {
  scale: 0.97,
  transition: { duration: 0.1 },
};

export const hoverLift = {
  y: -2,
  transition: { duration: 0.2, ease: easeOut },
};

export const pressDown = {
  scale: 0.98,
  transition: { duration: 0.08 },
};

/* Smooth scroll-to-top helper for route changes */
export function smoothScrollToTop() {
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
