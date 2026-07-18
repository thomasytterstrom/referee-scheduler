// Click-or-drop file target. Hands the first dropped/selected File to onFile; the caller decides how
// to read it (ArrayBuffer for .xlsx, text otherwise).

import { useRef, useState } from "react";

export function FileDrop({
  accept,
  label,
  onFile,
}: {
  accept: string;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => inputRef.current?.click();

  return (
    <div
      className={`flex min-h-24 cursor-pointer items-center justify-center rounded-md border-2 border-dashed p-4 text-center text-sm ${
        over
          ? "border-primary bg-accent text-primary"
          : "border-input bg-muted text-muted-foreground hover:border-primary hover:bg-accent hover:text-primary"
      }`}
      role="button"
      tabIndex={0}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {label}
    </div>
  );
}
