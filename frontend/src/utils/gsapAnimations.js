import gsap from 'gsap';

// 1. Smooth Page Entrance Animation
export const animatePageIn = (element) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { opacity: 0, y: 20, scale: 0.985 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.45,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
    }
  );
};

// 2. Smooth Tab Crossfade Transition
export const animateTabChange = (containerElement, onSwitchComplete) => {
  if (!containerElement) {
    if (onSwitchComplete) onSwitchComplete();
    return;
  }

  gsap.to(containerElement, {
    opacity: 0,
    y: -10,
    scale: 0.985,
    duration: 0.18,
    ease: 'power2.in',
    onComplete: () => {
      if (onSwitchComplete) onSwitchComplete();
      gsap.fromTo(
        containerElement,
        { opacity: 0, y: 12, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.38,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        }
      );
    },
  });
};

// 3. Staggered Card Grid Entrance
export const animateCardsStagger = (cardsContainer) => {
  if (!cardsContainer) return;
  const cards = cardsContainer.children;
  if (!cards || cards.length === 0) return;

  gsap.fromTo(
    cards,
    { opacity: 0, y: 25, scale: 0.96 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      stagger: 0.06,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
    }
  );
};

// 4. Smooth Result Reveal
export const animateResultReveal = (element) => {
  if (!element) return;
  gsap.fromTo(
    element,
    { opacity: 0, y: 20, height: 0, scale: 0.97 },
    {
      opacity: 1,
      y: 0,
      height: 'auto',
      scale: 1,
      duration: 0.5,
      ease: 'power3.out',
      clearProps: 'height',
    }
  );
};

// 5. GSAP Modal Open
export const animateModalOpen = (modalNode, backdropNode) => {
  if (!modalNode || !backdropNode) return;

  gsap.fromTo(
    backdropNode,
    { opacity: 0 },
    { opacity: 1, duration: 0.25, ease: 'power2.out' }
  );

  gsap.fromTo(
    modalNode,
    { opacity: 0, scale: 0.9, y: 30 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.4,
      ease: 'back.out(1.4)',
      clearProps: 'transform,opacity',
    }
  );
};

// 6. GSAP Modal Close
export const animateModalClose = (modalNode, backdropNode, onComplete) => {
  if (!modalNode || !backdropNode) {
    if (onComplete) onComplete();
    return;
  }

  const tl = gsap.timeline({
    onComplete: () => {
      if (onComplete) onComplete();
    },
  });

  tl.to(modalNode, {
    opacity: 0,
    scale: 0.92,
    y: 15,
    duration: 0.2,
    ease: 'power2.in',
  }).to(
    backdropNode,
    {
      opacity: 0,
      duration: 0.18,
      ease: 'power2.in',
    },
    '-=0.1'
  );
};

// 7. Button Hover Micro-Interactions
export const handleButtonHover = (e) => {
  const target = e.currentTarget;
  if (!target) return;
  gsap.to(target, {
    scale: 1.025,
    y: -1.5,
    duration: 0.2,
    ease: 'power2.out',
  });
};

export const handleButtonLeave = (e) => {
  const target = e.currentTarget;
  if (!target) return;
  gsap.to(target, {
    scale: 1,
    y: 0,
    duration: 0.2,
    ease: 'power2.out',
  });
};

export const handleButtonPress = (e) => {
  const target = e.currentTarget;
  if (!target) return;
  gsap.to(target, {
    scale: 0.96,
    duration: 0.1,
    ease: 'power1.inOut',
    onComplete: () => {
      gsap.to(target, { scale: 1.025, duration: 0.15, ease: 'power2.out' });
    },
  });
};

// 8. Gauge Needle Elastic Rotation
export const animateGaugeNeedle = (needleNode, rotationAngle) => {
  if (!needleNode) return;
  gsap.to(needleNode, {
    rotation: rotationAngle,
    transformOrigin: '100px 100px',
    duration: 1.2,
    ease: 'elastic.out(1, 0.5)',
  });
};

// 9. Horizontal Progress Bar Fill
export const animateProgressBar = (barNode, widthPct) => {
  if (!barNode) return;
  gsap.fromTo(
    barNode,
    { width: '0%' },
    {
      width: `${widthPct}%`,
      duration: 0.8,
      ease: 'power3.out',
    }
  );
};
