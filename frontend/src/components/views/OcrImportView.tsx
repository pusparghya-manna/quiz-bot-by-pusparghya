import React, { useState } from 'react';
import { ScanText, Upload, Sparkles, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { Question } from '../types';

interface OcrImportViewProps {
  onRefreshQuestionBank: () => void;
  onNavigateToExams: () => void;
}

export const OcrImportView: React.FC<OcrImportViewProps> = ({
  onRefreshQuestionBank,
  onNavigateToExams
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<Question[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setErrorMsg(null);
      setSuccessMsg(null);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => setFilePreviewUrl(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreviewUrl(null);
      }
    }
  };

  const handleProcessOcr = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const base64Data = dataUrl.split(',')[1];

        const res = await fetch('/api/ocr/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType: selectedFile.type || 'image/jpeg'
          })
        });

        const data = await res.json();
        if (res.ok && data.questions) {
          const formatted: Question[] = data.questions.map((q: any, idx: number) => ({
            id: `OCR_${Date.now()}_${idx}`,
            question: q.question || `Question ${idx + 1}`,
            options: q.options || ['A', 'B', 'C', 'D'],
            answer: q.answer !== undefined && q.answer !== null ? Number(q.answer) : null,
            marks: Number(q.marks) || 1,
            negativeMarks: Number(q.negativeMarks) || 0,
            subject: 'Biology'
          }));

          setExtractedQuestions(formatted);
          setSuccessMsg(`Extracted ${formatted.length} questions using Gemini AI! Please review below before confirming.`);
        } else {
          setErrorMsg(data.error || 'Failed to parse questions from image.');
        }
        setLoading(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing file.');
      setLoading(false);
    }
  };

  const handleQuestionChange = (index: number, field: keyof Question, value: any) => {
    setExtractedQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleOptionTextChange = (qIndex: number, oIndex: number, text: string) => {
    setExtractedQuestions(prev => {
      const updated = [...prev];
      const opts = [...updated[qIndex].options];
      opts[oIndex] = text;
      updated[qIndex].options = opts;
      return updated;
    });
  };

  const handleConfirmSave = async () => {
    if (extractedQuestions.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch('/api/questions/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: extractedQuestions })
      });

      if (res.ok) {
        setSuccessMsg(`🎉 Successfully saved ${extractedQuestions.length} OCR-extracted questions to the Question Bank!`);
        setExtractedQuestions([]);
        setSelectedFile(null);
        setFilePreviewUrl(null);
        onRefreshQuestionBank();
      }
    } catch (err) {
      console.error('Failed to save OCR questions:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ScanText className="w-6 h-6 text-indigo-600" />
          Photo / PDF Question Paper OCR Import
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">
          Upload question paper photos or PDFs to extract questions automatically using Gemini AI
        </p>
      </div>

      {/* File Upload Dropzone Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 bg-slate-50 rounded-2xl p-8 text-center transition-all cursor-pointer">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            id="ocr-file-input"
            className="hidden"
          />
          <label htmlFor="ocr-file-input" className="cursor-pointer space-y-3 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {selectedFile ? selectedFile.name : 'Click or drop question paper PDF / Photo'}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Supports PNG, JPEG, WEBP, and PDF documents
              </p>
            </div>
          </label>
        </div>

        {filePreviewUrl && (
          <div className="max-h-48 overflow-hidden rounded-xl border border-slate-200 p-2 bg-slate-50 flex justify-center">
            <img src={filePreviewUrl} alt="Preview" className="max-h-44 object-contain rounded-lg" />
          </div>
        )}

        {selectedFile && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleProcessOcr}
              disabled={loading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Processing via Gemini AI...' : 'Extract Questions with AI OCR'}</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between font-semibold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
            {extractedQuestions.length === 0 && (
              <button
                onClick={onNavigateToExams}
                className="text-xs font-bold text-emerald-700 underline hover:text-emerald-800 cursor-pointer"
              >
                Go to Exams →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Extracted Review Editor Table Bento Card */}
      {extractedQuestions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Teacher Review & Edit ({extractedQuestions.length} Extracted Questions)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Review extracted text, verify correct answer keys, and adjust marks before saving.
              </p>
            </div>

            <button
              onClick={handleConfirmSave}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              Confirm & Save All to Question Bank
            </button>
          </div>

          <div className="space-y-4">
            {extractedQuestions.map((q, qIdx) => (
              <div key={qIdx} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">
                      Question #{qIdx + 1}
                    </label>
                    <textarea
                      rows={2}
                      value={q.question}
                      onChange={(e) => handleQuestionChange(qIdx, 'question', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                  </div>

                  <button
                    onClick={() => setExtractedQuestions(prev => prev.filter((_, i) => i !== qIdx))}
                    className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 rounded-lg cursor-pointer mt-4"
                    title="Remove Question"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Option Editor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {q.options.map((optText, oIdx) => (
                    <div key={oIdx} className="flex items-center space-x-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-mono text-slate-500 text-xs font-bold w-4">
                        {String.fromCharCode(65 + oIdx)}.
                      </span>
                      <input
                        type="text"
                        value={optText}
                        onChange={(e) => handleOptionTextChange(qIdx, oIdx, e.target.value)}
                        className="flex-1 bg-transparent text-xs text-slate-900 focus:outline-none font-medium"
                      />
                    </div>
                  ))}
                </div>

                {/* Answer and Marks selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-600 font-semibold">Correct Option Key</label>
                    <select
                      value={q.answer !== null ? q.answer : -1}
                      onChange={(e) => handleQuestionChange(qIdx, 'answer', e.target.value === '-1' ? null : Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-900 text-xs font-medium"
                    >
                      <option value={-1}>-- Unspecified (null) --</option>
                      <option value={0}>Option A (0)</option>
                      <option value={1}>Option B (1)</option>
                      <option value={2}>Option C (2)</option>
                      <option value={3}>Option D (3)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-600 font-semibold">Marks (+)</label>
                    <input
                      type="number"
                      value={q.marks}
                      onChange={(e) => handleQuestionChange(qIdx, 'marks', Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-900 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-600 font-semibold">Negative Marks (-)</label>
                    <input
                      type="number"
                      value={q.negativeMarks}
                      onChange={(e) => handleQuestionChange(qIdx, 'negativeMarks', Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-slate-900 text-xs font-medium"
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>

        </div>
      )}

    </div>
  );
};

