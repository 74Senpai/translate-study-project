import { useState, useEffect } from "react";
import { Layers, Plus, Edit2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotify } from "@/hooks/useNotify";
import axiosInstance from "@/services/axiosInstance";

export default function FlashcardManagement() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSets = async () => {
    try {
      setLoading(true);
      const { data } = await axiosInstance.get("/flashcards");
      setSets(data);
    } catch (err) {
      console.error(err);
      notify.error("Failed to load flashcards");
    } finally {
      setLoading(false);
    }
  };

  const deleteSet = async (id) => {
    if (!confirm("Are you sure you want to delete this flashcard set?")) return;
    try {
      await axiosInstance.delete(`/flashcards/${id}`);
      notify.success("Flashcard set deleted");
      fetchSets();
    } catch {
      notify.error("Failed to delete set");
    }
  };

  useEffect(() => {
    fetchSets();
  }, [user?.id]);

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500 font-medium">
        Loading flashcards...
      </div>
    );

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <Layers className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 m-0 tracking-tight">
              Flashcard Sets
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Manage vocabulary flashcard collections.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/flashcards/new")}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 active:scale-95 border-none cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Set</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sets.map((set) => (
          <div
            key={set.id}
            className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-slate-800 m-0 line-clamp-2">
                {set.title}
              </h3>
              <span className="bg-indigo-50 text-indigo-600 text-[0.65rem] font-black px-2 py-1 rounded-lg uppercase tracking-wider">
                {set.cards?.length || 0} CARDS
              </span>
            </div>
            {set.description && (
              <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                {set.description}
              </p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <span className="text-[0.65rem] font-bold text-slate-400 uppercase">
                {new Date(set.created_at).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => navigate(`/flashcards/edit/${set.id}`)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors border-none cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteSet(set.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors border-none cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {sets.length === 0 && (
          <div className="col-span-full text-center py-20 bg-white rounded-[2rem] border border-slate-100 border-dashed">
            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">
              No flashcard sets yet
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
              Create your first flashcard set to start organizing vocabulary for
              users.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
