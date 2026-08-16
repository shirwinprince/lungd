import React, { useRef, useEffect } from 'react';
import {
  animatePageIn,
  animateCardsStagger,
  animateModalOpen,
  animateModalClose,
  handleButtonHover,
  handleButtonLeave,
  handleButtonPress,
  animateResultReveal,
} from '../utils/gsapAnimations';

// 1. GSAP Page Entrance Wrapper
export const GsapPage = ({ children, className = "" }) => {
  const pageRef = useRef(null);

  useEffect(() => {
    if (pageRef.current) {
      animatePageIn(pageRef.current);
    }
  }, []);

  return (
    <div ref={pageRef} className={className}>
      {children}
    </div>
  );
};

// 2. GSAP Staggered Card Grid Wrapper
export const GsapStaggerCards = ({ children, className = "", keyTrigger }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      animateCardsStagger(containerRef.current);
    }
  }, [keyTrigger]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};

// 3. GSAP Result Reveal Wrapper
export const GsapReveal = ({ children, className = "" }) => {
  const revealRef = useRef(null);

  useEffect(() => {
    if (revealRef.current) {
      animateResultReveal(revealRef.current);
    }
  }, []);

  return (
    <div ref={revealRef} className={className}>
      {children}
    </div>
  );
};

// 4. GSAP Interactive Button
export const GsapButton = ({
  children,
  onClick,
  className = "",
  disabled = false,
  type = "button",
  style = {},
}) => {
  const buttonRef = useRef(null);

  return (
    <button
      ref={buttonRef}
      type={type}
      disabled={disabled}
      onClick={(e) => {
        if (!disabled) {
          handleButtonPress(e);
          if (onClick) onClick(e);
        }
      }}
      onMouseEnter={(e) => !disabled && handleButtonHover(e)}
      onMouseLeave={(e) => !disabled && handleButtonLeave(e)}
      style={style}
      className={className}
    >
      {children}
    </button>
  );
};

// 5. GSAP Animated Modal Overlay
export const GsapModal = ({ isOpen, onClose, children }) => {
  const backdropRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && modalRef.current && backdropRef.current) {
      animateModalOpen(modalRef.current, backdropRef.current);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (modalRef.current && backdropRef.current) {
      animateModalClose(modalRef.current, backdropRef.current, onClose);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Window */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-3xl bg-cyber-card border border-cyber-border rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {children}
      </div>
    </div>
  );
};
