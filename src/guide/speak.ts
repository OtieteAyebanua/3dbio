/** Reads text aloud with the browser's built-in voices (no extra service needed). */

/** Prefer a natural-sounding English voice when the system has one. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return (
    voices.find((v) => /premium|enhanced|natural/i.test(v.name)) ??
    voices.find((v) => /samantha|daniel|karen|google us english/i.test(v.name)) ??
    voices[0]
  );
}

export function speak(text: string): void {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
