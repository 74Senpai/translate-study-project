/**
 * Animated loading bar shown at the bottom of the input section
 * while an API request is in-flight.
 */
export default function LoadingBar() {
  return (
    <div className="absolute bottom-0 left-0 h-[3px] w-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent bg-[length:200%_100%] animate-shimmer" />
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite linear;
        }
      `}</style>
    </div>
  );
}
