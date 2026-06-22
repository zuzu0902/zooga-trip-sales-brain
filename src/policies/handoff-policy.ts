export function shouldRequestHumanHandoff(messageText: string): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = messageText.trim();

  if (/נציג|צוות|אנושי|בן אדם|איש צוות/i.test(text)) {
    reasons.push('explicit_human_request');
  }

  if (/לא הבנת|את לא מבינה|לא עוזר|תסכול|מעצבן/i.test(text)) {
    reasons.push('frustration_signal_detected');
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}
