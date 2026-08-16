import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Page entrance wrapper
export const PageTransition = ({ children, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -16 }}
    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

// Smooth container that animates its height on tab changes to prevent layout shifts
export const SmoothHeightContainer = ({ children, className = "" }) => (
  <motion.div
    layout
    transition={{ type: "spring", stiffness: 350, damping: 32 }}
    className={className}
  >
    {children}
  </motion.div>
);

// Tab view content crossfade wrapper with smooth scale and slide
export const TabTransition = ({ children, activeKey, className = "" }) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={activeKey}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.985 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

// Animated Gliding Pill for Active Tabs
export const AnimatedTabPill = ({ layoutId = "activeTabPill" }) => (
  <motion.div
    layoutId={layoutId}
    transition={{ type: "spring", stiffness: 450, damping: 35 }}
    className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 rounded-xl shadow-lg shadow-purple-500/25 -z-10"
  />
);

// Interactive Spring Button
export const AnimatedButton = ({ children, onClick, className = "", disabled = false, type = "button", style = {} }) => (
  <motion.button
    type={type}
    disabled={disabled}
    onClick={onClick}
    style={style}
    whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -1.5 }}
    whileTap={{ scale: disabled ? 1 : 0.97 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
    className={className}
  >
    {children}
  </motion.button>
);

// Interactive Spring Card
export const AnimatedCard = ({ children, className = "", onClick, style = {} }) => (
  <motion.div
    onClick={onClick}
    style={style}
    whileHover={{ y: -4, boxShadow: "0 20px 35px -10px rgba(168, 85, 247, 0.25)" }}
    transition={{ type: "spring", stiffness: 350, damping: 25 }}
    className={`transition-colors border-cyber-border ${className}`}
  >
    {children}
  </motion.div>
);

// Smooth Expandable Section (for Accordions, Results, Heatmaps)
export const ExpandableSection = ({ isOpen = true, children, className = "" }) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, height: 0, scale: 0.98 }}
        animate={{ opacity: 1, height: "auto", scale: 1 }}
        exit={{ opacity: 0, height: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`overflow-hidden ${className}`}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// Staggered list container
export const StaggerContainer = ({ children, className = "", delay = 0.05 }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: delay,
        },
      },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Staggered list item child
export const StaggerItem = ({ children, className = "" }) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 16, scale: 0.97 },
      visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Animated Modal Overlay
export const AnimatedModal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-3xl bg-cyber-card border border-cyber-border rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
