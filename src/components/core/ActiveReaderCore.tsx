
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
  connection: { label: 'Connection', abbreviation: 'CON', colorClass: 'bg-orange-500/30', icon: Link2, description: "Link two parts of the text." },
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
        if (!isConnecting) { // Only hide toolbar if not actively connecting
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
        if (!isConnecting) { // Only show toolbar if not in the middle of a connection
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
             setShowAnnotationToolbar(false); // Ensure toolbar is hidden when selecting 'to' point
        }
      } else { // Invalid selection
        if (!isConnecting) {
          setShowAnnotationToolbar(false);
          setCurrentSelection(null);
        }
      }
    } else { // No selection or selection collapsed
      if (!isConnecting) {
        setShowAnnotationToolbar(false);
        setCurrentSelection(null);
      }
    }
  }, [isConnecting, isFileLoading]);


  useEffect(() => {
    const textDisplayArea = textDisplayRef.current;
    if (!textDisplayArea || isFileLoading) return;

    // Using a longer debounce to see if it helps with selection stability
    const debouncedHandleSelection = () => {
        setTimeout(handleTextSelection, 100);
    }

    document.addEventListener('selectionchange', debouncedHandleSelection);
    // `mouseup` might be more reliable for final selection state
    textDisplayArea.addEventListener('mouseup', debouncedHandleSelection);


    return () => {
      document.removeEventListener('selectionchange', debouncedHandleSelection);
      if (textDisplayArea) {
        textDisplayArea.removeEventListener('mouseup', debouncedHandleSelection);
      }
    };
  }, [originalText, isFileLoading, handleTextSelection]); // handleTextSelection is now memoized


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
      // If trying to complete a connection, currentSelection is the 'to' point.
      // If it's empty, it's an issue handled inside the 'connection' block.
      if (type !== 'connection' || !isConnecting) {
          toast({ title: "No Text Selected", description: "Please select some text first.", variant: "destructive" });
          return;
      }
    }
    
    if (type === 'connection') {
      if (!isConnecting) { // Start a new connection
        if (!currentSelection || currentSelection.text.trim() === "") { // Should not happen if toolbar was shown
             toast({ title: "No Text Selected", description: "Please select text for the start of the connection.", variant: "destructive" });
             return;
        }
        setIsConnecting(true);
        setPendingConnectionStart(currentSelection);
        setCurrentSelection(null); 
        setShowAnnotationToolbar(false);
        toast({ title: "Connection Started", description: "Now select the second piece of text to connect to." });
      } else { // Complete the connection
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
        // Reset connection state
        setIsConnecting(false);
        setPendingConnectionStart(null);
        setCurrentSelection(null);
        setShowAnnotationToolbar(false);
      }
    } else { // Handle other annotation types
      if (isConnecting) { 
        setIsConnecting(false);
        setPendingConnectionStart(null);
        setCurrentSelection(null); // Also clear current selection if a different tool is chosen
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


  const renderTextWithAnnotations = () => {
    if (isFileLoading) return <div className="flex flex-col items-center justify-center min-h-[100px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-muted-foreground mt-2">Processing file...</p></div>;
    if (!originalText) return <p className="text-muted-foreground">Paste your text or upload a .txt/.pdf file to begin.</p>;

    let lastIndex = 0;
    const parts: (string | JSX.Element)[] = [];

    const tempAnnotations = [...annotations];
    if (isConnecting && pendingConnectionStart) {
        tempAnnotations.push({
            id: 'pending-connection-start',
            start: pendingConnectionStart.start,
            end: pendingConnectionStart.end,
            text: pendingConnectionStart.text,
            type: 'highlight', 
        });
        tempAnnotations.sort((a,b) => a.start - b.start);
    }


    tempAnnotations.forEach(ann => {
      if (ann.start > lastIndex) {
        parts.push(<React.Fragment key={`text-before-${ann.id}`}>{originalText.substring(lastIndex, ann.start)}</React.Fragment>);
      }
      const def = annotationDefinitions[ann.type];
      const isPending = ann.id === 'pending-connection-start';
      const colorClass = isPending ? 'bg-blue-300/50' : def.colorClass; 

      const spanContent = (
        <span className={`px-0.5 py-0.5 rounded relative group ${colorClass} cursor-pointer hover:brightness-110 transition-all `}>
          {originalText.substring(ann.start, ann.end)}
          {!isPending && (
            <span
              className={`ml-0.5 text-[0.6rem] font-bold p-[1px] px-[3px] rounded-sm align-super ${def.colorClass.replace('/30', '/60').replace('/40','/70')} text-black/70`}
              title={def.label}
            >
              {def.abbreviation}
            </span>
          )}
          {isPending && (
            <span
              className={`ml-0.5 text-[0.6rem] font-bold p-[1px] px-[3px] rounded-sm align-super bg-blue-500/70 text-white`}
              title="Starting point of connection"
            >
              FROM
            </span>
          )}
        </span>
      );

      if (isPending) {
        parts.push(React.cloneElement(spanContent, { key: ann.id }));
      } else {
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
                <p className="text-sm text-muted-foreground italic">This annotation type does not support additional notes in this version.</p>
                <Button variant="outline" size="sm" onClick={() => removeAnnotation(ann.id)} className="mt-2">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Annotation
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      }
      lastIndex = ann.end;
    });

    if (lastIndex < originalText.length) {
      parts.push(<React.Fragment key={`text-trailing-${lastIndex}`}>{originalText.substring(lastIndex)}</React.Fragment>);
    }
    
    return (
        <>
            {isConnecting && pendingConnectionStart && (
                <div className="mb-2 p-3 text-sm bg-blue-100 text-blue-800 rounded-md border border-blue-300 flex items-center justify-between shadow">
                    <div className='flex items-center'>
                        <Link2 className="h-5 w-5 mr-2 shrink-0 text-blue-600" />
                        <span className="font-medium">
                            {currentSelection && currentSelection.text.trim() !== ""
                                ? "Second point selected. Ready to connect."
                                : "Select the second piece of text."
                            }
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentSelection && currentSelection.text.trim() !== "" && (
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
            <div ref={textDisplayRef} data-text-display-area className="whitespace-pre-wrap leading-relaxed selection:bg-blue-300 selection:text-blue-900">
                {parts}
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
          <Card className="md:col-span-2 shadow-xl relative">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-primary" />
                <CardTitle>Active Reading Space</CardTitle>
              </div>
              <CardDescription>Select text to apply an annotation. For connections, click the <Link2 className="inline h-4 w-4"/> tool, select the first text, then select the second text using the status bar controls.
              </CardDescription>
            </CardHeader>
            <CardContent className="prose max-w-none min-h-[300px] p-6 text-base relative">
              {renderTextWithAnnotations()}
              {showAnnotationToolbar && currentSelection && currentSelection.text.trim() !== "" && !isConnecting && (
                <div
                  className="absolute bg-card border border-border rounded-md shadow-lg p-1 flex flex-wrap gap-1 z-10"
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
