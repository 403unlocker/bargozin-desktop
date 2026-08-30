import { useEffect, useState, type RefObject } from "react";

export function useScrollHint(
  ref: RefObject<HTMLDivElement | null>,
  deps: unknown[] = []
) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const maxScrollTop = element.scrollHeight - element.clientHeight;
      const hasOverflow = maxScrollTop > 8;
      const nearBottom = element.scrollTop >= maxScrollTop - 12;
      setShowHint(hasOverflow && !nearBottom);
    };

    update();
    element.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ref, ...deps]);

  return showHint;
}
