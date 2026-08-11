import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Question } from '../types';

interface QuestionBankViewProps {
  questions?: Question[];
  onRefresh?: () => void;
  onRefreshQuestions?: () => void;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  questions = [],
  onRefresh,
  onRefreshQuestions
}) => {
  const handleRefresh = onRefresh || onRefreshQuestions || (() => {});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Form
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<number>(0);
  const [marks, setMarks] = useState<number>(1);
  const [negativeMarks, setNegativeMarks] = useState<number>(0);
  const [subject, setSubject] = useState('Biology');
  const [explanation, setExplanation] = useState('');

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer(0);
    setMarks(1);
    setNegativeMarks(0);
    setSubject('Biology');
    setExplanation('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setQuestionText(q.question);
    setOptionA(q.options[0] || '');
    setOptionB(q.options[1] || '');
    setOptionC(q.options[2] || '');
    setOptionD(q.options[3] || '');
    setCorrectAnswer(q.answer !== null ? q.answer : 0);
    setMarks(q.marks || 1);
    setNegativeMarks(q.negativeMarks || 0);
    setSubject(q.subject || 'Biology');
    setExplanation(q.explanation || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      question: questionText,
      options: [optionA, optionB, optionC, optionD],
      answer: Number(correctAnswer),
      marks: Number(marks),
      negativeMarks: Number(negativeMarks),
      subject,
      explanation
    };

    try {
      const url = editingQuestion ? `/api/questions/${editingQuestion.id}` : '/api/questions';
      const method = editingQuestion ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        handleRefresh();
      }
    } catch (err) {
      console.error('Save question error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
      if (res.ok) handleRefresh();
    } catch (err) {
      console.error('Delete question error:', err);
    }
  };

  const filtered = questions.filter((q) => {
    if (filterSubject !== 'ALL' && q.subject !== filterSubject) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return q.question.toLowerCase().includes(query) || q.options.some(opt => opt.toLowerCase().includes(query));
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Central Question Bank</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Repository of structured questions for Telegram examinations and quizzes
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-2 w-fit cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Question</span>
        </button>
      </div>

      {/* Filter Bar Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search question text or options..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Subjects</option>
            <option value="Biology">Biology</option>
            <option value="Physics">Physics</option>
            <option value="General">General</option>
          </select>
        </div>

        <div className="text-slate-500 text-[11px] font-semibold">
          Total Questions: {filtered.length}
        </div>
      </div>

      {/* Question Cards List */}
      <div className="space-y-4">
        {filtered.map((q, qIdx) => (
          <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center space-x-2 text-[10px] font-bold">
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full uppercase">
                    {q.subject || 'General'}
                  </span>
                  <span className="text-slate-500 font-medium">
                    Marks: +{q.marks || 1} | Neg: -{q.negativeMarks || 0}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  {qIdx + 1}. {q.question}
                </h3>

                {/* Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                  {q.options.map((opt, oIdx) => {
                    const isCorrect = q.answer === oIdx;
                    return (
                      <div
                        key={oIdx}
                        className={`p-2.5 rounded-xl border ${
                          isCorrect
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
                            : 'bg-slate-50 border-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="font-mono font-bold mr-2 text-slate-500">{String.fromCharCode(65 + oIdx)}.</span>
                        {opt}
                        {isCorrect && <span className="ml-2 text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.2 rounded">CORRECT</span>}
                      </div>
                    );
                  })}
                </div>

                {q.explanation && (
                  <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2 italic font-medium">
                    💡 Explanation: {q.explanation}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => handleOpenEdit(q)}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(q.id)}
                  className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Question Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              {editingQuestion ? 'Edit Question' : 'Add Question to Bank'}
            </h3>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Question Text</label>
                <textarea
                  required
                  rows={3}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Type full question statement..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Option A</label>
                  <input
                    type="text"
                    required
                    value={optionA}
                    onChange={(e) => setOptionA(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Option B</label>
                  <input
                    type="text"
                    required
                    value={optionB}
                    onChange={(e) => setOptionB(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Option C</label>
                  <input
                    type="text"
                    required
                    value={optionC}
                    onChange={(e) => setOptionC(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Option D</label>
                  <input
                    type="text"
                    required
                    value={optionD}
                    onChange={(e) => setOptionD(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correct Answer</label>
                  <select
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value={0}>Option A (0)</option>
                    <option value={1}>Option B (1)</option>
                    <option value={2}>Option C (2)</option>
                    <option value={3}>Option D (3)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marks (+)</label>
                  <input
                    type="number"
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Biology">Biology</option>
                    <option value="Physics">Physics</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Explanation (Optional)</label>
                <input
                  type="text"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Provide rationale for correct option..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

