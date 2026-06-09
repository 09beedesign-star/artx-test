import { useEffect, useState } from "react";

const TYPE_DURATION_MS = 5000;
const PAUSE_DURATION_MS = 3000;
const FRAME_MS = 80;

export default function useTypingPlaceholder(text: string) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (!text) {
      setDisplayedText("");
      return;
    }

    const characters = Array.from(text);
    const cycleDuration = TYPE_DURATION_MS + PAUSE_DURATION_MS;
    const startedAt = Date.now();

    const update = () => {
      const elapsed = (Date.now() - startedAt) % cycleDuration;
      if (elapsed >= TYPE_DURATION_MS) {
        setDisplayedText(text);
        return;
      }

      const visibleCount = Math.floor((elapsed / TYPE_DURATION_MS) * characters.length);
      setDisplayedText(characters.slice(0, visibleCount).join(""));
    };

    update();
    const intervalId = window.setInterval(update, FRAME_MS);
    return () => window.clearInterval(intervalId);
  }, [text]);

  return displayedText;
}
