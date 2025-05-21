
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Lightbulb, Edit3, MessageSquare, Sparkles, FileText, Trash2, Highlighter, StickyNote,
  CheckCircle, HelpCircle, UploadCloud, Loader2, ListChecks, BookMarked, KeyRound, Link2, MessageCircleQuestionIcon, MinusCircle
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
  highlight: { label: 'Highlight', abbreviation: 'HL', colorClass: 'bg-yellow-400/40', icon: Highlighter, description: "Emphasize important text." },
  'main-idea': { label: 'Main Idea', abbreviation: 'MI', colorClass: 'bg-blue-500/30', icon: BookMarked, description: "Identify a central point or thesis." },
  'key-term': { label: 'Key Term', abbreviation: 'KT', colorClass: 'bg-green-500/30', icon: KeyRound, description: "Mark an important vocabulary word or concept." },
  evidence: { label: 'Evidence', abbreviation: 'EV', colorClass: 'bg-indigo-500/30', icon: FileText, description: "Point to supporting details or examples." },
  question: { label: 'Question', abbreviation: 'Q', colorClass: 'bg-purple-500/30', icon: HelpCircle, description: "Mark a point of inquiry in the text." },
  connection: { label: 'Connection', abbreviation: 'CON', colorClass: 'bg-orange-500/30', icon: Link2, description: "Link two parts of the text. Select first text, click tool, then select second text." },
  'custom-note': { label: 'Note', abbreviation: 'N', colorClass: 'bg-gray-500/30', icon: StickyNote, description: "Mark a general observation or comment." },
} as const;

type AnnotationDisplayType = keyof typeof annotationDefinitions;

interface Annotation {
  id: string;
  start: number;
  end: number;
  text: string;
  type: AnnotationDisplayType;
}

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

interface ConnectionAnnotation {
  id: string;
  from: SelectionRange;
  to: SelectionRange;
}

interface LineDrawData {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}


export default function ActiveReaderCore() {
  const [originalText, setOriginalText] = useState<string>("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentSelection, setCurrentSelection] = useState<SelectionRange | null>(null);
  const [showAnnotationToolbar, setShowAnnotationToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0, screenX: 0, screenY: 0 });

  const [summaryText, setSummaryText] = useState<string>("");
  const [aiAnnotationGuide, setAiAnnotationGuide] = useState<string | null>(null);
  const [aiSummaryFeedback, setAiSummaryFeedback] = useState<string | null>(null);
  const [aiAnnotationFeedback, setAiAnnotationFeedback] = useState<string | null>(null);

  const [isLoadingAiGuide, setIsLoadingAiGuide] = useState<boolean>(false);
  const [isLoadingAiSummaryFeedback, setIsLoadingAiSummaryFeedback] = useState<boolean>(false);
  const [isLoadingAiAnnotationFeedback, setIsLoadingAiAnnotationFeedback] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);

  // State for creating connections
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [pendingConnectionStart, setPendingConnectionStart] = useState<SelectionRange | null>(null);
  const [connections, setConnections] = useState<ConnectionAnnotation[]>([]);
  const [lineDrawData, setLineDrawData] = useState<LineDrawData[]>([]);


  const textDisplayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`;
  }, []);

  const resetAppStateForNewText = () => {
    setAnnotations([]);
    setConnections([]);
    setSummaryText("");
    setAiAnnotationGuide(null);
    setAiSummaryFeedback(null);
    setAiAnnotationFeedback(null);
    setCurrentSelection(null);
    setShowAnnotationToolbar(false);
    setIsConnecting(false);
    setPendingConnectionStart(null);
    setLineDrawData([]);
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
            fullText += textContent.items.map((item: any) => item.str).join(" ") + "\n";
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

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleTextSelection = useCallback(() => {
    if (!textDisplayRef.current || isFileLoading) return;
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const container = textDisplayRef.current;

      if (!container.contains(range.commonAncestorContainer) ||
          (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE && !(range.commonAncestorContainer as Element).closest('[data-text-display-area]'))) {
        if (!isConnecting) {
          setShowAnnotationToolbar(false);
          setCurrentSelection(null);
        }
        return;
      }

      const preSelectionRange = document.createRange();
      preSelectionRange.selectNodeContents(container);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      const end = start + range.toString().length;

      if (start >= 0 && end > start && range.toString().trim() !== "") {
        setCurrentSelection({ start, end, text: range.toString() });
        if (!isConnecting) {
          const rect = range.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          setToolbarPosition({
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top - 10,
            screenX: rect.left + window.scrollX + rect.width / 2,
            screenY: rect.top + window.scrollY
          });
          setShowAnnotationToolbar(true);
        } else {
             setShowAnnotationToolbar(false);
        }
      } else {
        if (!isConnecting) {
          setShowAnnotationToolbar(false);
          setCurrentSelection(null);
        }
      }
    } else {
      if (!isConnecting) {
        setShowAnnotationToolbar(false);
        setCurrentSelection(null);
      }
    }
  }, [isConnecting, isFileLoading]);


  useEffect(() => {
    const textDisplayArea = textDisplayRef.current;
    if (!textDisplayArea || isFileLoading) return;

    const debouncedHandleSelection = () => {
        setTimeout(handleTextSelection, 100);
    }

    document.addEventListener('selectionchange', debouncedHandleSelection);
    textDisplayArea.addEventListener('mouseup', debouncedHandleSelection);


    return () => {
      document.removeEventListener('selectionchange', debouncedHandleSelection);
      if (textDisplayArea) {
        textDisplayArea.removeEventListener('mouseup', debouncedHandleSelection);
      }
    };
  }, [originalText, isFileLoading, handleTextSelection]);


  const addAnnotation = (type: AnnotationDisplayType) => {
    if (!currentSelection || currentSelection.text.trim() === "") return;

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      start: currentSelection.start,
      end: currentSelection.end,
      text: currentSelection.text,
      type,
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
  };

  const handleToolbarAction = (type: AnnotationDisplayType) => {
    if (!currentSelection || currentSelection.text.trim() === "") {
      if (type !== 'connection' || !isConnecting) {
          toast({ title: "No Text Selected", description: "Please select some text first.", variant: "destructive" });
          return;
      }
    }
    
    if (type === 'connection') {
      if (!isConnecting) {
        if (!currentSelection || currentSelection.text.trim() === "") {
             toast({ title: "No Text Selected", description: "Please select text for the start of the connection.", variant: "destructive" });
             return;
        }
        setIsConnecting(true);
        setPendingConnectionStart(currentSelection);
        setCurrentSelection(null); 
        setShowAnnotationToolbar(false);
        toast({ title: "Connection Started", description: "Now select the second piece of text to connect to." });
      } else { 
        if (pendingConnectionStart) {
          if (!currentSelection || currentSelection.text.trim() === "") {
            toast({ title: "No 'To' Text Selected", description: "Please select the second piece of text to complete the connection.", variant: "destructive" });
            return;
          }
          if (pendingConnectionStart.start === currentSelection.start && pendingConnectionStart.end === currentSelection.end) {
            toast({ title: "Cannot Connect to Itself", description: "Please select a different piece of text for the end of the connection.", variant: "destructive" });
            return;
          }
          const newConnection: ConnectionAnnotation = {
            id: Date.now().toString(),
            from: pendingConnectionStart,
            to: currentSelection,
          };
          setConnections(prev => [...prev, newConnection]);
          toast({ title: "Connection Created!", description: `Connected "${pendingConnectionStart.text}" to "${currentSelection.text}".`});
        }
        setIsConnecting(false);
        setPendingConnectionStart(null);
        setCurrentSelection(null);
        setShowAnnotationToolbar(false);
      }
    } else { 
      if (isConnecting) { 
        setIsConnecting(false);
        setPendingConnectionStart(null);
        setCurrentSelection(null); 
        toast({ title: "Connection Cancelled", description: "Annotation type changed before connection was completed.", variant: "destructive" });
      }
      addAnnotation(type);
    }
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    toast({ title: "Annotation Removed", variant: "destructive" });
  };

  const removeConnection = (id: string) => {
    setConnections(prev => prev.filter(conn => conn.id !== id));
    toast({ title: "Connection Removed", variant: "destructive" });
  };

  const calculateLineCoordinates = useCallback(() => {
    if (!textDisplayRef.current) return;
    const containerRect = textDisplayRef.current.getBoundingClientRect();
    const newLines: LineDrawData[] = [];

    connections.forEach(conn => {
      const fromEl = textDisplayRef.current?.querySelector(`[data-conn-marker-id="${conn.id}-from"]`);
      const toEl = textDisplayRef.current?.querySelector(`[data-conn-marker-id="${conn.id}-to"]`);

      if (fromEl && toEl) {
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();

        newLines.push({
          id: conn.id,
          x1: fromRect.left - containerRect.left + fromRect.width / 2,
          y1: fromRect.top - containerRect.top + fromRect.height / 2,
          x2: toRect.left - containerRect.left + toRect.width / 2,
          y2: toRect.top - containerRect.top + toRect.height / 2,
        });
      }
    });
    setLineDrawData(newLines);
  }, [connections, originalText, annotations, pendingConnectionStart]); // Re-calculate if these change DOM structure

  useEffect(() => {
    calculateLineCoordinates();
    window.addEventListener('resize', calculateLineCoordinates);
    return () => {
      window.removeEventListener('resize', calculateLineCoordinates);
    };
  }, [calculateLineCoordinates]);


  const renderTextWithAnnotations = () => {
    if (isFileLoading) return <div className="flex flex-col items-center justify-center min-h-[100px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-muted-foreground mt-2">Processing file...</p></div>;
    if (!originalText) return <p className="text-muted-foreground">Paste your text or upload a .txt/.pdf file to begin.</p>;

    const parts: (string | JSX.Element)[] = [];
    
    // Create a list of all event points: 0, text length, and all annotation/connection start/end points
    let eventPoints = new Set<number>([0, originalText.length]);
    annotations.forEach(ann => {
      eventPoints.add(ann.start);
      eventPoints.add(ann.end);
    });
    connections.forEach(conn => {
      eventPoints.add(conn.from.start);
      eventPoints.add(conn.from.end);
      eventPoints.add(conn.to.start);
      eventPoints.add(conn.to.end);
    });
    if (isConnecting && pendingConnectionStart) {
      eventPoints.add(pendingConnectionStart.start);
      eventPoints.add(pendingConnectionStart.end);
    }

    const sortedPoints = Array.from(eventPoints).sort((a, b) => a - b);

    for (let i = 0; i < sortedPoints.length -1; i++) {
      const start = sortedPoints[i];
      const end = sortedPoints[i+1];

      if (start >= end) continue; // Skip empty or invalid segments

      const segmentText = originalText.substring(start, end);
      if (!segmentText) continue;

      let segmentClasses = "px-0.5 py-0.5 rounded relative group hover:brightness-110 transition-all";
      let dataAttributes: Record<string, string> = {};
      let annotationForPopover: Annotation | null = null;
      let abbreviation: string | null = null;
      let icon: React.ElementType | null = null;
      let labelForTitle: string | null = null;

      // Check for pending connection start
      if (isConnecting && pendingConnectionStart && start >= pendingConnectionStart.start && end <= pendingConnectionStart.end) {
        segmentClasses += ` ${'bg-blue-300/50'}`; // Highlight for pending connection start
        if (start === pendingConnectionStart.start && end === pendingConnectionStart.end) { // Exact match
             dataAttributes['data-conn-marker-id'] = `pending-${pendingConnectionStart.start}-from`;
        }
      }
      
      // Check for completed connections
      connections.forEach(conn => {
        if (start >= conn.from.start && end <= conn.from.end) {
          // segmentClasses += ` ${annotationDefinitions.connection.colorClass}`; // Optional: style connection points
           if (start === conn.from.start && end === conn.from.end) dataAttributes['data-conn-marker-id'] = `${conn.id}-from`;
        }
        if (start >= conn.to.start && end <= conn.to.end) {
          // segmentClasses += ` ${annotationDefinitions.connection.colorClass}`; // Optional: style connection points
          if (start === conn.to.start && end === conn.to.end) dataAttributes['data-conn-marker-id'] = `${conn.id}-to`;
        }
      });

      // Check for annotations (highest priority if overlapping, or combine?)
      // For simplicity, pick the first one that fully contains or starts at this segment
      const applicableAnnotations = annotations.filter(ann => start >= ann.start && end <= ann.end);
      if (applicableAnnotations.length > 0) {
        // Prioritize longer annotations or decide on a merging strategy if complex overlaps needed
        const currentAnn = applicableAnnotations.sort((a,b) => (b.end-b.start) - (a.end-a.start))[0];
        annotationForPopover = currentAnn;
        const def = annotationDefinitions[currentAnn.type];
        segmentClasses += ` ${def.colorClass} cursor-pointer`;
        abbreviation = def.abbreviation;
        icon = def.icon;
        labelForTitle = def.label;
      }
      
      const spanKey = `segment-${start}-${end}`;
      let spanContent = <span className={segmentClasses} {...dataAttributes}>{segmentText}</span>;

      if (abbreviation && labelForTitle && !dataAttributes['data-conn-marker-id']?.startsWith('pending')) { // Don't add abbreviation to pending markers
         const def = annotationDefinitions[annotationForPopover!.type]; // annotationForPopover must exist if abbreviation is set
         spanContent = (
            <span className={`${segmentClasses} ${def.colorClass} cursor-pointer`} {...dataAttributes}>
              {segmentText}
              <span
                className={`ml-0.5 text-[0.6rem] font-bold p-[1px] px-[3px] rounded-sm align-super ${def.colorClass.replace('/30', '/60').replace('/40','/70')} text-black/70`}
                title={labelForTitle}
              >
                {abbreviation}
              </span>
            </span>
         );
      }


      if (annotationForPopover && icon) {
        const def = annotationDefinitions[annotationForPopover.type];
        parts.push(
          <Popover key={spanKey}>
            <PopoverTrigger asChild>{spanContent}</PopoverTrigger>
            <PopoverContent className="w-80 shadow-xl">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <def.icon className={`h-5 w-5 ${def.colorClass.replace('bg-', 'text-').replace('/30', '-700').replace('/40','-700')}`} />
                    <h4 className="font-medium leading-none">{def.label}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Annotated: <span className="italic">"{annotationForPopover.text}"</span>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground italic">This annotation type does not support additional notes in this version.</p>
                <Button variant="outline" size="sm" onClick={() => removeAnnotation(annotationForPopover!.id)} className="mt-2">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Annotation
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      } else {
        parts.push(React.cloneElement(spanContent, {key: spanKey}));
      }
    }
    
    return (
        <>
            {isConnecting && ( // This status bar is for active connection process
                <div className="mb-2 p-3 text-sm bg-blue-100 text-blue-800 rounded-md border border-blue-300 flex items-center justify-between shadow">
                    <div className='flex items-center'>
                        <Link2 className="h-5 w-5 mr-2 shrink-0 text-blue-600" />
                        <span className="font-medium">
                            {currentSelection && currentSelection.text.trim() !== "" && pendingConnectionStart
                                ? "Second point selected. Ready to connect."
                                : "Select the second piece of text to connect to."
                            }
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentSelection && currentSelection.text.trim() !== "" && pendingConnectionStart && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleToolbarAction('connection')} 
                                className="bg-blue-500 hover:bg-blue-600 text-white border-blue-600"
                            >
                                <Link2 className="mr-1.5 h-4 w-4"/> Complete Connection
                            </Button>
                        )}
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                                setIsConnecting(false);
                                setPendingConnectionStart(null);
                                setCurrentSelection(null);
                                toast({title: "Connection Cancelled"});
                            }} 
                            className="text-blue-700 hover:bg-blue-200 hover:text-blue-800"
                        >
                            <MinusCircle className="mr-1.5 h-4 w-4"/> Cancel
                        </Button>
                    </div>
                </div>
            )}
            <div ref={textDisplayRef} data-text-display-area className="whitespace-pre-wrap leading-relaxed selection:bg-blue-300 selection:text-blue-900 relative">
                 {/* SVG Overlay for lines - must be relative to this div */}
                <svg 
                    className="absolute top-0 left-0 w-full h-full pointer-events-none z-[5]" // z-index to be above text, below toolbar maybe
                >
                    {lineDrawData.map(line => (
                        <line
                            key={line.id}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            stroke="hsl(var(--primary))" // Use theme primary color
                            strokeWidth="2"
                            markerEnd="url(#arrowhead)" // Optional: if you define an arrowhead
                        />
                    ))}
                    {/* Optional: Define arrowhead marker for lines */}
                    {/* <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
                        </marker>
                    </defs> */}
                </svg>
                {parts.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>)}
            </div>
        </>
    );
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
      }));
      const result = await getAiAnnotationFeedbackAction({ originalText, annotations: annotationDetailsForAI });
      setAiAnnotationFeedback(result.feedback);
      toast({ title: "Annotation Feedback Generated", description: "Feedback on your annotations is available." });
    } catch (error)
{
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
            disabled={isFileLoading || (isConnecting && !!pendingConnectionStart)}
          />
          <div className="flex items-center justify-center">
            <span className="text-sm text-muted-foreground">OR</span>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
                if (isConnecting && !!pendingConnectionStart) {
                    toast({title: "Connection in Progress", description: "Please complete or cancel the current connection first.", variant: "destructive"});
                    return;
                }
                fileInputRef.current?.click()
            }}
            disabled={isFileLoading || (isConnecting && !!pendingConnectionStart)}
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
            disabled={isFileLoading || (isConnecting && !!pendingConnectionStart)}
          />
        </CardContent>
      </Card>

      {originalText && !isFileLoading && (
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 shadow-xl relative"> {/* Added relative for SVG positioning */}
            <CardHeader>
              <div className="flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-primary" />
                <CardTitle>Active Reading Space</CardTitle>
              </div>
              <CardDescription>Select text to apply an annotation. For connections, click the <Link2 className="inline h-4 w-4"/> tool, select the first text, then select the second text using the status bar controls. Lines will appear for completed connections.
              </CardDescription>
            </CardHeader>
            <CardContent className="prose max-w-none min-h-[300px] p-6 text-base relative"> {/* Added relative for SVG positioning parent */}
              {renderTextWithAnnotations()}
              {showAnnotationToolbar && currentSelection && currentSelection.text.trim() !== "" && !isConnecting && (
                <div
                  className="absolute bg-card border border-border rounded-md shadow-lg p-1 flex flex-wrap gap-1 z-10" // z-10 to be above SVG lines
                  style={{
                    left: Math.max(0, toolbarPosition.x),
                    top: Math.max(0, toolbarPosition.y),
                    transform: 'translate(-50%, -100%)'
                  }}
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
            </CardContent>
          </Card>

          <div className="space-y-6 md:col-span-1">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-6 w-6 text-primary" />
                  <CardTitle className="text-lg font-medium">Annotation Key &amp; Tips</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2 text-base">Annotation Legend:</h4>
                  <ul className="space-y-1.5 text-sm">
                    {Object.entries(annotationDefinitions).map(([key, def]) => (
                      <li key={key} className="flex items-start gap-2">
                         <div className="flex items-center shrink-0 mt-0.5">
                            <def.icon className={`h-4 w-4 shrink-0 ${def.colorClass.replace('bg-', 'text-').replace('/30', '-700').replace('/40', '-700')}`} />
                            <span className={`w-3 h-3 rounded-sm shrink-0 ml-1 ${def.colorClass.replace('/30', '/80').replace('/40', '/80')}`}></span>
                         </div>
                        <div className="flex-grow">
                            <span className="font-medium">{def.label} ({def.abbreviation}):</span>
                            <span className="text-muted-foreground text-xs block">{def.description}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 text-base mt-4">Active Reading Tips:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Engage actively to improve understanding and retention.</li>
                    <li>Mark main ideas, key terms, and supporting evidence.</li>
                    <li>Note down questions that arise as you read.</li>
                    <li>Make connections to your own experiences or other texts.</li>
                    <li>Your annotations should create a dialogue with the material.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="summary"><MessageSquare className="mr-1 h-4 w-4 inline-block"/>Summary</TabsTrigger>
                <TabsTrigger value="ai-guide"><Lightbulb className="mr-1 h-4 w-4 inline-block"/>Guide</TabsTrigger>
                <TabsTrigger value="ann-feedback"><MessageCircleQuestionIcon className="mr-1 h-4 w-4 inline-block"/>Ann. Fbk</TabsTrigger>
                <TabsTrigger value="sum-feedback"><Sparkles className="mr-1 h-4 w-4 inline-block"/>Sum. Fbk</TabsTrigger>
              </TabsList>
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
                      disabled={(isConnecting && !!pendingConnectionStart)}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="ai-guide">
                <AiHelperCard
                  title="AI Annotation Guide"
                  icon={Lightbulb}
                  content={aiAnnotationGuide}
                  isLoading={isLoadingAiGuide}
                  actionButton={
                    <Button onClick={fetchAiGuide} disabled={isLoadingAiGuide || !originalText || (isConnecting && !!pendingConnectionStart)} size="sm">
                      {isLoadingAiGuide ? "Generating..." : "Get Guide"}
                    </Button>
                  }
                  placeholderText={!originalText ? "Import text first." : "Click 'Get Guide' to see AI-suggested annotations for the text. You can do this even before making your own annotations."}
                />
              </TabsContent>
              <TabsContent value="ann-feedback">
                <AiHelperCard
                  title="AI Annotation Feedback"
                  icon={MessageCircleQuestionIcon}
                  content={aiAnnotationFeedback}
                  isLoading={isLoadingAiAnnotationFeedback}
                  actionButton={
                    <Button onClick={fetchAiAnnotationFeedback} disabled={isLoadingAiAnnotationFeedback || !originalText || annotations.length === 0 || (isConnecting && !!pendingConnectionStart)} size="sm">
                      {isLoadingAiAnnotationFeedback ? "Analyzing..." : "Get Feedback"}
                    </Button>
                  }
                  placeholderText="Make some annotations on the text, then click 'Get Feedback' to see how you did."
                />
              </TabsContent>
              <TabsContent value="sum-feedback">
                <AiHelperCard
                  title="AI Summary Feedback"
                  icon={Sparkles}
                  content={aiSummaryFeedback}
                  isLoading={isLoadingAiSummaryFeedback}
                  actionButton={
                    <Button onClick={fetchAiSummaryFeedback} disabled={isLoadingAiSummaryFeedback || !originalText || !summaryText || (isConnecting && !!pendingConnectionStart)} size="sm">
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

            {connections.length > 0 && (
              <Card className="shadow-lg mt-6">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg font-medium">Your Connections</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 max-h-60 overflow-y-auto">
                    {connections.map(conn => {
                      const def = annotationDefinitions.connection; 
                      return (
                        <li key={conn.id} className={`text-sm p-3 border rounded-md ${def.colorClass.replace('/30','/20').replace('/40','/20')} hover:shadow-md transition-shadow`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-grow overflow-hidden space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold text-xs px-1.5 py-0.5 rounded-sm ${def.colorClass.replace('/30','/50')}`}>FROM:</span>
                                    <p className="italic text-xs">"{conn.from.text}"</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold text-xs px-1.5 py-0.5 rounded-sm ${def.colorClass.replace('/30','/50')}`}>TO:</span>
                                    <p className="italic text-xs">"{conn.to.text}"</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeConnection(conn.id)} className="text-destructive hover:text-destructive/80 p-1 h-auto ml-2 shrink-0">
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

