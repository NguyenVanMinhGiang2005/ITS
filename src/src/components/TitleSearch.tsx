import React, { useEffect, useMemo, useState } from "react";

type Props = {
  lines: string[];          // nhiều dòng
  speedMs?: number;         // tốc độ gõ
  pauseMs?: number;         // nghỉ giữa các dòng
  loop?: boolean;           // lặp lại
  className?: string;       // style cho title
  cursorClassName?: string; // style cho con trỏ
  lineClassNames?: string[]
};

export default function TypewriterTitle({
  lines,
  speedMs = 35,
  pauseMs = 800,
  loop = true,
  className = "text-5xl font-extrabold tracking-tight",
  cursorClassName = "inline-block w-[10px] ml-1 animate-pulse",
  lineClassNames = []
}: Props) {
  const safeLines = useMemo(() => lines.filter(Boolean), [lines]);

  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [shown, setShown] = useState<string[]>(() => safeLines.map(() => ""));

  useEffect(() => {
    if (safeLines.length === 0) return;

    const currentLine = safeLines[lineIndex] ?? "";
    const doneLine = charIndex >= currentLine.length;

    const t = window.setTimeout(() => {
      if (!doneLine) {
        setShown((prev) => {
          const next = [...prev];
          next[lineIndex] = currentLine.slice(0, charIndex + 1);
          return next;
        });
        setCharIndex((c) => c + 1);
        return;
      }

      
      window.setTimeout(() => {
        const isLast = lineIndex === safeLines.length - 1;

        if (isLast) {
          if (loop) return; // dừng vòng lặp của cái title

          // reset để gõ lại từ đầu
          setShown(safeLines.map(() => ""));
          setLineIndex(0);
          setCharIndex(0);
        } else {
          setLineIndex((i) => i + 1);
          setCharIndex(0);
        }
      }, pauseMs);
    }, speedMs);

    return () => window.clearTimeout(t);
  }, [safeLines, lineIndex, charIndex, speedMs, pauseMs, loop]);

  return (
    <h1 className={className}>
        {shown.map((s, i) => (
        <div
            key={i}
            className={["whitespace-pre-wrap", lineClassNames?.[i] ?? ""].join(" ")}
        >
            {s}
            {i === lineIndex && <span className={cursorClassName}>|</span>}
        </div>
        ))}
    </h1>
    );
}
