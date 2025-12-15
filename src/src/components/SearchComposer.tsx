// Ô tìm kiếm 

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Send, X, Image as ImageIcon, Video as VideoIcon } from "lucide-react";

type Attachment = {
  id: string;
  file: File;
  previewUrl?: string; // chỉ cho image/video
  kind: "image" | "video" | "other";
};

type ChatComposerProps = {
  onSend: (payload: { text: string; files: File[] }) => void;
  placeholder?: string;
  disabled?: boolean;
};

function detectKind(file: File): Attachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "other";
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function ChatComposer({
  onSend,
  placeholder = "Nhập link CameraIP …",
  disabled = false,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // autosize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 220); // max height ~ giống chat apps
    el.style.height = `${next}px`;
  }, [text]);

  // cleanup object URLs
  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const files = useMemo(() => attachments.map((a) => a.file), [attachments]);
  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0);

  function addFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);

    const next: Attachment[] = arr.map((file) => {
      const kind = detectKind(file);
      const previewUrl =
        kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined;

      return { id: uid(), file, previewUrl, kind };
    });

    setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const found = prev.find((x) => x.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleSubmit() {
    if (!canSend) return;
    onSend({ text: text.trim(), files });
    setText("");
    // cleanup previews
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter gửi, Shift+Enter xuống dòng (giống chat apps)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Drag & drop
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  // Paste image from clipboard
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length) addFiles(pastedFiles);
  }

  return (
    <div
      className={[
        "w-full",
        "rounded-2xl border border-border bg-card/80 backdrop-blur",
        "shadow-sm",
        "transition",
        isDragging ? "ring-2 ring-primary/60" : "focus-within:ring-2 focus-within:ring-primary/40",
        disabled ? "opacity-60" : "",
      ].join(" ")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 pb-0">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-2 rounded-xl border border-border bg-background/60 px-2 py-2"
            >
              {/* thumb */}
              <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                {a.kind === "image" && a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewUrl} className="h-full w-full object-cover" alt={a.file.name} />
                ) : a.kind === "video" && a.previewUrl ? (
                  <video src={a.previewUrl} className="h-full w-full object-cover" />
                ) : a.kind === "image" ? (
                  <ImageIcon className="h-5 w-5" />
                ) : a.kind === "video" ? (
                  <VideoIcon className="h-5 w-5" />
                ) : (
                  <Paperclip className="h-5 w-5" />
                )}
              </div>

              <div className="max-w-[180px]">
                <p className="truncate text-sm font-medium">{a.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(a.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* main input row */}
      <div className="flex items-end gap-2 p-3">
        {/* attach */}
        <button
          type="button"
          onClick={openFilePicker}
          disabled={disabled}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted disabled:cursor-not-allowed"
          aria-label="Attach"
          title="Đính kèm"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.currentTarget.value = ""; // chọn lại cùng file vẫn trigger 
          }}
        />

        {/* textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          rows={1}
          placeholder={placeholder}
          className={[
            "flex-1 resize-none bg-transparent",
            "text-sm leading-6",
            "outline-none",
            "placeholder:text-muted-foreground",
            "py-2",
          ].join(" ")}
        />

        {/* send */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={[
            "inline-flex h-10 w-10 items-center justify-center rounded-xl",
            canSend ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground",
            "disabled:cursor-not-allowed",
          ].join(" ")}
          aria-label="Send"
          title="Gửi"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* hint row */}
      <div className="px-4 pb-3 text-xs text-muted-foreground">
        Enter để gửi • Shift+Enter xuống dòng • Kéo-thả ảnh/video vào đây
      </div>
    </div>
  );
}
