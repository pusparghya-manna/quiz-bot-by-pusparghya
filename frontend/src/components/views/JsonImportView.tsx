import React, { useState } from 'react';
import { FileJson, CheckCircle2, AlertTriangle } from 'lucide-react';

interface JsonImportViewProps {
  onRefreshQuestionBank: () => void;
  onNavigateToExams: () => void;
}

export const JsonImportView: React.FC<JsonImportViewProps> = ({
  onRefreshQuestionBank,
  onNavigateToExams
}) => {
  const sampleJson = JSON.stringify(
    {
      questions: [
        {
          question: "Which cell structure contains the cell's genetic material and controls its activities?",
          options: ["Cytoplasm", "Nucleus", "Cell Membrane", "Mitochondria"],
          answer: 1,
          marks: 1,
          negativeMarks: 0,
          subject: "Biology"
        },
        {
          question: "What is the SI unit of Force?",
          options: ["Joule", "Pascal", "Newton", "Watt"],
          answer: 2,
          marks: 1,
          negativeMarks: 0.25,
          subject: "Physics"
        }
      ]
    },
    null,
    2
  );

  const [jsonText, setJsonText] = useState(sampleJson);
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleValidateAndPreview = () => {
    setValidationError(null);
    setImportSuccessMsg(null);

    try {
      const parsed = JSON.parse(jsonText);
      let list = parsed.questions || parsed;

      if (!Array.isArray(list)) {
        setValidationError('Invalid format: Top level must contain a "questions" array or be an array of question objects.');
        setParsedQuestions([]);
        return;
      }

      // Check structure of each question
      const invalidItems: string[] = [];
      list.forEach((item: any, idx: number) => {
        if (!item.question || typeof item.question !== 'string') {
          invalidItems.push(`Item #${idx + 1}: missing "question" text.`);
        }
        if (!Array.isArray(item.options) || item.options.length < 2) {
          invalidItems.push(`Item #${idx + 1}: "options" must be an array with at least 2 choices.`);
        }
      });

      if (invalidItems.length > 0) {
        setValidationError(`Validation Warnings:\n${invalidItems.join('\n')}`);
      }

      setParsedQuestions(list);
    } catch (err: any) {
      setValidationError(`JSON Syntax Error: ${err.message}`);
      setParsedQuestions([]);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedQuestions.length === 0) return;
    setLoading(true);
    setImportSuccessMsg(null);

    try {
      const res = await fetch('/api/questions/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: parsedQuestions })
      });

      const data = await res.json();
      if (res.ok) {
        setImportSuccessMsg(`🎉 Successfully imported ${data.count} questions into the Central Question Bank!`);
        setParsedQuestions([]);
        onRefreshQuestionBank();
      } else {
        setValidationError(data.error || 'Failed to import questions.');
      }
    } catch (err: any) {
      setValidationError(`Server error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <FileJson className="w-6 h-6 text-blue-600" />
          JSON Question Importer
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">
          Import structured JSON question paper data with automated validation and live preview
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Editor Column Bento Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">JSON Payload Editor</h3>
            <button
              onClick={() => setJsonText(sampleJson)}
              className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
            >
              Load Sample Template
            </button>
          </div>

          <textarea
            rows={14}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full bg-slate-50 font-mono text-xs text-slate-800 border border-slate-200 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleValidateAndPreview}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Validate & Preview JSON
            </button>
          </div>

          {validationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs whitespace-pre-wrap flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>{validationError}</div>
            </div>
          )}

          {importSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between font-semibold">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{importSuccessMsg}</span>
              </div>
              <button
                onClick={onNavigateToExams}
                className="text-xs font-bold text-emerald-700 underline hover:text-emerald-800 cursor-pointer"
              >
                Create Exam →
              </button>
            </div>
          )}
        </div>

        {/* Live Preview Column Bento Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Live Question Preview ({parsedQuestions.length})
              </h3>
              {parsedQuestions.length > 0 && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  VALID JSON
                </span>
              )}
            </div>

            {parsedQuestions.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-2">
                <FileJson className="w-10 h-10 text-slate-300" />
                <p className="max-w-xs font-medium">Click "Validate & Preview JSON" to inspect parsed question structures before confirming save.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                {parsedQuestions.map((q, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs space-y-2">
                    <div className="font-bold text-slate-900">
                      {idx + 1}. {q.question}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700">
                      {q.options?.map((opt: string, oIdx: number) => (
                        <div
                          key={oIdx}
                          className={`p-1.5 rounded-lg border ${
                            q.answer === oIdx
                              ? 'bg-emerald-100 border-emerald-300 text-emerald-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {String.fromCharCode(65 + oIdx)}. {opt}
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1 flex justify-between font-semibold">
                      <span>Marks: +{q.marks || 1} | Neg: -{q.negativeMarks || 0}</span>
                      <span>Subject: {q.subject || 'General'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Confirm Save Button */}
          {parsedQuestions.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={handleConfirmImport}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Save {parsedQuestions.length} Questions to Question Bank</span>
              </button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

