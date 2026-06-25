const staffNotificationSoundRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);

let audioContext = null;

const audioContextForPage = () => {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextClass();
  }
  return audioContext;
};

export const isStaffNotificationUser = (user) => (
  staffNotificationSoundRoles.has(user?.role)
  || staffNotificationSoundRoles.has(user?.admin_role)
  || user?.is_admin === true
);

export const unlockNotificationSound = () => {
  const context = audioContextForPage();
  if (context?.state === "suspended") {
    context.resume().catch(() => {});
  }
};

export const playStaffNotificationSound = () => {
  const context = audioContextForPage();
  if (!context) return;

  try {
    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1175, now + 0.11);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    // Browser audio policies can block playback until the user interacts with the page.
  }
};
