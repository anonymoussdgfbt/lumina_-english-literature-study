import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Search, 
  Send, 
  ChevronRight, 
  Sparkles, 
  Languages, 
  BookMarked, 
  MessageSquare,
  X,
  Loader2,
  ArrowRight,
  Quote,
  FileDown,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  analyzeText, 
  getVocabularyExplanation, 
  chatWithAI, 
  analyzeImitation,
  extractTextFromImage,
  type AnalysisResult 
} from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface HistoryItem {
  book: string;
  author: string;
}

export default function App() {
  const [book, setBook] = useState(() => localStorage.getItem('lumina_book') || '');
  const [author, setAuthor] = useState(() => localStorage.getItem('lumina_author') || '');
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [imitationInputs, setImitationInputs] = useState<Record<number, string>>({});
  const [imitationFeedbacks, setImitationFeedbacks] = useState<Record<number, string>>({});
  const [isAnalyzingImitation, setIsAnalyzingImitation] = useState<Record<number, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        setShowChat(false);
      }
    };

    if (showChat) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChat]);

  useEffect(() => {
    localStorage.setItem('lumina_book', book);
  }, [book]);

  useEffect(() => {
    localStorage.setItem('lumina_author', author);
  }, [author]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) {
        setLeftWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsAnalyzing(true);
    setImitationInputs({});
    setImitationFeedbacks({});
    setIsAnalyzingImitation({});
    try {
      const analysis = await analyzeText(book, author, text);
      setResult(analysis);
      setChatHistory([]); // Reset chat for new analysis
    } catch (error: any) {
      console.error('Analysis failed:', error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('API_KEY') || errorMsg.includes('GEMINI_API_KEY_MISSING')) {
        alert('API Key 尚未就绪。请刷新页面重试，或者稍等片刻让平台完成自动配置。');
      } else {
        alert(`分析失败: ${errorMsg || '未知错误'}。请尝试刷新页面或稍后再试。`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatting(true);

    try {
      const historyParts = chatHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));
      const response = await chatWithAI(historyParts, userMsg);
      setChatHistory(prev => [...prev, { role: 'model', text: response || '' }]);
    } catch (error: any) {
      console.error('Chat failed:', error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('API_KEY') || errorMsg.includes('GEMINI_API_KEY_MISSING')) {
        setChatHistory(prev => [...prev, { role: 'model', text: 'API Key 尚未就绪。请刷新页面重试。' }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'model', text: `对话失败: ${errorMsg || '未知错误'}。` }]);
      }
    } finally {
      setIsChatting(false);
    }
  };

  const handleOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;
      
      const extractedText = await extractTextFromImage(base64, file.type);
      if (extractedText) {
        setText(prev => prev ? `${prev}\n\n${extractedText}` : extractedText);
      }
    } catch (error) {
      console.error('OCR failed:', error);
      alert('文字识别失败，请重试。');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImitationSubmit = async (idx: number, formula: string, scenario: string) => {
    const input = imitationInputs[idx];
    if (!input?.trim()) return;

    setIsAnalyzingImitation(prev => ({ ...prev, [idx]: true }));
    try {
      const feedback = await analyzeImitation(formula, scenario, input);
      setImitationFeedbacks(prev => ({ ...prev, [idx]: feedback }));
    } catch (error: any) {
      console.error('Imitation analysis failed:', error);
      setImitationFeedbacks(prev => ({ ...prev, [idx]: '分析失败，请重试。' }));
    } finally {
      setIsAnalyzingImitation(prev => ({ ...prev, [idx]: false }));
    }
  };

  const handleExportPDF = async () => {
    if (!resultRef.current || !result) return;
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');

      const element = resultRef.current;
      
      // Ensure fonts are ready
      await document.fonts.ready;

      // Temporary style changes to capture full content
      const originalStyle = element.style.cssText;
      element.style.width = '1200px'; // Fixed width for consistent export
      element.style.height = 'auto';
      element.style.overflow = 'visible';

      const canvas = await html2canvas(element, {
        scale: 1.5, // Reduced scale for better compatibility
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FBFBF9',
        logging: false,
        onclone: (clonedDoc) => {
          // Find the sticky elements and fix them
          const stickies = clonedDoc.querySelectorAll('.lg\\:sticky');
          stickies.forEach((s: any) => {
            s.style.position = 'relative';
            s.style.top = '0';
            s.style.height = 'auto';
            s.style.overflow = 'visible';
            s.style.width = '100%';
          });

          // Fix split layout to be vertical for PDF
          const splitPanes = clonedDoc.querySelectorAll('.lg\\:flex-row');
          splitPanes.forEach((p: any) => {
            p.style.flexDirection = 'column';
          });
          
          const panes = clonedDoc.querySelectorAll('.lg\\:w-\\[var\\(--left-width\\)\\]');
          panes.forEach((p: any) => {
            p.style.width = '100%';
          });

          // Ensure all content is visible
          const container = clonedDoc.querySelector('.w-full') as HTMLElement;
          if (container) {
            container.style.height = 'auto';
            container.style.overflow = 'visible';
          }
        }
      });

      // Restore original style
      element.style.cssText = originalStyle;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Simple multi-page support
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `Lumina-${book.replace(/[^a-z0-9]/gi, '_') || 'Analysis'}.pdf`;
      
      // Use Blob and anchor for more reliable download in sandboxed iframes
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error('PDF export failed:', error);
      alert('导出 PDF 失败。如果是在预览窗口中，请尝试点击右上角的“在新标签页打开”后再试，或者检查浏览器是否拦截了下载。');
    } finally {
      setIsExporting(false);
    }
  };

  const renderTextWithHighlights = (content: string) => {
    if (!result) return content;

    const sortedChunks = [...result.semanticChunks].sort((a, b) => b.chunk.length - a.chunk.length);
    const chunkPatterns = sortedChunks.map(c => c.chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    
    if (!chunkPatterns) return content;

    const regex = new RegExp(`(${chunkPatterns})`, 'gi');
    const parts = content.split(regex);

    return parts.map((part, idx) => {
      const isChunk = sortedChunks.some(c => c.chunk.toLowerCase() === part.toLowerCase());
      
      if (isChunk) {
        return (
          <span key={idx} className="bg-accent/20 border-b-2 border-accent/40 font-medium px-0.5 rounded">
            {part}
          </span>
        );
      }

      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-ink/10 bg-paper/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-paper">
              <BookOpen size={20} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Lumina</h1>
          </div>
          <div className="flex items-center gap-4">
            {result && (
              <button 
                onClick={handleExportPDF}
                disabled={isExporting}
                className="flex items-center gap-2 text-sm font-medium text-ink/60 hover:text-accent transition-colors disabled:opacity-50"
              >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Export PDF
              </button>
            )}
            {result && (
              <button 
                onClick={() => {
                  setResult(null);
                  setText('');
                }}
                className="text-sm font-medium text-accent hover:underline"
              >
                Next Page
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        <AnimatePresence mode="wait">
          {!result ? (
            <div className="max-w-7xl mx-auto px-6 py-12">
              <motion.div 
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl mx-auto"
              >
                <div className="text-center mb-12">
                  <h2 className="text-6xl font-serif font-medium mb-4 italic tracking-tight">Deep Reading.</h2>
                  <p className="text-ink/60 text-lg">Master English literature with AI-powered linguistic intuition.</p>
                </div>

                <form onSubmit={handleAnalyze} className="space-y-6 bg-white p-8 rounded-3xl shadow-xl border border-ink/5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/40">Book Title</label>
                      <input 
                        value={book}
                        onChange={e => setBook(e.target.value)}
                        placeholder="e.g. The Great Gatsby"
                        className="w-full bg-paper border border-ink/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/40">Author</label>
                      <input 
                        value={author}
                        onChange={e => setAuthor(e.target.value)}
                        placeholder="e.g. F. Scott Fitzgerald"
                        className="w-full bg-paper border border-ink/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-ink/40">Original Text (Full Page)</label>
                      <div className="flex gap-2">
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleOcr}
                          accept="image/*"
                          className="hidden"
                          capture="environment"
                        />
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isScanning}
                          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-accent hover:opacity-70 transition-opacity disabled:opacity-50"
                        >
                          {isScanning ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                          Scan Text
                        </button>
                      </div>
                    </div>
                    <textarea 
                      value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Paste the passage or scan from a book..."
                      className="w-full h-64 bg-paper border border-ink/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all resize-none serif text-lg leading-relaxed"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isAnalyzing || !text.trim()}
                    className="w-full bg-accent text-paper py-5 rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-accent/20"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Analyzing Nuances...
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        Begin Deep Study
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          ) : (
            <motion.div 
              key="result"
              ref={resultRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full"
            >
              {/* Top Section: Split View */}
              <div 
                className="flex flex-col lg:flex-row min-h-screen border-b border-ink/10 relative"
                style={{ '--left-width': `${leftWidth}%` } as any}
              >
                {/* Left: Original Text (Sticky/Fixed on Desktop) */}
                <section 
                  className="lg:w-[var(--left-width)] bg-paper p-8 lg:p-16 lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] overflow-y-auto border-r border-ink/5"
                >
                  <div className="max-w-xl mx-auto">
                    <div className="flex items-center gap-3 text-accent mb-8">
                      <Quote size={32} />
                      <span className="text-xs font-bold uppercase tracking-[0.2em]">Original Passage</span>
                    </div>
                    <div className="serif text-xl leading-[1.8] text-ink/90 whitespace-pre-wrap selection:bg-accent/20">
                      {renderTextWithHighlights(text)}
                    </div>
                    <div className="mt-12 pt-8 border-t border-ink/10 flex flex-col gap-4">
                      <div className="text-sm text-ink/40">
                        <span className="font-serif italic text-xl text-ink/80 block mb-1">{book}</span>
                        <span className="uppercase tracking-widest font-bold">by {author}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {result.sceneTags.map(tag => (
                          <span key={tag} className="px-3 py-1 bg-ink/5 text-ink/60 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Resize Handle */}
                <div 
                  className="hidden lg:block absolute top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/30 active:bg-accent transition-colors z-50 group"
                  style={{ left: `${leftWidth}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={() => setIsResizing(true)}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-12 bg-white border border-ink/10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    <div className="w-0.5 h-4 bg-ink/20 rounded-full mx-0.5" />
                    <div className="w-0.5 h-4 bg-ink/20 rounded-full mx-0.5" />
                  </div>
                </div>

                {/* Right: Semantic Chunks + Upgrading */}
                <section className="flex-1 bg-white p-8 lg:p-16">
                  <div className="max-w-xl mx-auto space-y-12">
                    <div className="flex items-center gap-3 mb-8">
                      <BookMarked className="text-accent" size={32} />
                      <h3 className="text-3xl font-serif italic tracking-tight">Semantic Chunks & Upgrading</h3>
                    </div>
                    <div className="space-y-12">
                      {result.semanticChunks.map((item, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="group"
                        >
                          <div className="flex items-start gap-4 mb-4">
                            <span className="font-mono text-accent text-sm font-bold opacity-30 mt-1">0{i + 1}</span>
                            <div className="flex-1">
                              <h4 className="text-xl font-medium text-ink mb-4 group-hover:text-accent transition-colors">
                                {item.chunk}
                              </h4>
                              
                              <div className="grid grid-cols-1 gap-4">
                                <div className="bg-paper/50 p-6 rounded-2xl border border-ink/5 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-ink/10" />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink/30 mb-2 block">Mediocre Expression</span>
                                  <p className="text-ink/60 italic leading-relaxed">{item.upgrading.mediocre}</p>
                                </div>
                                
                                <div className="bg-accent p-6 rounded-2xl shadow-lg shadow-accent/10 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-paper/20" />
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-paper/40 mb-2 block">Upgraded Expression</span>
                                  <p className="text-paper text-lg font-medium leading-tight">{item.upgrading.upgraded}</p>
                                </div>
                                
                                <div className="px-2 text-[11px] text-ink/40 leading-relaxed italic">
                                  {item.upgrading.explanation}
                                </div>
                              </div>
                            </div>
                          </div>
                          {i < result.semanticChunks.length - 1 && (
                            <div className="h-px bg-ink/5 w-full mt-12" />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              {/* Bottom Section: Linear Flow */}
              <div className="bg-paper/30">
                <div className="max-w-5xl mx-auto px-6 py-24 space-y-32">
                  
                  {/* 1. Native Intuition */}
                  <section className="space-y-8">
                    <div className="flex items-center gap-4 border-b border-ink/10 pb-4">
                      <span className="font-mono text-accent font-bold">01</span>
                      <h3 className="text-4xl font-serif italic tracking-tight">Native Intuition</h3>
                    </div>
                    <div className="bg-white p-12 rounded-[40px] border border-ink/5 shadow-xl">
                      <div className="text-ink/80 text-xl leading-[1.8] serif markdown-body">
                        <Markdown>{result.nativeIntuition}</Markdown>
                      </div>
                    </div>
                  </section>

                  {/* 2. Universal Formulas & Practice */}
                  <section className="space-y-16">
                    <div className="flex items-center gap-4 border-b border-ink/10 pb-4">
                      <span className="font-mono text-accent font-bold">02</span>
                      <h3 className="text-4xl font-serif italic tracking-tight">Universal Formulas & Practice</h3>
                    </div>
                    
                    <div className="space-y-24">
                      {result.universalFormulas.map((f, i) => (
                        <div key={i} className="space-y-12">
                          {/* Formula Header */}
                          <div className="flex flex-col md:flex-row gap-8 items-start">
                            <div className="flex-1 space-y-6">
                              <div className="inline-block px-4 py-1 bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest rounded-full">
                                Formula Structure
                              </div>
                              <div className="font-mono text-3xl text-ink tracking-tighter bg-white p-8 rounded-3xl border border-ink/10 shadow-sm break-words">
                                {f.formula}
                              </div>
                              <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-ink/30">Original Context</span>
                                <p className="text-ink/60 italic serif text-lg leading-relaxed">"{f.originalSentence}"</p>
                              </div>
                            </div>

                            <div className="w-full md:w-80 space-y-6">
                              <div className="bg-white p-6 rounded-3xl border border-ink/5 shadow-sm">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-accent mb-3 block">Reverse Translation</span>
                                <p className="text-xl font-serif italic text-ink/80 mb-3 leading-tight">
                                  {f.reverseTranslation.chinese}
                                </p>
                                <p className="text-[10px] text-ink/40 leading-relaxed bg-paper p-3 rounded-xl">
                                  {f.reverseTranslation.instructions}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Imitation Example */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white p-8 rounded-3xl border border-ink/5 shadow-sm">
                              <div className="flex items-center gap-2 mb-6">
                                <Sparkles size={18} className="text-accent" />
                                <h4 className="text-sm font-bold uppercase tracking-widest text-ink/40">Imitation Example</h4>
                              </div>
                              <p className="text-xl text-ink/80 italic serif leading-relaxed mb-6">
                                {f.imitation.exampleSentence}
                              </p>
                              <div className="pt-4 border-t border-ink/5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-accent/60 mb-1 block">Logic Applied</span>
                                <p className="text-xs font-mono text-ink/40">{f.imitation.formulaUsed}</p>
                              </div>
                            </div>

                            {/* Interactive Area */}
                            <div className="bg-accent p-8 rounded-3xl shadow-2xl shadow-accent/20 text-paper">
                              <h4 className="text-sm font-bold uppercase tracking-widest text-paper/60 mb-4">Your Turn to Imitate</h4>
                              <p className="text-paper/80 text-sm mb-6 leading-relaxed">
                                <span className="font-bold text-paper">Scenario:</span> {f.imitation.scenario}
                              </p>
                              <textarea 
                                value={imitationInputs[i] || ''}
                                onChange={e => setImitationInputs(prev => ({ ...prev, [i]: e.target.value }))}
                                placeholder="Apply the formula here..."
                                className="w-full h-32 bg-paper/10 border border-paper/20 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-paper/40 transition-all resize-none text-paper placeholder:text-paper/30 mb-4"
                              />
                              <button 
                                onClick={() => handleImitationSubmit(i, f.formula, f.imitation.scenario)}
                                disabled={isAnalyzingImitation[i] || !imitationInputs[i]?.trim()}
                                className="w-full py-4 bg-paper text-accent rounded-xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-paper/90 transition-all disabled:opacity-50"
                              >
                                {isAnalyzingImitation[i] ? (
                                  <>
                                    <Loader2 className="animate-spin" size={18} />
                                    Analyzing...
                                  </>
                                ) : (
                                  <>
                                    <Send size={18} />
                                    Submit for Analysis
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Feedback Area */}
                          {imitationFeedbacks[i] && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-white p-8 rounded-3xl border-2 border-accent/20 shadow-xl"
                            >
                              <div className="flex items-center gap-2 mb-6">
                                <MessageSquare size={20} className="text-accent" />
                                <h5 className="text-sm font-bold uppercase tracking-widest text-accent">AI Feedback & Refinement</h5>
                              </div>
                              <div className="markdown-body prose prose-ink max-w-none">
                                <Markdown>{imitationFeedbacks[i]}</Markdown>
                              </div>
                            </motion.div>
                          )}
                          
                          {i < result.universalFormulas.length - 1 && (
                            <div className="h-px bg-ink/10 w-full" />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Lexicon Modal Removed */}

      {/* Floating Chat Button */}
      {result && (
        <div data-html2canvas-ignore="true" className="fixed bottom-8 right-8 z-[90] flex flex-col items-end gap-4">
          <AnimatePresence>
            {showChat && (
              <motion.div 
                ref={chatRef}
                initial={{ opacity: 0, scale: 0.8, y: 20, transformOrigin: 'bottom right' }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className="w-[380px] h-[500px] bg-white rounded-3xl shadow-2xl border border-ink/10 overflow-hidden flex flex-col"
              >
                <div className="p-4 border-b border-ink/5 bg-accent text-paper flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={18} />
                    <span className="font-semibold">Gemini Assistant</span>
                  </div>
                  <button onClick={() => setShowChat(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-paper/30">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-12 px-6">
                      <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="text-accent" size={24} />
                      </div>
                      <p className="text-sm text-ink/60 font-medium mb-1">Deepen your understanding</p>
                      <p className="text-xs text-ink/40">Ask about style, context, or specific grammar points in this passage.</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "max-w-[85%] p-3 rounded-2xl text-sm",
                        msg.role === 'user' 
                          ? "bg-accent text-paper ml-auto rounded-tr-none shadow-md" 
                          : "bg-white text-ink mr-auto rounded-tl-none border border-ink/5 shadow-sm"
                      )}
                    >
                      <div className="markdown-body">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="bg-white text-ink mr-auto rounded-2xl rounded-tl-none border border-ink/5 p-3 shadow-sm">
                      <Loader2 className="animate-spin text-accent" size={16} />
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-4 border-t border-ink/5 bg-white flex gap-2">
                  <input 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask anything..."
                    className="flex-1 bg-paper border border-ink/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                  <button 
                    disabled={isChatting || !chatInput.trim()}
                    className="w-10 h-10 bg-accent text-paper rounded-xl flex items-center justify-center disabled:opacity-50 shadow-md hover:opacity-90 transition-all"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
              showChat ? "bg-white text-accent border border-accent" : "bg-accent text-paper"
            )}
          >
            {showChat ? <X size={28} /> : <MessageSquare size={28} />}
          </motion.button>
        </div>
      )}

      {/* Footer */}
      <footer className="py-8 border-t border-ink/5 text-center text-ink/30 text-xs">
        <p>© 2026 Lumina Literary Study. Powered by Gemini.</p>
      </footer>
    </div>
  );
}
