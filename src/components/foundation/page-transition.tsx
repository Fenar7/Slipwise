"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeInUp } from "@/components/foundation/motion-primitives";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}
