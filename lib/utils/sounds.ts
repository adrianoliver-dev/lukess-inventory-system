// Utility functions to generate sounds using Web Audio API

export function playBeep() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Beep sound configuration
    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.1
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Audio fallback silently
  }
}

export function playSuccessSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Play a pleasant two-tone success sound
    const playTone = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        startTime + duration
      );

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    // Two ascending tones for success
    playTone(523.25, audioContext.currentTime, 0.15); // C5
    playTone(659.25, audioContext.currentTime + 0.15, 0.2); // E5
  } catch (error) {
    // Audio fallback silently
  }
}

export function playCashRegisterSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Simulate cash register "cha-ching" sound
    const playTone = (frequency: number, startTime: number, duration: number, volume: number = 0.3) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "triangle";

      gainNode.gain.setValueAtTime(volume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        startTime + duration
      );

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;

    // "Cha" part
    playTone(800, now, 0.08, 0.4);
    playTone(600, now + 0.02, 0.08, 0.3);

    // "Ching" part
    playTone(1200, now + 0.12, 0.15, 0.35);
    playTone(1000, now + 0.14, 0.15, 0.25);
    playTone(1400, now + 0.16, 0.2, 0.2);
  } catch (error) {
    // Audio fallback silently
  }
}
