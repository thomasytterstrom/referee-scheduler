// Click-or-drop file target. Hands dropped/selected files to the caller; caller decides how to read
// each one (ArrayBuffer for .xlsx, text otherwise).

import { useRef, useState } from "react";

export function FileDrop({
  accept,
  label,
  multiple = false,
  onFiles,
}: {
  accept: string;
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => inputRef.current?.click();
  const emit = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    if (files.length === 0) return;
    onFiles(multiple ? files : [files[0]]);
  };

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
        emit(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />
      {label}
    </div>
  );
}
