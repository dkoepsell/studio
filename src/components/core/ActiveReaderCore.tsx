
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Lightbulb, Edit3, MessageSquare, Sparkles, FileText, Trash2, Highlighter, StickyNote,
  CheckCircle, AlertTriangle, MessageCircleQuestion, KeyRound, BookMarked, Link2, HelpCircle, UploadCloud, Loader2
} from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getAiAnnotationGuideAction, getAiSummaryFeedbackAction, getAiAnnotationFeedbackAction } from '@/app/actions';
import AiHelperCard from './AiHelperCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '../ui/input';
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';


// Define annotation types with their properties
const annotationDefinitions = {
  highlight: { label: 'Highlight', abbreviation: 'HL', colorClass: 'bg-yellow-400/40', icon: Highlighter, requiresNote: false },
  'main-idea': { label: 'Main Idea', abbreviation: 'MI', colorClass: 'bg-blue-500/30', icon: BookMarked, requiresNote: false },
  'key-term': { label: 'Key Term', abbreviation: 'KT', colorClass: 'bg-green-500/30', icon: KeyRound, requiresNote: false },
  evidence: { label: 'Evidence', abbreviation: 'EV', colorClass: 'bg-indigo-500/30', icon: FileText, requiresNote: false },
  question: { label: 'Question', abbreviation: 'Q', colorClass: 'bg-purple-500/30', icon: HelpCircle, requiresNote: true },
  connection: { label: 'Connection', abbreviation: 'CON', colorClass: 'bg-orange-500/30', icon: Link2, requiresNote: true },
  'custom-note': { label: 'Note', abbreviation: 'N', colorClass: 'bg-gray-500/30', icon: StickyNote, requiresNote: true },
} as const;

type AnnotationDisplayType = keyof typeof annotationDefinitions;

interface Annotation {
  id: string;
  start: number;
  end: number;
  text: string; // The selected text
  type: AnnotationDisplayType;
  note?: string; // User's custom textual note
}

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

// Helper type for the editing annotation state
type EditingAnnotationPayload = {
  id: 'new-note'; // Indicates a new annotation being created
  start: number;
  end: number;
  text: string;
  type: AnnotationDisplayType;
};


export default function ActiveReaderCore() {
  const [originalText, setOriginalText] = useState<string>("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentSelection, setCurrentSelection] = useState<SelectionRange | null>(null);
  const [showAnnotationToolbar, setShowAnnotationToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [annotationNote, setAnnotationNote] = useState(""); // For new notes
  const [editingAnnotation, setEditingAnnotation] = useState<EditingAnnotationPayload | null>(null);


  const [summaryText, setSummaryText] = useState<string>("");
  const [aiAnnotationGuide, setAiAnnotationGuide] = useState<string | null>(null);
  const [aiSummaryFeedback, setAiSummaryFeedback] = useState<string | null>(null);
  const [aiAnnotationFeedback, setAiAnnotationFeedback] = useState<string | null>(null);

  const [isLoadingAiGuide, setIsLoadingAiGuide] = useState<boolean>(false);
  const [isLoadingAiSummaryFeedback, setIsLoadingAiSummaryFeedback] = useState<boolean>(false);
  const [isLoadingAiAnnotationFeedback, setIsLoadingAiAnnotationFeedback] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  
  const textDisplayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Configure PDF.js worker. Using a CDN for simplicity.
    // For local hosting, copy 'pdf.worker.min.mjs' from 'node_modules/pdfjs-dist/build/' to '/public'
    // and set GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;
  }, []);

  const resetAppStateForNewText = () => {
    setAnnotations([]);
    setSummaryText("");
    setAiAnnotationGuide(null);
    setAiSummaryFeedback(null);
    setAiAnnotationFeedback(null);
    setCurrentSelection(null);
    setShowAnnotationToolbar(false);
    setEditingAnnotation(null);
  };

  const handleTextPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    setOriginalText(pastedText);
    resetAppStateForNewText();
    toast({ title: "Text Pasted", description: "You can now start reading and annotating." });
  };

  const handleManualTextChange = (newText: string) => {
    setOriginalText(newText);
    resetAppStateForNewText();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsFileLoading(true);
      resetAppStateForNewText();
      toast({ title: "Loading File", description: `Processing ${file.name}...` });

      try {
        if (file.type === "text/plain") {
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = e.target?.result as string;
            setOriginalText(text);
            toast({ title: "File Loaded", description: `${file.name} has been loaded.` });
            setIsFileLoading(false);
          };
          reader.onerror = () => {
            toast({ title: "File Read Error", description: "Could not read the selected .txt file.", variant: "destructive" });
            setIsFileLoading(false);
          };
          reader.readAsText(file);
        } else if (file.type === "application/pdf") {
          const arrayBuffer = await file.arrayBuffer();
          const pdf: PDFDocumentProxy = await getDocument({ data: arrayBuffer }).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n"; // basic text extraction
          }
          setOriginalText(fullText);
          toast({ title: "PDF Loaded", description: `${file.name} has been processed and text extracted.` });
          setIsFileLoading(false);
        } else {
          toast({ title: "Unsupported File Type", description: "Please upload a .txt or .pdf file.", variant: "destructive" });
          setIsFileLoading(false);
        }
      } catch (error) {
        console.error("Error processing file:", error);
        toast({ title: "File Processing Error", description: `Could not process ${file.name}. It might be corrupted or an unsupported format.`, variant: "destructive" });
        setIsFileLoading(false);
      }
      
      // Reset file input value to allow re-uploading the same file if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  const handleTextSelection = () => {
    if (!textDisplayRef.current || isFileLoading) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const container = textDisplayRef.current;

      if (!container.contains(range.commonAncestorContainer) || 
          (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE && !(range.commonAncestorContainer as Element).closest('[data-text-display-area]'))) {
        setShowAnnotationToolbar(false);
        if (!editingAnnotation) {
            setCurrentSelection(null);
        }
        return;
      }
      
      const preSelectionRange = document.createRange();
      preSelectionRange.selectNodeContents(container);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      const end = start + range.toString().length;

      if (start >= 0 && end >= start && range.toString().trim() !== "") {
        setCurrentSelection({ start, end, text: range.toString() });
        
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setToolbarPosition({ 
          x: rect.left - containerRect.left + rect.width / 2, 
          y: rect.top - containerRect.top - 10 
        });
        if (!editingAnnotation) { 
            setShowAnnotationToolbar(true);
        }
      } else {
         setShowAnnotationToolbar(false);
         if (!editingAnnotation) {
            setCurrentSelection(null);
         }
      }

    } else {
      if (!editingAnnotation) {
        setShowAnnotationToolbar(false);
        setCurrentSelection(null);
      }
    }
  };

  useEffect(() => {
    const textDisplayArea = textDisplayRef.current;
    if (!textDisplayArea || isFileLoading) return;

    const debouncedHandleSelection = () => { 
        setTimeout(handleTextSelection, 50);
    }

    document.addEventListener('selectionchange', debouncedHandleSelection);
    textDisplayArea.addEventListener('mouseup', debouncedHandleSelection);

    return () => {
      document.removeEventListener('selectionchange', debouncedHandleSelection);
      if (textDisplayArea) {
          textDisplayArea.removeEventListener('mouseup', debouncedHandleSelection);
      }
    };
  }, [originalText, editingAnnotation, isFileLoading]); 

  const addAnnotation = (type: AnnotationDisplayType, noteText?: string) => {
    const selectionToAnnotate = editingAnnotation || currentSelection;
    if (!selectionToAnnotate || selectionToAnnotate.text.trim() === "") return;

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      start: selectionToAnnotate.start,
      end: selectionToAnnotate.end,
      text: selectionToAnnotate.text,
      type,
      note: noteText,
    };
    setAnnotations(prev => [...prev, newAnnotation].sort((a,b) => a.start - b.start));
    
    toast({
      title: `${annotationDefinitions[type].label} Added`,
      description: `Selected text has been marked as ${annotationDefinitions[type].label.toLowerCase()}.`,
      variant: "default",
      action: <CheckCircle className="h-5 w-5 text-green-500" />,
    });

    setShowAnnotationToolbar(false);
    setCurrentSelection(null);
    setAnnotationNote("");
    setEditingAnnotation(null);
  };
  
  const handleToolbarAction = (type: AnnotationDisplayType) => {
    if (!currentSelection || currentSelection.text.trim() === "") return;

    const def = annotationDefinitions[type];
    if (def.requiresNote) {
      setAnnotationNote(""); 
      setEditingAnnotation({ 
        id: 'new-note', 
        ...currentSelection,
        type: type
      });
      setShowAnnotationToolbar(false); 
    } else {
      addAnnotation(type); 
    }
  };

  const handleSaveAnnotationNote = () => {
    if (editingAnnotation && (annotationNote.trim() || annotationDefinitions[editingAnnotation.type].requiresNote === false) ) {
      addAnnotation(editingAnnotation.type, annotationNote.trim() ? annotationNote : undefined);
    } else if (editingAnnotation && !annotationNote.trim() && annotationDefinitions[editingAnnotation.type].requiresNote === true) {
        toast({ title: "Empty Note", description: "Please enter some text for your note.", variant: "destructive" });
    } else {
        setEditingAnnotation(null); 
        setShowAnnotationToolbar(false);
        setCurrentSelection(null); 
    }
  };

  const handleCancelAnnotationNote = () => {
    setEditingAnnotation(null);
    setAnnotationNote("");
    setShowAnnotationToolbar(false); 
    setCurrentSelection(null); 
  };


  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    toast({ title: "Annotation Removed", variant: "destructive" });
  };

  const renderTextWithAnnotations = () => {
    if (isFileLoading) return <div className="flex flex-col items-center justify-center min-h-[100px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-muted-foreground mt-2">Processing file...</p></div>;
    if (!originalText) return <p className="text-muted-foreground">Paste your text or upload a .txt/.pdf file to begin.</p>;

    let lastIndex = 0;
    const parts: (string | JSX.Element)[] = [];
    
    annotations.forEach(ann => {
      if (ann.start > lastIndex) {
        parts.push(originalText.substring(lastIndex, ann.start));
      }
      const def = annotationDefinitions[ann.type];
      const spanContent = (
        <span className={`px-0.5 py-0.5 rounded relative group ${def.colorClass} cursor-pointer hover:brightness-110 transition-all `}>
          {originalText.substring(ann.start, ann.end)}
          <span 
            className={`ml-0.5 text-[0.6rem] font-bold p-[1px] px-[3px] rounded-sm align-super ${def.colorClass.replace('/30', '/60').replace('/40','/70')} text-black/70`}
            title={def.label}
          >
            {def.abbreviation}
          </span>
        </span>
      );

      parts.push(
        <Popover key={ann.id}>
          <PopoverTrigger asChild>{spanContent}</PopoverTrigger>
          <PopoverContent className="w-80 shadow-xl">
            <div className="grid gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <def.icon className={`h-5 w-5 ${def.colorClass.replace('bg-', 'text-').replace('/30', '-700').replace('/40','-700')}`} />
                  <h4 className="font-medium leading-none">{def.label}</h4>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Annotated: <span className="italic">"{ann.text}"</span>
                </p>
              </div>
              {ann.note ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Note:</p>
                  <p className="text-sm bg-secondary/50 p-2 rounded whitespace-pre-wrap break-words">{ann.note}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No additional note for this annotation.</p>
              )}
              <Button variant="outline" size="sm" onClick={() => removeAnnotation(ann.id)} className="mt-2">
                <Trash2 className="mr-2 h-4 w-4" /> Delete Annotation
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      );
      lastIndex = ann.end;
    });

    if (lastIndex < originalText.length) {
      parts.push(originalText.substring(lastIndex));
    }
    return <div ref={textDisplayRef} data-text-display-area className="whitespace-pre-wrap leading-relaxed selection:bg-blue-300 selection:text-blue-900">{parts}</div>;
  };

  const fetchAiGuide = async () => {
    if (!originalText) {
      toast({ title: "No Text Provided", description: "Please paste or upload some text first.", variant: "destructive" });
      return;
    }
    setIsLoadingAiGuide(true);
    setAiAnnotationGuide(null);
    try {
      const result = await getAiAnnotationGuideAction({ text: originalText });
      setAiAnnotationGuide(result.annotationExamples);
      toast({ title: "AI Guide Generated", description: "Annotation examples are now available." });
    } catch (error) {
      toast({ title: "Error Generating AI Guide", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoadingAiGuide(false);
    }
  };

  const fetchAiSummaryFeedback = async () => {
    if (!originalText || !summaryText) {
      toast({ title: "Missing Information", description: "Please provide text and a summary.", variant: "destructive" });
      return;
    }
    setIsLoadingAiSummaryFeedback(true);
    setAiSummaryFeedback(null);
    try {
      const result = await getAiSummaryFeedbackAction({ text: originalText, summary: summaryText });
      setAiSummaryFeedback(result.feedback);
      toast({ title: "AI Feedback Generated", description: "Feedback on your summary is available." });
    } catch (error) {
      toast({ title: "Error Generating AI Feedback", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoadingAiSummaryFeedback(false);
    }
  };

  const fetchAiAnnotationFeedback = async () => {
    if (!originalText) {
      toast({ title: "No Text Provided", description: "Please paste or upload some text first.", variant: "destructive" });
      return;
    }
    if (annotations.length === 0) {
      toast({ title: "No Annotations", description: "Please make some annotations first to get feedback.", variant: "destructive" });
      return;
    }
    setIsLoadingAiAnnotationFeedback(true);
    setAiAnnotationFeedback(null);
    try {
      const annotationDetailsForAI = annotations.map(ann => ({
        text: ann.text,
        type: ann.type,
        note: ann.note,
      }));
      const result = await getAiAnnotationFeedbackAction({ originalText, annotations: annotationDetailsForAI });
      setAiAnnotationFeedback(result.feedback);
      toast({ title: "Annotation Feedback Generated", description: "Feedback on your annotations is available." });
    } catch (error) {
      toast({ title: "Error Generating Annotation Feedback", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoadingAiAnnotationFeedback(false);
    }
  };


  return (
    <div className="space-y-8">
      <Card className="shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <CardTitle>Import Your Text</CardTitle>
          </div>
          <CardDescription>
            Paste your text into the area below, or upload a .txt or .pdf file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste your text here..."
            rows={6}
            value={originalText}
            onPaste={handleTextPaste}
            onChange={(e) => handleManualTextChange(e.target.value)}
            className="text-base"
            disabled={isFileLoading}
          />
          <div className="flex items-center justify-center">
            <span className="text-sm text-muted-foreground">OR</span>
          </div>
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isFileLoading}
          >
            {isFileLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UploadCloud className="mr-2 h-5 w-5" />}
            {isFileLoading ? 'Processing File...' : 'Upload .txt / .pdf File'}
          </Button>
          <Input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".txt,.pdf"
            className="hidden"
            disabled={isFileLoading}
          />
        </CardContent>
      </Card>

      {originalText && !isFileLoading && (
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 shadow-xl relative">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-primary" />
                <CardTitle>Active Reading Space</CardTitle>
              </div>
              <CardDescription>Select text to apply an annotation. Your annotations will appear in the text below.</CardDescription>
            </CardHeader>
            <CardContent className="prose max-w-none min-h-[300px] p-6 text-base relative">
              {renderTextWithAnnotations()}
              {showAnnotationToolbar && currentSelection && currentSelection.text.trim() !== "" && !editingAnnotation && (
                <div 
                  className="absolute bg-card border border-border rounded-md shadow-lg p-1 flex flex-wrap gap-1 z-10"
                  style={{ left: Math.max(0, toolbarPosition.x), top: Math.max(0, toolbarPosition.y), transform: 'translate(-50%, -100%)' }}
                  onMouseDown={(e) => e.stopPropagation()} 
                  onMouseUp={(e) => e.stopPropagation()}
                >
                  {Object.entries(annotationDefinitions).map(([type, def]) => (
                    <Button 
                      key={type} 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleToolbarAction(type as AnnotationDisplayType)} 
                      className="p-2"
                      title={def.label}
                    >
                      <def.icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>
              )}
              <Popover 
                open={!!editingAnnotation} 
                onOpenChange={(isOpen) => {
                  if (!isOpen) {
                    handleCancelAnnotationNote(); 
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <span />
                </PopoverTrigger>
                {editingAnnotation && ( 
                  <PopoverContent 
                    className="w-64 p-4" 
                    style={{
                        position: 'absolute',
                        left: Math.max(0, toolbarPosition.x), 
                        top: Math.max(0, toolbarPosition.y - 20), 
                        transform: 'translate(-50%, -100%)',
                        zIndex: 20, 
                    }}
                    onOpenAutoFocus={(e) => e.preventDefault()} 
                    onPointerDownOutside={handleCancelAnnotationNote} 
                  >
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Add Note for {annotationDefinitions[editingAnnotation.type].label}</p>
                      <Textarea 
                        placeholder="Type your note..." 
                        value={annotationNote}
                        onChange={(e) => setAnnotationNote(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={handleCancelAnnotationNote}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveAnnotationNote}>Save</Button>
                      </div>
                    </div>
                  </PopoverContent>
                )}
              </Popover>
            </CardContent>
          </Card>

          <div className="space-y-6 md:col-span-1">
            <Tabs defaultValue="ai-guide" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="ai-guide"><Lightbulb className="mr-1 h-4 w-4 inline-block"/>Guide</TabsTrigger>
                <TabsTrigger value="ann-feedback"><MessageCircleQuestion className="mr-1 h-4 w-4 inline-block"/>Ann. Fbk</TabsTrigger>
                <TabsTrigger value="summary"><MessageSquare className="mr-1 h-4 w-4 inline-block"/>Summary</TabsTrigger>
                <TabsTrigger value="sum-feedback"><Sparkles className="mr-1 h-4 w-4 inline-block"/>Sum. Fbk</TabsTrigger>
              </TabsList>
              <TabsContent value="ai-guide">
                <AiHelperCard
                  title="AI Annotation Guide"
                  icon={Lightbulb}
                  content={aiAnnotationGuide}
                  isLoading={isLoadingAiGuide}
                  actionButton={
                    <Button onClick={fetchAiGuide} disabled={isLoadingAiGuide || !originalText} size="sm">
                      {isLoadingAiGuide ? "Generating..." : "Get Guide"}
                    </Button>
                  }
                  placeholderText="Click 'Get Guide' to see AI-suggested annotations for the text."
                />
              </TabsContent>
              <TabsContent value="ann-feedback">
                <AiHelperCard
                  title="AI Annotation Feedback"
                  icon={MessageCircleQuestion}
                  content={aiAnnotationFeedback}
                  isLoading={isLoadingAiAnnotationFeedback}
                  actionButton={
                    <Button onClick={fetchAiAnnotationFeedback} disabled={isLoadingAiAnnotationFeedback || !originalText || annotations.length === 0} size="sm">
                      {isLoadingAiAnnotationFeedback ? "Analyzing..." : "Get Feedback"}
                    </Button>
                  }
                  placeholderText="Make some annotations on the text, then click 'Get Feedback' to see how you did."
                />
              </TabsContent>
              <TabsContent value="summary">
                <Card className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg font-medium">Your Summary</CardTitle>
                    </div>
                    <CardDescription>Write a summary of the main arguments in the text.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Type your summary here..."
                      rows={8}
                      value={summaryText}
                      onChange={(e) => setSummaryText(e.target.value)}
                      className="text-base"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="sum-feedback">
                <AiHelperCard
                  title="AI Summary Feedback"
                  icon={Sparkles}
                  content={aiSummaryFeedback}
                  isLoading={isLoadingAiSummaryFeedback}
                  actionButton={
                    <Button onClick={fetchAiSummaryFeedback} disabled={isLoadingAiSummaryFeedback || !originalText || !summaryText} size="sm">
                      {isLoadingAiSummaryFeedback ? "Analyzing..." : "Get Feedback"}
                    </Button>
                  }
                  placeholderText="Write a summary and then click 'Get Feedback' for AI insights."
                />
              </TabsContent>
            </Tabs>
            
            {annotations.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-medium">Your Annotations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 max-h-60 overflow-y-auto">
                    {annotations.map(ann => {
                      const def = annotationDefinitions[ann.type];
                      return (
                        <li key={ann.id} className={`text-sm p-3 border rounded-md ${def.colorClass.replace('/30','/20').replace('/40','/20')} hover:shadow-md transition-shadow`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-grow overflow-hidden">
                              <div className="flex items-center gap-1.5">
                                <def.icon className={`h-4 w-4 shrink-0 ${def.colorClass.replace('bg-', 'text-').replace('/30', '-700').replace('/40','-700')}`} />
                                <p className={`font-semibold text-sm truncate`}>{def.label}: <span className="italic font-normal">"{ann.text}"</span></p>
                              </div>
                              {ann.note && <p className="text-xs text-muted-foreground mt-1 pl-5 whitespace-pre-wrap break-words">Note: {ann.note}</p>}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeAnnotation(ann.id)} className="text-destructive hover:text-destructive/80 p-1 h-auto ml-2 shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      {isFileLoading && !originalText && (
         <div className="flex flex-col items-center justify-center min-h-[300px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground mt-4 text-lg">Processing your file, please wait...</p>
        </div>
      )}
    </div>
  );
}
