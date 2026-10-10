import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Youtube } from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  GripVertical,
  Trash2,
  Plus,
  Type,
  Sigma,
  Video,
  Image as ImageIcon,
  Layout,
  Eye,
  EyeOff,
  HelpCircle,
  Book,
  Loader2,
  Quote,
  Link as LinkIcon,
  Zap,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cmsService } from "@/services/cms";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Highlight } from "@tiptap/extension-highlight";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const BLOCK_LABELS = {
  text: "Text",
  formula: "Formula",
  example: "Example",
  table: "Table",
  quiz: "Quiz",
  vocabulary: "Vocabulary",
  video: "Video",
  quote: "Quote",
  flashcard: "Flashcard",
};

const ISSUE_LABELS = {
  spelling: "Chính tả",
  grammar: "Ngữ pháp",
  meaning: "Nghĩa",
  clarity: "Độ rõ ràng",
  consistency: "Tính nhất quán",
  structure: "Cấu trúc",
  other: "Khác",
};

const REVIEW_STYLES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
};

// --- Rich Text Component (Tiptap) ---
const extensions = [
  StarterKit.configure({
    history: true,
  }),
  TextStyle,
  Color,
  FontFamily,
  Highlight.configure({ multicolor: true }),
  Image,
  Youtube,
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
];

// Helper to convert rgb to hex for <input type="color">
const rgbToHex = (rgb) => {
  if (!rgb) return "#000000";
  if (rgb.startsWith("#")) return rgb;
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return "#000000";
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

const RichTextEditor = ({ content, onChange }) => {
  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
      <div className="bg-slate-50 p-2 border-b border-slate-200 flex flex-wrap gap-1 items-center">
        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        >
          B
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        >
          I
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
        >
          U
        </MenuButton>

        <div className="w-[1px] h-4 bg-slate-200 mx-1" />

        <MenuButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
        >
          H2
        </MenuButton>
        <MenuButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
        >
          H3
        </MenuButton>

        <div className="w-[1px] h-4 bg-slate-200 mx-1" />

        <select
          onChange={(e) =>
            editor.chain().focus().setFontFamily(e.target.value).run()
          }
          className="text-xs font-bold bg-white border border-slate-200 rounded px-1 py-1 outline-none"
          title="Font Family"
        >
          <option value="Inter">Sans</option>
          <option value="Georgia">Serif</option>
          <option value="monospace">Mono</option>
        </select>

        <select
          onChange={(e) =>
            editor
              .chain()
              .focus()
              .setMark("textStyle", { fontSize: e.target.value })
              .run()
          }
          className="text-xs font-bold bg-white border border-slate-200 rounded px-1 py-1 outline-none"
          title="Font Size"
        >
          <option value="14px">Small</option>
          <option value="16px">Normal</option>
          <option value="20px">Large</option>
          <option value="24px">Huge</option>
        </select>

        <input
          type="color"
          onInput={(e) => editor.chain().focus().setColor(e.target.value).run()}
          value={rgbToHex(editor.getAttributes("textStyle").color)}
          className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer"
          title="Text Color"
        />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={cn(
            "p-1 rounded text-xs font-bold transition-all",
            editor.isActive("highlight")
              ? "bg-yellow-200 text-yellow-900"
              : "bg-white text-slate-600 hover:bg-slate-200",
          )}
          title="Highlight"
        >
          M
        </button>

        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        >
          List
        </MenuButton>
      </div>
      <EditorContent
        editor={editor}
        className="p-4 prose prose-slate max-w-none min-h-[100px] outline-none"
      />
    </div>
  );
};

const MenuButton = ({ onClick, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-2 py-1 rounded text-sm font-bold transition-all",
      active
        ? "bg-blue-600 text-white"
        : "bg-white text-slate-600 hover:bg-slate-200",
    )}
  >
    {children}
  </button>
);

// --- Custom Blocks ---

const FormulaBlock = ({ data = [], onChange }) => {
  const items = Array.isArray(data) ? data : [];

  const addItem = () => {
    onChange([...items, { label: "", value: "" }]);
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, val) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: val };
    onChange(newItems);
  };

  return (
    <div className="space-y-4 p-8 bg-blue-50/30 border border-blue-100 rounded-[2rem]">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="relative group bg-white p-5 rounded-2xl border border-blue-50 shadow-sm hover:shadow-md transition-all"
          >
            <button
              onClick={() => removeItem(idx)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              type="button"
            >
              <Trash2 size={12} />
            </button>
            <div className="space-y-3">
              <input
                value={item.label || ""}
                onChange={(e) => updateItem(idx, "label", e.target.value)}
                placeholder="VD: (+) Khẳng định"
                className="w-full text-[10px] font-black text-blue-500 uppercase tracking-widest bg-transparent outline-none border-b border-blue-50 focus:border-blue-200 pb-1"
              />
              <textarea
                value={item.value || ""}
                onChange={(e) => updateItem(idx, "value", e.target.value)}
                placeholder="S + V..."
                rows={2}
                className="w-full bg-slate-50/50 px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 font-mono text-sm text-slate-700 resize-none"
              />
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          type="button"
          className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-blue-100 rounded-2xl text-blue-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 transition-all min-h-[120px]"
        >
          <Plus size={20} />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Add Formula Row
          </span>
        </button>
      </div>
    </div>
  );
};

const VideoBlock = ({ url, onChange }) => (
  <div className="space-y-4 p-6 bg-slate-50 border border-slate-200 rounded-2xl">
    <div className="flex gap-4">
      <div className="flex-1">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          YouTube URL
        </label>
        <input
          value={url || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full px-4 py-2 mt-1 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
    </div>
  </div>
);
const VocabularyBlock = ({ data = [], onChange }) => {
  const items = Array.isArray(data) ? data : [];
  const [bulkText, setBulkText] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  const addItem = () => {
    onChange([...items, { word: "", meaning: "" }]);
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setIsTranslating(true);

    const words = bulkText
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w);
    const newItems = [...items];

    try {
      // Process in sequence to avoid overwhelming the rate limiter
      for (const word of words) {
        try {
          const res = await cmsService.simpleTranslate(word, "en-vi");
          newItems.push({ word, meaning: res.translated_text });
        } catch {
          newItems.push({ word, meaning: "" });
        }
      }
      onChange(newItems);
      setBulkText("");
      setIsBulkMode(false);
    } finally {
      setIsTranslating(false);
    }
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, val) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: val };
    onChange(newItems);
  };

  return (
    <div className="p-8 bg-emerald-50/30 border border-emerald-100 rounded-[2rem] space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
          Vocabulary Library
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => setIsBulkMode(!isBulkMode)}
            type="button"
            className="px-4 py-2 bg-white text-emerald-600 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-50 transition-all"
          >
            {isBulkMode ? "Cancel" : "Bulk Import"}
          </button>
          <button
            onClick={addItem}
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            <Plus size={14} /> Add Word
          </button>
        </div>
      </div>

      {isBulkMode && (
        <div className="p-6 bg-white border border-emerald-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-4">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Paste word list (separated by commas)
          </label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="VD: achievement, dictionary, platform"
            rows={3}
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-emerald-300 text-sm"
          />
          <button
            onClick={handleBulkImport}
            disabled={isTranslating || !bulkText.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isTranslating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Translating...
              </>
            ) : (
              "Start Auto-Import"
            )}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex gap-3 p-4 bg-white border border-emerald-100 rounded-2xl shadow-sm relative group"
          >
            <button
              onClick={() => removeItem(idx)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              type="button"
            >
              <Trash2 size={12} />
            </button>
            <div className="flex-1 space-y-2">
              <input
                value={item.word || ""}
                onChange={(e) => updateItem(idx, "word", e.target.value)}
                placeholder="Word (e.g. Achievement)"
                className="w-full px-3 py-2 bg-emerald-50/50 border border-transparent rounded-xl outline-none focus:border-emerald-200 font-bold text-slate-800 text-sm"
              />
              <input
                value={item.meaning || ""}
                onChange={(e) => updateItem(idx, "meaning", e.target.value)}
                placeholder="Meaning (e.g. Thành tựu)"
                className="w-full px-3 py-2 bg-slate-50 border border-transparent rounded-xl outline-none focus:border-emerald-100 text-slate-500 text-xs italic"
              />
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && !isBulkMode && (
        <div className="text-center py-10 border-2 border-dashed border-emerald-100 rounded-2xl">
          <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest">
            No vocabulary items yet
          </p>
        </div>
      )}
    </div>
  );
};

const ExampleBlock = ({ data, onChange }) => {
  const updateField = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="p-6 bg-slate-50/50 border border-slate-200 rounded-2xl space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-8 text-[10px] font-bold text-slate-400">GB</div>
        <input
          value={data.en || ""}
          onChange={(e) => updateField("en", e.target.value)}
          placeholder="She goes to school every day."
          className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="w-8 text-[10px] font-bold text-slate-400">VN</div>
        <input
          value={data.vi || ""}
          onChange={(e) => updateField("vi", e.target.value)}
          placeholder="Cô ấy đi học mỗi ngày."
          className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 text-slate-600 outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="w-8 text-lg text-slate-400 flex justify-center">💡</div>
        <input
          value={data.note || ""}
          onChange={(e) => updateField("note", e.target.value)}
          placeholder="Note: Chủ ngữ she -> động từ thêm -s"
          className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 italic text-blue-600 outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
    </div>
  );
};

const QuizBlock = ({ questions = [], onChange }) => {
  const addQuestion = () => {
    const newQuestion = {
      id: crypto.randomUUID(),
      type: "single", // single, multiple, fill, boolean
      question: "",
      options: ["", "", ""], // Default 3 options
      answer: "",
      explanation: "",
      is_hidden: false,
    };
    onChange([...questions, newQuestion]);
  };

  const updateQuestion = (id, field, value) => {
    onChange(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );
  };

  const removeQuestion = (id) => {
    onChange(questions.filter((q) => q.id !== id));
  };

  const handleOptionChange = (qId, optIdx, val) => {
    const q = questions.find((curr) => curr.id === qId);
    const newOpts = [...q.options];
    newOpts[optIdx] = val;
    updateQuestion(qId, "options", newOpts);
  };

  const addOption = (qId) => {
    const q = questions.find((curr) => curr.id === qId);
    if (q.options.length < 6) {
      updateQuestion(qId, "options", [...q.options, ""]);
    }
  };

  const removeOption = (qId, optIdx) => {
    const q = questions.find((curr) => curr.id === qId);
    if (q.options.length > 3) {
      updateQuestion(
        qId,
        "options",
        q.options.filter((_, i) => i !== optIdx),
      );
    }
  };

  const toggleAnswer = (qId, optIdx, type) => {
    const q = questions.find((curr) => curr.id === qId);
    const idxStr = optIdx.toString();

    if (type === "single" || type === "boolean") {
      updateQuestion(qId, "answer", idxStr);
    } else if (type === "multiple") {
      const currentAnswers = q.answer ? q.answer.split("|") : [];
      const newAnswers = currentAnswers.includes(idxStr)
        ? currentAnswers.filter((a) => a !== idxStr)
        : [...currentAnswers, idxStr];
      updateQuestion(qId, "answer", newAnswers.sort().join("|"));
    }
  };

  return (
    <div className="space-y-6">
      {questions.map((q, idx) => (
        <div
          key={q.id}
          className={cn(
            "p-8 border rounded-[2rem] bg-white shadow-xl shadow-slate-100/50 transition-all",
            !q.answer
              ? "border-red-200 ring-2 ring-red-50"
              : "border-slate-200",
            q.is_hidden && "opacity-60 bg-slate-50 grayscale scale-[0.98]",
          )}
        >
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 flex items-center justify-center bg-slate-900 text-white rounded-xl font-bold text-sm">
                {idx + 1}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Question Details
                </span>
                {!q.answer && (
                  <span className="text-[10px] font-bold text-red-500 mt-1 uppercase animate-pulse">
                    ⚠️ No correct answer selected
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateQuestion(q.id, "is_hidden", !q.is_hidden)}
                className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              >
                {q.is_hidden ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Question Type
                </label>
                <select
                  value={q.type}
                  onChange={(e) => updateQuestion(q.id, "type", e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-bold text-slate-700"
                >
                  <option value="single">Single Choice (Radio)</option>
                  <option value="multiple">Multiple Choice (Checkbox)</option>
                  <option value="fill">Fill in the Blanks</option>
                  <option value="boolean">Yes / No</option>
                </select>
              </div>

              {q.type === "fill" && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Correct Answer
                  </label>
                  <input
                    value={q.answer}
                    onChange={(e) =>
                      updateQuestion(q.id, "answer", e.target.value)
                    }
                    placeholder="Enter the correct word..."
                    className="w-full px-5 py-3 bg-blue-50/50 border border-blue-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-bold text-blue-700 placeholder:text-blue-300"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                The Question
              </label>
              <textarea
                value={q.question}
                onChange={(e) =>
                  updateQuestion(q.id, "question", e.target.value)
                }
                placeholder="Ex: Do you want learn English?"
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-4 focus:ring-blue-100 h-24 resize-none text-lg font-bold text-slate-800 placeholder:text-slate-300"
              />
            </div>

            {(q.type === "single" || q.type === "multiple") && (
              <div className="space-y-4">
                <div className="flex justify-between items-end ml-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Options & Correct Answer
                  </label>
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                    {q.options.length} / 6 Options
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-3 group">
                      <button
                        type="button"
                        onClick={() => toggleAnswer(q.id, optIdx, q.type)}
                        className={cn(
                          "w-12 h-12 flex items-center justify-center rounded-2xl border-2 transition-all",
                          (q.type === "multiple"
                            ? q.answer.split("|").includes(optIdx.toString())
                            : q.answer === optIdx.toString()) && opt !== ""
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                            : "bg-white border-slate-100 text-slate-300 hover:border-blue-200",
                        )}
                      >
                        {q.type === "multiple" ? (
                          <div
                            className={cn(
                              "w-4 h-4 rounded-sm border-2 border-current",
                              q.answer.split("|").includes(optIdx.toString()) &&
                                "bg-current",
                            )}
                          />
                        ) : (
                          <div
                            className={cn(
                              "w-4 h-4 rounded-full border-2 border-current",
                              q.answer === optIdx.toString() && "bg-current",
                            )}
                          />
                        )}
                      </button>
                      <input
                        value={opt}
                        onChange={(e) =>
                          handleOptionChange(q.id, optIdx, e.target.value)
                        }
                        placeholder={`Option ${optIdx + 1}...`}
                        className="flex-1 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 font-medium text-slate-700"
                      />
                      {q.options.length > 3 && (
                        <button
                          type="button"
                          onClick={() => removeOption(q.id, optIdx)}
                          className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 6 && (
                    <button
                      type="button"
                      onClick={() => addOption(q.id)}
                      className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 transition-all text-xs font-bold uppercase tracking-widest"
                    >
                      <Plus size={14} /> Add Option
                    </button>
                  )}
                </div>
              </div>
            )}

            {q.type === "boolean" && (
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Select Correct Answer
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {["Yes", "No"].map((opt, optIdx) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        updateQuestion(q.id, "answer", optIdx.toString())
                      }
                      className={cn(
                        "py-4 rounded-2xl border-2 font-bold transition-all text-lg",
                        q.answer === optIdx.toString()
                          ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200"
                          : "bg-white border-slate-100 text-slate-400 hover:border-slate-200",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full text-[10px]">
                  !
                </span>
                Detailed Explanation
              </label>
              <textarea
                value={q.explanation}
                onChange={(e) =>
                  updateQuestion(q.id, "explanation", e.target.value)
                }
                placeholder="Explain why the answer is correct..."
                className="w-full px-6 py-4 bg-blue-50/30 border border-blue-50 rounded-3xl outline-none focus:ring-4 focus:ring-blue-100 h-24 resize-none italic text-blue-800 placeholder:text-blue-200 text-sm"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="w-full py-8 border-4 border-dashed border-slate-100 rounded-[2.5rem] text-slate-300 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-3 group"
      >
        <div className="w-12 h-12 flex items-center justify-center bg-slate-50 group-hover:bg-blue-100 text-slate-400 group-hover:text-blue-600 rounded-2xl transition-all">
          <Plus size={24} />
        </div>
        <span className="font-black uppercase tracking-[0.2em] text-sm">
          Add Practice Question
        </span>
      </button>
    </div>
  );
};

const TableBlock = ({ data, onChange }) => {
  const { headers = ["V1", "V2", "V3", "Nghĩa"], rows = [["", "", "", ""]] } =
    data || {};

  const safeOnChange = (updatedData) => {
    onChange({
      headers: updatedData.headers || headers,
      rows: updatedData.rows || rows,
    });
  };

  const updateHeaders = (idx, val) => {
    const newHeaders = [...headers];
    newHeaders[idx] = val;
    safeOnChange({ headers: newHeaders });
  };

  const updateCell = (rowIdx, colIdx, val) => {
    const newRows = [...rows];
    newRows[rowIdx] = [...newRows[rowIdx]];
    newRows[rowIdx][colIdx] = val;
    safeOnChange({ rows: newRows });
  };

  const addRow = () => {
    const newRow = new Array(headers.length).fill("");
    safeOnChange({ rows: [...rows, newRow] });
  };

  const removeRow = (idx) => {
    if (rows.length > 1) {
      safeOnChange({ rows: rows.filter((_, i) => i !== idx) });
    }
  };

  const addColumn = () => {
    safeOnChange({
      headers: [...headers, "New Col"],
      rows: rows.map((r) => [...r, ""]),
    });
  };

  const removeColumn = (idx) => {
    if (headers.length > 1) {
      safeOnChange({
        headers: headers.filter((_, i) => i !== idx),
        rows: rows.map((r) => r.filter((_, i) => i !== idx)),
      });
    }
  };

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-[2rem] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 w-10"></th>
              {headers.map((h, i) => (
                <th key={i} className="p-2 border-b-2 border-slate-100">
                  <div className="flex flex-col gap-1">
                    <input
                      value={h}
                      onChange={(e) => updateHeaders(i, e.target.value)}
                      className="w-full bg-slate-50 border-none text-[10px] font-black uppercase tracking-widest text-center py-1 rounded outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(i)}
                      className="text-[8px] text-red-300 hover:text-red-500 uppercase font-bold"
                    >
                      Del
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-2 w-10">
                <button
                  type="button"
                  onClick={addColumn}
                  className="p-1 text-blue-400 hover:bg-blue-50 rounded"
                >
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="group">
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(rIdx)}
                    className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2 border-b border-slate-50">
                    <input
                      value={cell}
                      onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                      placeholder="..."
                      className="w-full px-3 py-2 bg-transparent border-none text-sm font-medium text-slate-700 outline-none focus:bg-slate-50 rounded transition-all"
                    />
                  </td>
                ))}
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        className="w-full mt-4 py-2 border border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all text-xs font-bold uppercase tracking-widest"
      >
        + Add Row
      </button>
    </div>
  );
};

const QuoteBlock = ({ data = {}, onChange }) => {
  const updateField = (field, val) => {
    onChange({ ...data, [field]: val });
  };

  return (
    <div className="p-6 bg-slate-50 border-l-4 border-slate-300 rounded-none space-y-4">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Quote Content
          </label>
          <textarea
            value={data.text || ""}
            onChange={(e) => updateField("text", e.target.value)}
            placeholder="Ex: This is a quote..."
            rows={2}
            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-200 text-sm italic text-slate-600"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-bold text-slate-400 capitalize">
              Source Link
            </label>
            <input
              value={data.link || ""}
              onChange={(e) => updateField("link", e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-200 text-xs text-blue-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const FlashcardBlock = ({ data = {}, onChange }) => {
  const updateField = (field, val) => {
    onChange({ ...data, [field]: val });
  };

  return (
    <div className="p-8 bg-amber-50/50 border-2 border-amber-100 rounded-3xl space-y-6 relative overflow-hidden group">
      <div className="absolute top-4 right-6 opacity-10 text-amber-500 pointer-events-none group-hover:scale-110 transition-transform">
        <Zap size={60} />
      </div>

      <div className="space-y-4 relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={16} className="text-amber-500 fill-amber-500" />
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
            Flashcard Resource
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Flashcard Title
            </label>
            <input
              value={data.title || ""}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Ex: 50 Common Irregular Verbs"
              className="w-full px-5 py-3 bg-white border border-amber-100 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 font-bold text-slate-800"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Description
            </label>
            <textarea
              value={data.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Ex: Master the essential verbs with this set..."
              rows={2}
              className="w-full px-5 py-3 bg-white border border-amber-100 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 text-sm text-slate-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
              <LinkIcon size={12} className="text-amber-500" />
              Flashcard URL
            </label>
            <input
              value={data.link || ""}
              onChange={(e) => updateField("link", e.target.value)}
              placeholder="https://..."
              className="w-full px-5 py-3 bg-white border border-amber-100 rounded-2xl outline-none focus:ring-4 focus:ring-amber-100 text-amber-700 font-bold"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <div className="px-6 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-200 cursor-not-allowed">
            <Zap size={14} className="fill-white" /> Làm Flashcard
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Block Editor ---

const BlockEditor = ({
  blocks = [],
  onChange,
  selectedBlockIds = [],
  onToggleBlockSelection,
  reviewCommentsByBlock = {},
  reviewLoading = false,
  onBlockRemove,
  onResolveReview,
}) => {
  const [localBlocks, setLocalBlocks] = useState(blocks);

  useEffect(() => {
    if (JSON.stringify(blocks) !== JSON.stringify(localBlocks)) {
      setLocalBlocks(blocks);
    }
  }, [blocks]);

  const updateBlocks = (newBlocks) => {
    setLocalBlocks(newBlocks);
    onChange(newBlocks);
  };

  const addBlock = (type) => {
    const newBlock = {
      id: crypto.randomUUID(),
      type,
      content:
        type === "text"
          ? ""
          : type === "formula"
            ? [
                { label: "(+) Khẳng định", value: "" },
                { label: "(-) Phủ định", value: "" },
                { label: "(?) Nghi vấn", value: "" },
              ]
            : type === "example"
              ? { en: "", vi: "", note: "" }
              : type === "quiz"
                ? []
                : type === "vocabulary"
                  ? []
                  : type === "table"
                    ? {
                        headers: ["V1", "V2", "V3", "Nghĩa"],
                        rows: [["", "", "", ""]],
                      }
                    : type === "quote"
                      ? { text: "", link: "" }
                      : type === "flashcard"
                        ? { title: "", description: "", link: "" }
                        : "",
    };
    updateBlocks([...localBlocks, newBlock]);
  };

  const removeBlock = (id) => {
    onBlockRemove?.(id);
    updateBlocks(localBlocks.filter((b) => b.id !== id));
  };

  const handleBlockChange = (id, newContent) => {
    updateBlocks(
      localBlocks.map((b) => (b.id === id ? { ...b, content: newContent } : b)),
    );
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(localBlocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    updateBlocks(items);
  };

  const applyTemplate = (templateName) => {
    let templateBlocks = [];
    if (templateName === "grammar_tense") {
      templateBlocks = [
        { id: "t1", type: "text", content: "<h2>Cấu trúc</h2>" },
        {
          id: "t2",
          type: "formula",
          content: [
            { label: "(+) Khẳng định", value: "" },
            { label: "(-) Phủ định", value: "" },
            { label: "(?) Nghi vấn", value: "" },
          ],
        },
        {
          id: "t3",
          type: "text",
          content: "<h2>Cách dùng</h2><ul><li>Diễn tả...</li></ul>",
        },
        { id: "t4", type: "text", content: "<h2>Ví dụ</h2>" },
      ];
    }
    updateBlocks(templateBlocks);
  };

  return (
    <div className="space-y-6">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="blocks">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-4"
            >
              {localBlocks.map((block, index) => (
                <Draggable key={block.id} draggableId={block.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={cn(
                        "group relative bg-white border border-slate-100 rounded-3xl p-6 transition-all hover:border-blue-200 hover:shadow-lg",
                        snapshot.isDragging &&
                          "shadow-2xl border-blue-400 rotate-1 scale-[1.02] z-50",
                      )}
                    >
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-[0.18em]">
                            {BLOCK_LABELS[block.type] || block.type}
                          </span>
                          {reviewCommentsByBlock[block.id] && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold",
                                REVIEW_STYLES[
                                  reviewCommentsByBlock[block.id].severity
                                ] || REVIEW_STYLES.info,
                              )}
                            >
                              <Sparkles size={12} />
                              AI Review
                            </span>
                          )}
                        </div>

                        {onToggleBlockSelection && (
                          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedBlockIds.includes(block.id)}
                              onChange={() => onToggleBlockSelection(block.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Chọn để AI review
                            {reviewLoading && selectedBlockIds.includes(block.id) && (
                              <Loader2 size={13} className="animate-spin" />
                            )}
                          </label>
                        )}
                      </div>

                      <div className="flex items-start gap-4">
                        <div
                          {...provided.dragHandleProps}
                          className="mt-1 text-slate-300 hover:text-slate-500 transition-colors"
                        >
                          <GripVertical size={20} />
                        </div>

                        <div className="flex-1 min-w-0">
                          {block.type === "text" && (
                            <RichTextEditor
                              content={block.content}
                              onChange={(html) =>
                                handleBlockChange(block.id, html)
                              }
                            />
                          )}
                          {block.type === "formula" && (
                            <FormulaBlock
                              data={block.content}
                              onChange={(data) =>
                                handleBlockChange(block.id, data)
                              }
                            />
                          )}
                          {block.type === "example" && (
                            <ExampleBlock
                              data={block.content}
                              onChange={(data) =>
                                handleBlockChange(block.id, data)
                              }
                            />
                          )}
                          {block.type === "table" && (
                            <TableBlock
                              data={block.content}
                              onChange={(data) =>
                                handleBlockChange(block.id, data)
                              }
                            />
                          )}
                          {block.type === "quiz" && (
                            <QuizBlock
                              questions={block.content}
                              onChange={(questions) =>
                                handleBlockChange(block.id, questions)
                              }
                            />
                          )}
                          {block.type === "vocabulary" && (
                            <VocabularyBlock
                              data={block.content}
                              onChange={(val) =>
                                handleBlockChange(block.id, val)
                              }
                            />
                          )}
                          {block.type === "video" && (
                            <VideoBlock
                              url={block.content}
                              onChange={(url) =>
                                handleBlockChange(block.id, url)
                              }
                            />
                          )}
                          {block.type === "quote" && (
                            <QuoteBlock
                              data={block.content}
                              onChange={(val) =>
                                handleBlockChange(block.id, val)
                              }
                            />
                          )}
                          {block.type === "flashcard" && (
                            <FlashcardBlock
                              data={block.content}
                              onChange={(val) =>
                                handleBlockChange(block.id, val)
                              }
                            />
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeBlock(block.id)}
                          className="mt-1 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {reviewCommentsByBlock[block.id] && (
                        <div
                          className={cn(
                            "mt-5 rounded-[1.5rem] border p-4",
                            REVIEW_STYLES[reviewCommentsByBlock[block.id].severity] ||
                              REVIEW_STYLES.info,
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black">Nhận xét AI</p>
                                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                                  {reviewCommentsByBlock[block.id].severity}
                                </span>
                                {onResolveReview && (
                                  <button
                                    type="button"
                                    onClick={() => onResolveReview(block.id)}
                                    className="ml-auto rounded-xl border border-current/20 bg-white/70 px-3 py-1 text-[11px] font-bold hover:bg-white transition-all"
                                  >
                                    Đã giải quyết
                                  </button>
                                )}
                              </div>
                              <p className="mt-1 text-sm leading-relaxed">
                                {reviewCommentsByBlock[block.id].summary}
                              </p>

                              {reviewCommentsByBlock[block.id].issues?.length > 0 ? (
                                <div className="mt-4 space-y-3">
                                  {reviewCommentsByBlock[block.id].issues.map(
                                    (issue, issueIndex) => (
                                      <div
                                        key={`${block.id}-issue-${issueIndex}`}
                                        className="rounded-2xl bg-white/70 px-4 py-3 border border-current/10"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[11px] font-black uppercase tracking-wider">
                                            {ISSUE_LABELS[issue.category] ||
                                              issue.category}
                                          </span>
                                          <span className="text-[11px] font-bold opacity-70">
                                            {issue.severity}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-700">
                                          {issue.message}
                                        </p>
                                        {issue.excerpt && (
                                          <p className="mt-2 text-xs text-slate-500 italic">
                                            "{issue.excerpt}"
                                          </p>
                                        )}
                                        {issue.suggestion && (
                                          <p className="mt-2 text-xs font-semibold text-slate-700">
                                            Gợi ý: {issue.suggestion}
                                          </p>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p className="mt-3 text-xs font-semibold opacity-80">
                                  Không có cảnh báo nào cho block này.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Modern Add Block Toolbar at the Bottom */}
      <div className="mt-12 p-8 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] space-y-6">
        <div className="text-center">
          <h4 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
            Add Content Component
          </h4>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            {
              type: "text",
              icon: <Type size={20} />,
              label: "Rich Text",
              color: "bg-blue-50 text-blue-600",
            },
            {
              type: "formula",
              icon: <Sigma size={20} />,
              label: "Formula",
              color: "bg-purple-50 text-purple-600",
            },
            {
              type: "example",
              icon: <ImageIcon size={20} />,
              label: "Example",
              color: "bg-orange-50 text-orange-600",
            },
            {
              type: "table",
              icon: <Layout size={20} />,
              label: "Table",
              color: "bg-indigo-50 text-indigo-600",
            },
            {
              type: "vocabulary",
              icon: <Book size={20} />,
              label: "Vocab",
              color: "bg-emerald-50 text-emerald-600",
            },
            {
              type: "quiz",
              icon: <HelpCircle size={20} />,
              label: "Quiz",
              color: "bg-green-50 text-green-600",
            },
            {
              type: "video",
              icon: <Video size={20} />,
              label: "YouTube",
              color: "bg-red-50 text-red-600",
            },
            {
              type: "quote",
              icon: <Quote size={20} />,
              label: "Quote",
              color: "bg-slate-100 text-slate-600",
            },
            {
              type: "flashcard",
              icon: <Zap size={20} />,
              label: "Flashcard",
              color: "bg-amber-100 text-amber-600",
            },
          ].map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => addBlock(item.type)}
              className="group flex flex-col items-center gap-3 p-6 bg-white border border-slate-100 rounded-3xl hover:border-blue-300 hover:shadow-xl hover:-translate-y-1 transition-all"
            >
              <div
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-2xl transition-all group-hover:scale-110",
                  item.color,
                )}
              >
                {item.icon}
              </div>
              <span className="text-xs font-bold text-slate-600">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-200 flex justify-center">
          <button
            type="button"
            onClick={() => applyTemplate("grammar_tense")}
            className="flex items-center gap-2 px-6 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all"
          >
            <Layout size={14} /> Apply Grammar Tense Template
          </button>
        </div>
      </div>

      {localBlocks.length === 0 && (
        <div className="py-20 text-center text-slate-300">
          <p className="text-sm font-medium uppercase tracking-widest">
            Your canvas is empty
          </p>
        </div>
      )}
    </div>
  );
};

export default BlockEditor;
