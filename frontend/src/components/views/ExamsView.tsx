import React, { useState } from 'react';
import {
  Plus,
  Search,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  FileCode,
  Sparkles,
  BookOpen,
  X,
  Upload
} from 'lucide-react';
import { Exam, Question, VisibilityStatus, ExamStatus } from '../types';

interface ExamsViewProps {
  exams?: Exam[];
  questions?: Question[];
  questionBank?: Question[];
  onRefreshExams?: () => void;
}

export const ExamsView: React.FC<ExamsViewProps> = ({
  exams = [],
  questions = [],
  questionBank,
  onRefreshExams = () => {}
}) => {
  const bank = questionBank || questions || [];
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Biology');
  const [className, setClassName] = useState('All Students');
  const [testNumber, setTestNumber] = useState('Test 01');
  const [startDate, setStartDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [negativeMarking, setNegativeMarking] = useState(0);
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [resultVisibility, setResultVisibility] = useState<VisibilityStatus>('PUBLISHED');
  const [leaderboardVisibility, setLeaderboardVisibility] = useState<VisibilityStatus>('PUBLISHED');
  const [status, setStatus] = useState<ExamStatus>('SCHEDULED');
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);

  // Inline question addition tools
  const [questionAddTab, setQuestionAddTab] = useState<'NONE' | 'MANUAL' | 'JSON' | 'OCR' | 'BANK'>('NONE');
  
  // Manual question form
  const [qText, setQText] = useState('');
  const [qOpt0, setQOpt0] = useState('');
  const [qOpt1, setQOpt1] = useState('');
  const [qOpt2, setQOpt2] = useState('');
  const [qOpt3, setQOpt3] = useState('');
  const [qCorrect, setQCorrect] = useState(0);
  const [qMarks, setQMarks] = useState(1);

  // JSON import input
  const [jsonText, setJsonText] = useState('');
  
  // OCR processing state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingExam(null);
    setTitle('');
    setSubject('General');
    setClassName('All Students');
    setTestNumber('Test 01');
    const localNow = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
    setStartDate(localNow);
    setDurationMinutes(60);
    setNegativeMarking(0);
    setRandomizeQuestions(false);
    setRandomizeOptions(false);
    setResultVisibility('PUBLISHED');
    setLeaderboardVisibility('PUBLISHED');
    setStatus('SCHEDULED');
    setSelectedQuestions([]);
    setQuestionAddTab('NONE');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (exam: Exam) => {
    setEditingExam(exam);
    setTitle(exam.title);
    setSubject(exam.subject);
    setClassName(exam.className);
    setTestNumber(exam.testNumber);
    setStartDate(new Date(exam.startDate).toISOString().slice(0, 16));
    setDurationMinutes(exam.durationMinutes);
    setNegativeMarking(exam.negativeMarking);
    setRandomizeQuestions(exam.randomizeQuestions);
    setRandomizeOptions(exam.randomizeOptions);
    setResultVisibility(exam.resultVisibility);
    setLeaderboardVisibility(exam.leaderboardVisibility);
    setStatus(exam.status);
    setSelectedQuestions(exam.questions || []);
    setQuestionAddTab('NONE');
    setIsModalOpen(true);
  };

  // Add manual question
  const handleAddManualQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) return;

    const newQ: Question = {
      id: `Q_MANUAL_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      question: qText.trim(),
      options: [qOpt0 || 'Option A', qOpt1 || 'Option B', qOpt2 || 'Option C', qOpt3 || 'Option D'],
      answer: Number(qCorrect),
      marks: Number(qMarks) || 1,
      negativeMarks: Number(negativeMarking) || 0,
      subject: subject || 'General'
    };

    setSelectedQuestions(prev => [...prev, newQ]);
    setQText('');
    setQOpt0('');
    setQOpt1('');
    setQOpt2('');
    setQOpt3('');
    setQCorrect(0);
    setQMarks(1);
    setQuestionAddTab('NONE');
  };

  // Handle JSON Import into current exam
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const items = Array.isArray(parsed) ? parsed : (parsed.questions || []);
      if (!Array.isArray(items) || items.length === 0) {
        alert('Invalid JSON format. Expected an array of questions.');
        return;
      }

      const importedQs: Question[] = items.map((q: any, idx: number) => ({
        id: `Q_JSON_${Date.now()}_${idx}`,
        question: q.question || `Question ${idx + 1}`,
        options: Array.isArray(q.options) ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: q.answer !== undefined && q.answer !== null ? Number(q.answer) : 0,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        subject: q.subject || subject || 'General'
      }));

      setSelectedQuestions(prev => [...prev, ...importedQs]);
      setJsonText('');
      setQuestionAddTab('NONE');
    } catch (err) {
      alert('Failed to parse JSON text. Please ensure valid JSON format.');
    }
  };

  // Handle OCR file upload
  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrError('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/ocr/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: file.type || 'image/jpeg'
          })
        });

        const data = await res.json();
        if (res.ok && Array.isArray(data.questions)) {
          const parsedQs: Question[] = data.questions.map((q: any, idx: number) => ({
            id: `Q_OCR_${Date.now()}_${idx}`,
            question: q.question,
            options: q.options || ['Option A', 'Option B', 'Option C', 'Option D'],
            answer: q.answer !== undefined ? Number(q.answer) : 0,
            marks: Number(q.marks) || 1,
            negativeMarks: Number(q.negativeMarks) || 0,
            subject: subject || 'General'
          }));
          setSelectedQuestions(prev => [...prev, ...parsedQs]);
          setQuestionAddTab('NONE');
        } else {
          setOcrError(data.error || 'Failed to extract questions from image/PDF.');
        }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('OCR Upload Error:', err);
      setOcrError('An error occurred while uploading file for OCR.');
      setOcrLoading(false);
    }
  };

  // Save Exam
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title,
      subject,
      className,
      testNumber,
      startDate: new Date(startDate).toISOString(),
      durationMinutes: Number(durationMinutes),
      totalMarks: selectedQuestions.reduce((acc, q) => acc + (q.marks || 1), 0),
      negativeMarking: Number(negativeMarking),
      randomizeQuestions,
      randomizeOptions,
      resultVisibility,
      leaderboardVisibility,
      status,
      questions: selectedQuestions
    };

    try {
      const url = editingExam ? `/api/exams/${editingExam.id}` : '/api/exams';
      const method = editingExam ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        onRefreshExams();
      }
    } catch (err) {
      console.error('Failed to save exam:', err);
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this examination?')) return;
    try {
      const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
      if (res.ok) onRefreshExams();
    } catch (err) {
      console.error('Delete exam error:', err);
    }
  };

  // Filtering
  const filteredExams = exams.filter((exam) => {
    if (filterClass !== 'ALL' && exam.className !== filterClass) return false;
    if (filterStatus !== 'ALL' && exam.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return exam.title.toLowerCase().includes(q) || exam.subject.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in" id="exams-section">
      
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Scheduled & Active Examinations</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Manage test schedules, start dates, question paper attachments, and student access
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-2 w-fit cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Exam</span>
        </button>
      </div>

      {/* Filter Controls Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search exam title or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Exam States</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="LIVE">LIVE</option>
            <option value="ENDED">ENDED</option>
            <option value="RESULTS_PUBLISHED">RESULTS_PUBLISHED</option>
          </select>
        </div>

        <div className="text-slate-500 text-[11px] font-semibold">
          Showing {filteredExams.length} of {exams.length} exams
        </div>
      </div>

      {/* Exams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredExams.map((exam) => (
          <div
            key={exam.id}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full uppercase">
                  {exam.subject} • {exam.testNumber}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  exam.status === 'LIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : exam.status === 'SCHEDULED'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : exam.status === 'RESULTS_PUBLISHED'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {exam.status}
                </span>
              </div>

              {/* Title & Class */}
              <h3 className="font-bold text-slate-900 text-base mb-1 line-clamp-2">
                {exam.title}
              </h3>
              <p className="text-xs text-slate-500 mb-4 font-semibold">
                Target: {exam.className}
              </p>

              {/* Info Metrics Box */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 mb-4 text-xs font-medium text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="flex items-center space-x-1.5 text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Start Date:</span>
                  </span>
                  <span className="font-bold text-slate-900">
                    {new Date(exam.startDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center space-x-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Duration:</span>
                  </span>
                  <span className="font-bold text-slate-900">{exam.durationMinutes} Mins</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Questions Attached:</span>
                  <span className="font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                    {exam.questions?.length || 0} Questions
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleOpenEdit(exam)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => handleDeleteExam(exam.id)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingExam ? 'Edit Examination Schedule' : 'Create New Examination'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Exam Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Annual Biology Mock Exam 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Test Code</label>
                  <input
                    type="text"
                    required
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Group</label>
                  <input
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Negative Marking</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={negativeMarking}
                    onChange={(e) => setNegativeMarking(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Exam State</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ExamStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-blue-700"
                  >
                    <option value="DRAFT">DRAFT (Hidden from Telegram)</option>
                    <option value="SCHEDULED">SCHEDULED (Visible on Telegram, locked until start time)</option>
                    <option value="LIVE">LIVE (Students can start now)</option>
                    <option value="ENDED">ENDED</option>
                    <option value="RESULTS_PUBLISHED">RESULTS_PUBLISHED</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Result Visibility</label>
                  <select
                    value={resultVisibility}
                    onChange={(e) => setResultVisibility(e.target.value as VisibilityStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="PUBLISHED">PUBLISHED (Visible to Students)</option>
                    <option value="HIDDEN">HIDDEN (Teacher only)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Leaderboard Visibility</label>
                  <select
                    value={leaderboardVisibility}
                    onChange={(e) => setLeaderboardVisibility(e.target.value as VisibilityStatus)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="PUBLISHED">PUBLISHED</option>
                    <option value="HIDDEN">HIDDEN</option>
                  </select>
                </div>
              </div>

              {/* Questions Section with Import Options */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="font-bold text-slate-900 text-sm">
                      Questions Attached ({selectedQuestions.length})
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Total Marks: <span className="font-bold text-slate-900">{selectedQuestions.reduce((acc, q) => acc + (q.marks || 1), 0)}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuestionAddTab(questionAddTab === 'MANUAL' ? 'NONE' : 'MANUAL')}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Single</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestionAddTab(questionAddTab === 'JSON' ? 'NONE' : 'JSON')}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                    >
                      <FileCode className="w-3 h-3" />
                      <span>Import JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestionAddTab(questionAddTab === 'OCR' ? 'NONE' : 'OCR')}
                      className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>AI OCR Scanner</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuestionAddTab(questionAddTab === 'BANK' ? 'NONE' : 'BANK')}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>From Bank</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Panel: Manual Question Addition */}
                {questionAddTab === 'MANUAL' && (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between font-bold text-blue-900 text-xs">
                      <span>Add New Question Manually</span>
                      <button type="button" onClick={() => setQuestionAddTab('NONE')} className="text-blue-500 hover:text-blue-700">✕</button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Question Statement</label>
                      <input
                        type="text"
                        placeholder="Enter question statement..."
                        value={qText}
                        onChange={(e) => setQText(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Option A</label>
                        <input
                          type="text"
                          placeholder="Option A"
                          value={qOpt0}
                          onChange={(e) => setQOpt0(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Option B</label>
                        <input
                          type="text"
                          placeholder="Option B"
                          value={qOpt1}
                          onChange={(e) => setQOpt1(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Option C</label>
                        <input
                          type="text"
                          placeholder="Option C"
                          value={qOpt2}
                          onChange={(e) => setQOpt2(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Option D</label>
                        <input
                          type="text"
                          placeholder="Option D"
                          value={qOpt3}
                          onChange={(e) => setQOpt3(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Correct Option</label>
                        <select
                          value={qCorrect}
                          onChange={(e) => setQCorrect(Number(e.target.value))}
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-emerald-700"
                        >
                          <option value={0}>Option A (Index 0)</option>
                          <option value={1}>Option B (Index 1)</option>
                          <option value={2}>Option C (Index 2)</option>
                          <option value={3}>Option D (Index 3)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600">Marks</label>
                        <input
                          type="number"
                          value={qMarks}
                          onChange={(e) => setQMarks(Number(e.target.value))}
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddManualQuestion}
                        className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer ml-auto"
                      >
                        Add to Exam
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-Panel: JSON Import */}
                {questionAddTab === 'JSON' && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                      <span>Import Questions via JSON</span>
                      <button type="button" onClick={() => setQuestionAddTab('NONE')} className="text-emerald-500 hover:text-emerald-700">✕</button>
                    </div>

                    <textarea
                      rows={4}
                      placeholder={`[\n  {\n    "question": "What is the capital of France?",\n    "options": ["London", "Paris", "Berlin", "Madrid"],\n    "answer": 1,\n    "marks": 1\n  }\n]`}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-[11px] text-slate-900 focus:outline-none"
                    />

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleImportJson}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs cursor-pointer"
                      >
                        Parse & Append JSON
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-Panel: AI OCR */}
                {questionAddTab === 'OCR' && (
                  <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between font-bold text-purple-900 text-xs">
                      <span className="flex items-center space-x-1">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>AI OCR Question Paper Extractor</span>
                      </span>
                      <button type="button" onClick={() => setQuestionAddTab('NONE')} className="text-purple-500 hover:text-purple-700">✕</button>
                    </div>

                    <p className="text-[11px] text-purple-800">
                      Upload an image photo or PDF page of a printed or handwritten question paper to automatically extract multiple choice questions using Gemini OCR.
                    </p>

                    <label className="flex items-center justify-center border-2 border-dashed border-purple-300 rounded-xl p-3 bg-white hover:bg-purple-50/50 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleOcrFileUpload}
                        disabled={ocrLoading}
                        className="hidden"
                      />
                      <div className="flex items-center space-x-2 text-purple-700 font-bold text-xs">
                        <Upload className="w-4 h-4" />
                        <span>{ocrLoading ? 'Scanning and Extracting Questions...' : 'Upload Image / PDF Photo'}</span>
                      </div>
                    </label>

                    {ocrError && <p className="text-rose-600 text-[11px] font-semibold">{ocrError}</p>}
                  </div>
                )}

                {/* Sub-Panel: Bank Picker */}
                {questionAddTab === 'BANK' && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fade-in max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between font-bold text-amber-900 text-xs">
                      <span>Select from Question Bank</span>
                      <button type="button" onClick={() => setQuestionAddTab('NONE')} className="text-amber-500 hover:text-amber-700">✕</button>
                    </div>

                    {bank.length === 0 ? (
                      <p className="text-[11px] text-amber-700 italic">No questions in question bank. Use Single or JSON import above.</p>
                    ) : (
                      bank.map((q) => {
                        const isAttached = selectedQuestions.some(sq => sq.id === q.id);
                        return (
                          <div key={q.id} className="flex items-center justify-between p-2 bg-white rounded-lg text-[11px] border border-amber-100">
                            <span className="truncate max-w-md text-slate-800 font-medium">{q.question}</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (isAttached) {
                                  setSelectedQuestions(prev => prev.filter(sq => sq.id !== q.id));
                                } else {
                                  setSelectedQuestions(prev => [...prev, q]);
                                }
                              }}
                              className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                                isAttached ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isAttached ? 'Remove' : '+ Add'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Current Questions List */}
                <div className="max-h-40 overflow-y-auto space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  {selectedQuestions.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 italic text-[11px]">
                      No questions attached yet. Use the buttons above to add questions manually, import JSON, or scan via AI OCR.
                    </div>
                  ) : (
                    selectedQuestions.map((q, idx) => (
                      <div key={q.id || idx} className="flex items-center justify-between p-2 bg-white rounded-lg text-[11px] border border-slate-100 shadow-2xs">
                        <div className="truncate max-w-md">
                          <span className="font-bold text-slate-900 mr-1.5">{idx + 1}.</span>
                          <span className="text-slate-800 font-medium">{q.question}</span>
                          <span className="ml-2 text-[10px] text-slate-400">({q.options.length} opts)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedQuestions(prev => prev.filter((_, i) => i !== idx))}
                          className="text-rose-600 hover:text-rose-700 font-bold ml-2 cursor-pointer shrink-0 text-[10px]"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Buttons */}
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Examination
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
