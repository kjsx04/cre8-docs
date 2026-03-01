"use client";

import { useRef, useEffect, useCallback } from "react";

/* ============================================================
   PROPS
   ============================================================ */
interface RichTextEditorProps {
  /** Current HTML content */
  value: string;
  /** Called on content change with new HTML */
  onChange: (html: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
}

/* ============================================================
   COMPONENT — minimal contenteditable rich text editor
   Toolbar: Bold, Italic, Bullets
   ============================================================ */
export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Enter property overview...",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  // Store onChange in ref so it's always current
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ---- Set initial content once on mount ----
  useEffect(() => {
    if (editorRef.current && !isInitialized.current) {
      editorRef.current.innerHTML = value || "";
      isInitialized.current = true;
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handle input events ----
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Treat empty paragraph / br as empty
    const isEmpty = html === "<br>" || html === "<p><br></p>" || html === "";
    onChangeRef.current(isEmpty ? "" : html);
  }, []);

  // ---- Toolbar actions using execCommand ----
  const execCmd = useCallback((cmd: string) => {
    document.execCommand(cmd, false);
    // Refocus the editor after toolbar click
    editorRef.current?.focus();
    // Trigger change
    handleInput();
  }, [handleInput]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd("bold")}
          className="w-8 h-8 rounded border border-[#E5E5E5] flex items-center justify-center
                     text-sm font-bold text-[#666] hover:bg-[#F5F5F5] hover:text-[#333] transition-colors"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd("italic")}
          className="w-8 h-8 rounded border border-[#E5E5E5] flex items-center justify-center
                     text-sm italic text-[#666] hover:bg-[#F5F5F5] hover:text-[#333] transition-colors"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => execCmd("insertUnorderedList")}
          className="w-8 h-8 rounded border border-[#E5E5E5] flex items-center justify-center
                     text-xs text-[#666] hover:bg-[#F5F5F5] hover:text-[#333] transition-colors"
          title="Bullet List"
        >
          &#8226;&#8801;
        </button>
      </div>

      {/* Editable area */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          className="w-full min-h-[200px] bg-white border border-[#E5E5E5] rounded-btn px-3 py-2
                     text-sm text-[#333] outline-none focus:border-green transition-colors
                     [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[#BBB]"
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
