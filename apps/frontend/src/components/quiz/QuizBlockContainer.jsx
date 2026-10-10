import { useState } from "react";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const QuizCard = ({ question, index }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (selectedOption === null) return;
    const correct = selectedOption === parseInt(question.answer);
    setIsCorrect(correct);
    setIsSubmitted(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[1.25rem] md:rounded-[2rem] p-4 md:p-8 shadow-sm mb-4 md:mb-6 last:mb-0">
      <div className="flex justify-between items-center mb-6">
        <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
          Câu hỏi {index + 1}
        </span>
        {isSubmitted && (
          <div
            className={cn(
              "flex items-center gap-2 font-bold text-sm",
              isCorrect ? "text-green-600" : "text-red-600",
            )}
          >
            {isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            {isCorrect ? "Chính xác!" : "Chưa đúng rồi"}
          </div>
        )}
      </div>

      <h3 className="text-base md:text-lg font-bold text-slate-800 mb-5 md:mb-6 leading-relaxed">
        {question.question_text}
      </h3>

      <div className="space-y-2 mb-6">
        {question.options.map((option, idx) => {
          const isSelected = selectedOption === idx;
          const showSuccess = isSubmitted && idx === question.correct_answer;
          const showDanger = isSubmitted && isSelected && !isCorrect;

          return (
            <button
              key={idx}
              disabled={isSubmitted}
              onClick={() => setSelectedOption(idx)}
              className={cn(
                "w-full text-left p-3.5 md:p-4 rounded-xl md:rounded-2xl border-2 transition-all duration-200 flex items-center justify-between group text-sm",
                !isSubmitted && isSelected
                  ? "border-blue-600 bg-blue-50/50"
                  : "border-slate-50 hover:border-slate-200 bg-slate-50/30",
                showSuccess && "border-green-500 bg-green-50",
                showDanger && "border-red-500 bg-red-50",
              )}
            >
              <span
                className={cn(
                  "font-medium leading-normal",
                  !isSubmitted && isSelected
                    ? "text-blue-700"
                    : "text-slate-600",
                  showSuccess && "text-green-700",
                  showDanger && "text-red-700",
                )}
              >
                {option}
              </span>
              <div
                className={cn(
                  "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ml-3",
                  !isSubmitted && isSelected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white",
                  showSuccess && "border-green-500 bg-green-500 text-white",
                  showDanger && "border-red-500 bg-red-500 text-white",
                )}
              >
                {showSuccess ? (
                  <CheckCircle2 size={12} />
                ) : showDanger ? (
                  <XCircle size={12} />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {!isSubmitted ? (
        <button
          onClick={handleSubmit}
          disabled={selectedOption === null}
          className="w-full py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          Kiểm tra đáp án
        </button>
      ) : (
        question.explanation && (
          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-sm text-blue-700 leading-relaxed animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 font-bold mb-1">
              <HelpCircle size={16} /> Giải thích:
            </div>
            {question.explanation}
          </div>
        )
      )}
    </div>
  );
};

const QuizBlockContainer = ({ blocks }) => {
  // Gộp tất cả câu hỏi từ các blocks quiz lại
  const allQuestions = blocks.flatMap((b) => b.content);

  if (allQuestions.length === 0) return null;

  return (
    <div className="quiz-list space-y-4 md:space-y-8">
      {allQuestions.map((q, idx) => (
        <QuizCard key={idx} question={q} index={idx} />
      ))}
    </div>
  );
};

export default QuizBlockContainer;
