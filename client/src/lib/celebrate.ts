import confetti from "canvas-confetti";

export function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cs = getComputedStyle(document.documentElement);
  const colors = ["--accent", "--m0", "--m1", "--m2"].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
  void confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.75 }, colors, disableForReducedMotion: true });
}
