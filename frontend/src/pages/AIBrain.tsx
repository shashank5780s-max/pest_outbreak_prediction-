import React, { useState, useRef, useEffect } from "react";
import { Upload, Loader, Brain, AlertCircle, TrendingUp, Send, Info } from "lucide-react";
import { sendChatMessage, analyzeLeafImage, LeafAnalysisResponse } from "../api/service";

export const AIBrain: React.FC = () => {
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatMessages, setChatMessages] = useState<{role: "user" | "assistant", text: string}[]>([
    { role: "assistant", text: "Hello! I am the AgriPredict AI Assistant. How can I help you with pest management today?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [leafResult, setLeafResult] = useState<LeafAnalysisResponse | null>(null);
  const [leafError, setLeafError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await sendChatMessage(userMessage);
      setChatMessages(prev => [...prev, { role: "assistant", text: res.response }]);
    } catch {
      setChatMessages(prev => [...prev, {
        role: "assistant",
        text: "Sorry, I am having trouble connecting to the AI service right now. Please try again."
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setScanning(true);
    setLeafResult(null);
    setLeafError(null);

    try {
      const result = await analyzeLeafImage(file);
      setLeafResult(result);
    } catch {
      setLeafError("Failed to analyze the leaf image. Please check your connection and try again.");
    } finally {
      setScanning(false);
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-cyan-600 text-xs font-semibold mb-2">
          <Brain className="w-4 h-4" />
          AI ANALYSIS ENGINE
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Brain</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
            <span className="text-sm text-gray-600 font-medium">POWERED BY OPENAI VISION</span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1 text-xs text-blue-500">
            <Info className="w-3 h-3" />
            <span>Results labeled "Demo Mode" when AI key is not configured</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* AI Assistant Chat */}
        <div className="col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-96">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></span>
              <h3 className="font-semibold text-gray-900">AgriPredict Assistant</h3>
            </div>
            <p className="text-xs text-gray-500">AI-POWERED AGRICULTURAL ADVISOR</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-lg p-3 max-w-xs ${msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-blue-50 text-gray-800'}`}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-blue-50 rounded-lg p-3 max-w-xs">
                  <Loader className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleChatSubmit} className="border-t border-gray-100 p-4 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about pest management..."
              className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="submit" disabled={chatLoading} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Main Content */}
        <div className="col-span-2">
          {/* Leaf Image Scanner */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">LEAF IMAGE SCANNER</h3>
              <p className="text-sm text-gray-600">Upload a leaf photo to analyze pest risk using AI vision analysis</p>
            </div>

            <div
              onClick={triggerFileInput}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center">
                  <Loader className="w-8 h-8 text-green-600 animate-spin mb-3" />
                  <p className="text-sm text-gray-600">Analyzing image with AI...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400 mb-3" />
                  <p className="text-gray-700 font-medium mb-1">Click to upload or drag a leaf photo</p>
                  <p className="text-xs text-gray-500">Supported: JPG, PNG formats</p>
                </div>
              )}
            </div>

            {/* Error state */}
            {leafError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Analysis Failed</p>
                  <p className="text-xs text-red-600 mt-1">{leafError}</p>
                </div>
              </div>
            )}

            <div className="mt-6 grid grid-cols-4 gap-4">
              <ResultBox
                title="PATHOLOGY STATUS"
                value={scanning ? "SCANNING..." : (leafResult?.pathology || "READY")}
                icon={scanning ? Loader : AlertCircle}
                color={scanning ? "blue" : (leafResult?.pathology === 'CRITICAL' ? 'red' : 'green')}
              />
              <ResultBox
                title="CHLOROPHYLL"
                value={scanning ? "ANALYZING..." : (leafResult?.chlorophyll || "—")}
                icon={Loader}
                color="blue"
              />
              <ResultBox
                title="PEST PROBABILITY"
                value={scanning ? "CALCULATING..." : (leafResult?.probability || "0%")}
                icon={TrendingUp}
                color={scanning ? "blue" : "gray"}
              />
              <ResultBox
                title="CONFIDENCE"
                value={scanning ? "..." : (leafResult?.confidence || "0%")}
                icon={TrendingUp}
                color="gray"
              />
            </div>
          </div>

          {/* Neural Scan Visualization */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">AI DIAGNOSTIC VISUALIZATION</h3>
              {scanning && <span className="inline-block w-3 h-3 bg-green-600 rounded-full animate-pulse"></span>}
            </div>

            <div className="bg-gray-100 rounded-lg min-h-[16rem] flex items-center justify-center p-6 relative overflow-hidden">
              {imagePreview ? (
                <div className="flex gap-8 w-full">
                  <div className="w-1/3 relative">
                    <img src={imagePreview} alt="Uploaded leaf" className="w-full h-auto rounded-lg shadow-md object-cover" />
                    {scanning && (
                      <div className="absolute inset-0 bg-blue-500/20 animate-pulse rounded-lg border-2 border-blue-400">
                        <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 animate-[scan_2s_ease-in-out_infinite]"></div>
                      </div>
                    )}
                  </div>
                  <div className="w-2/3">
                    {scanning ? (
                      <div className="flex flex-col items-center justify-center h-full space-y-4">
                        <Brain className="w-12 h-12 text-blue-500 animate-pulse" />
                        <p className="text-blue-600 font-medium animate-pulse">Running AI Analysis...</p>
                      </div>
                    ) : leafResult ? (
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 h-full overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-50">
                          <div className="p-2 bg-green-50 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">AI Diagnostic Report</h4>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">
                                {leafResult.demo_mode ? "Demo Mode" : "Live AI Analysis"}
                              </p>
                              {leafResult.demo_mode && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full border border-amber-200 uppercase tracking-wider">
                                  SIMULATED RESULT
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-gray-700 text-sm leading-relaxed space-y-4">
                          {leafResult.message.split('\n\n').map((paragraph, idx) => {
                            if (paragraph.startsWith('**Organic Control:**')) {
                              return (
                                <div key={idx} className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                                  <span className="font-bold text-emerald-800 block mb-1">🌿 Organic Strategy</span>
                                  {paragraph.replace('**Organic Control:**', '').trim()}
                                </div>
                              );
                            }
                            if (paragraph.startsWith('**Inorganic Control:**')) {
                              return (
                                <div key={idx} className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50">
                                  <span className="font-bold text-blue-800 block mb-1">🧪 Chemical Strategy</span>
                                  {paragraph.replace('**Inorganic Control:**', '').trim()}
                                </div>
                              );
                            }
                            return <p key={idx} className="text-gray-600 italic">{paragraph}</p>;
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Brain className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-50" />
                  <p className="text-gray-500 text-sm">Upload a leaf image to see AI diagnostic analysis</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultBoxProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const ResultBox: React.FC<ResultBoxProps> = ({ title, value, color }) => {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    gray: "text-gray-600 bg-gray-50",
    red: "text-red-600 bg-red-50",
  };

  return (
    <div className={`p-4 rounded-lg ${colorClasses[color as keyof typeof colorClasses] ?? colorClasses.gray}`}>
      <p className="text-xs font-semibold mb-2">{title}</p>
      <div className="flex items-end gap-2">
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
};

export default AIBrain;
