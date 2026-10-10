/**
 * POS (Part of Speech) constants shared across components.
 * Centralised here so colours, labels, and SpaCy mappings stay in sync.
 */

/** Colour assigned to each POS type for highlighting. */
export const POS_COLORS = {
  Noun: "#3b82f6",
  Verb: "#ef4444",
  Adjective: "#10b981",
  Pronoun: "#a855f7",
  Adverb: "#f97316",
  Article: "#f59e0b",
  Preposition: "#ec4899",
  Punctuation: "#9ca3af",
};

/** Human-readable Vietnamese labels + learning hints per POS type. */
export const POS_REFERENCE = {
  Noun: {
    vn: "Danh từ",
    definition: "Chỉ người, vật, địa điểm, ý tưởng...",
    identity: "Thường đứng sau mạo từ (a, an, the).",
  },
  Verb: {
    vn: "Động từ",
    definition: "Chỉ hành động hoặc trạng thái.",
    identity: "Thường đứng sau chủ ngữ, có thể chia thì.",
  },
  Adjective: {
    vn: "Tính từ",
    definition: "Mô tả đặc điểm của danh từ.",
    identity: "Thường đứng trước danh từ hoặc sau to-be.",
  },
  Pronoun: {
    vn: "Đại từ",
    definition: "Dùng để thay thế danh từ.",
    identity: "I, you, he, she, it, we, they...",
  },
  Adverb: {
    vn: "Trạng từ",
    definition: "Bổ nghĩa cho động từ, tính từ.",
    identity: "Thường kết thúc bằng đuôi -ly.",
  },
  Article: {
    vn: "Mạo từ",
    definition: "Xác định tính danh từ.",
    identity: "Gồm: a, an, the.",
  },
  Preposition: {
    vn: "Giới từ",
    definition: "Chỉ mối quan hệ thời gian, vị trí.",
    identity: "in, on, at, with, under...",
  },
};

/** Map SpaCy universal POS tags to our display categories. */
export const mapSpacyPos = (spacyPos) => {
  const mapping = {
    NOUN: "Noun",
    PROPN: "Noun",
    VERB: "Verb",
    AUX: "Verb",
    ADJ: "Adjective",
    PRON: "Pronoun",
    ADV: "Adverb",
    DET: "Article",
    ADP: "Preposition",
    PUNCT: "Punctuation",
  };
  return mapping[spacyPos] || "Noun";
};
