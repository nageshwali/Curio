import { useCallback } from 'react';

export function useHaptics() {
  const supportsVibration = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  // Short vibration on card snap (10-20ms)
  const vibrateCardSnap = useCallback(() => {
    if (supportsVibration) {
      navigator.vibrate(15);
    }
  }, [supportsVibration]);

  // Medium vibration on intelligence core open (30-40ms)
  const vibrateReveal = useCallback(() => {
    if (supportsVibration) {
      navigator.vibrate(35);
    }
  }, [supportsVibration]);

  // Tiny vibration on save (10ms)
  const vibrateSave = useCallback(() => {
    if (supportsVibration) {
      navigator.vibrate(10);
    }
  }, [supportsVibration]);

  // Light tap feedback
  const vibrateTap = useCallback(() => {
    if (supportsVibration) {
      navigator.vibrate(5);
    }
  }, [supportsVibration]);

  return {
    supportsVibration,
    vibrateCardSnap,
    vibrateReveal,
    vibrateSave,
    vibrateTap
  };
}
