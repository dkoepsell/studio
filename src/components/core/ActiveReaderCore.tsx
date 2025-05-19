"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, Edit3, MessageSquare, Sparkles, FileText, Upload, Trash2, Highlighter, StickyNote, CheckCircle, AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getAiAnnotationGuideAction, getAiSummaryFeedbackAction, getAiAnnotationFeedbackAction } from '@/app/actions';
import AiHelperCard from './AiHelperCard';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '../ui/input';

interface Annotation {
  id: string;
  start: number;
  end: number;
  text: string;
  note?: string;
  type: 'highlight' | 'note';
}

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

export default function ActiveReaderCore() {
  const [originalText, setOriginalText] = useState<string>("");
  const [processedText, setProcessedText] = useState<string>(""); // Not strictly needed with current render logic, but kept for potential future use
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentSelection, setCurrentSelection] = useState<SelectionRange | null>(null);
  const [showAnnotationToolbar, setShowAnnotationToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [annotationNote, setAnnotationNote] = useState("");
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null); // For the note popover

  const [summaryText, setSummaryText] = useState<string>("");
  const [aiAnnotationGuide, setAiAnnotationGuide] = useState<string | null>(null);
  const [aiSummaryFeedback, setAiSummaryFeedback] = useState<string | null>(null);
  const [aiAnnotationFeedback, setAiAnnotationFeedback] = useState<string | null>(null);

  const [isLoadingAiGuide, setIsLoadingAiGuide] = useState<boolean>(false);
  const [isLoadingAiSummaryFeedback, setIsLoadingAiSummaryFeedback] = useState<boolean>(false);
  const [isLoadingAiAnnotationFeedback, setIsLoadingAiAnnotationFeedback] = useState<boolean>(false);
  
  const textDisplayRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleTextPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    setOriginalText(pastedText);
    setProcessedText(pastedText);
    setAnnotations([]);
    setSummaryText("");
    setAiAnnotationGuide(null);
    setAiSummaryFeedback(null);
    setAiAnnotationFeedback(null);
    toast({ title: "Text Pasted", description: "You can now start reading and annotating." });
  };
  
  const handleTextSelection = () => {
    if (!textDisplayRef.current) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const container = textDisplayRef.current;

      // Check if selection is within the target display area
      if (!container.contains(range.commonAncestorContainer) || 
          (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE && !(range.commonAncestorContainer as Element).closest('[data-text-display-area]'))) {
        setShowAnnotationToolbar(false);
        setCurrentSelection(null);
        return;
      }
      
      // Calculate start and end based on text content within the display area
      // This is a simplified approach. For complex HTML, a more robust offset calculation would be needed.
      const clonedContainer = container.cloneNode(true) as HTMLDivElement;
      const walker = document.createTreeWalker(clonedContainer, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;
      let start = -1, end = -1;
      let node;

      while(node = walker.nextNode()) {
        if (node === range.startContainer) {
          start = currentOffset + range.startOffset;
        }
        if (node === range.endContainer) {
          end = currentOffset + range.endOffset;
          break; 
        }
        currentOffset += node.textContent?.length || 0;
      }
      
      // Fallback for cases where direct node match fails (e.g., selection spans multiple text nodes within elements)
      if (start === -1 || end === -1) {
          const preSelectionRange = document.createRange();
          preSelectionRange.selectNodeContents(container);
          preSelectionRange.setEnd(range.startContainer, range.startOffset);
          start = preSelectionRange.toString().length;
          end = start + range.toString().length;
      }


      if (start >= 0 && end >= start) {
        setCurrentSelection({ start, end, text: range.toString() });
        
        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setToolbarPosition({ 
          x: rect.left - containerRect.left + rect.width / 2, 
          y: rect.top - containerRect.top - 10 // Position above selection
        });
        setShowAnnotationToolbar(true);
      } else {
         setShowAnnotationToolbar(false);
         setCurrentSelection(null);
      }

    } else {
      setShowAnnotationToolbar(false);
      // Do not clear currentSelection here if a popover is open based on it
      if (!editingAnnotation) {
        setCurrentSelection(null);
      }
    }
  };

  useEffect(() => {
    const textDisplayArea = textDisplayRef.current;
    if (!textDisplayArea) return;

    document.addEventListener('selectionchange', handleTextSelection);
    // Also trigger on mouseup within the text area to catch selections finalized by mouse release
    textDisplayArea.addEventListener('mouseup', handleTextSelection);

    return () => {
      document.removeEventListener('selectionchange', handleTextSelection);
      if (textDisplayArea) { // Check if still mounted
          textDisplayArea.removeEventListener('mouseup', handleTextSelection);
      }
    };
  }, [originalText, editingAnnotation]); 

  const addAnnotation = (type: 'highlight' | 'note', noteText?: string) => {
    if (!currentSelection || currentSelection.text.trim() === "") return;
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      ...currentSelection,
      type,
      note: noteText,
    };
    setAnnotations(prev => [...prev, newAnnotation].sort((a,b) => a.start - b.start));
    setShowAnnotationToolbar(false);
    setCurrentSelection(null);
    setAnnotationNote("");
    setEditingAnnotation(null); // Close popover
    toast({
      title: type === 'highlight' ? "Text Highlighted" : "Annotation Added",
      description: `Selected text has been ${type === 'highlight' ? 'highlighted' : 'annotated'}.`,
      variant: "default",
      action: <CheckCircle className="h-5 w-5 text-green-500" />,
    });
  };

  const handleHighlight = () => addAnnotation('highlight');
  
  const handleOpenAnnotationPopup = () => {
    if(currentSelection && currentSelection.text.trim() !== "") {
      setAnnotationNote(""); // Reset note text
      setEditingAnnotation({ // Use currentSelection to populate temporary annotation for popover
        id: 'new-note', 
        ...currentSelection,
        type: 'note'
      });
       // Keep toolbar open while popover is active
    } else {
      setShowAnnotationToolbar(false); // Hide toolbar if no valid selection
    }
  };

  const handleSaveAnnotationNote = () => {
    if (editingAnnotation && annotationNote.trim()) { // Check if annotationNote is not just whitespace
      // If editingAnnotation was based on currentSelection, use its details
      const baseSelection = currentSelection && editingAnnotation.id === 'new-note' ? currentSelection : editingAnnotation;
      addAnnotation('note', annotationNote); // addAnnotation will reset editingAnnotation
    } else if (editingAnnotation && !annotationNote.trim()) {
        toast({ title: "Empty Note", description: "Please enter some text for your note.", variant: "destructive" });
    } else {
        setEditingAnnotation(null); // Close if no note entered or something went wrong
        setShowAnnotationToolbar(false);
    }
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    toast({ title: "Annotation Removed", variant: "destructive" });
  };

  const renderTextWithAnnotations = () => {
    if (!originalText) return <p className="text-muted-foreground">Paste your text above to begin.</p>;

    let lastIndex = 0;
    const parts: (string | JSX.Element)[] = [];
    
    annotations.forEach(ann => {
      if (ann.start > lastIndex) {
        parts.push(originalText.substring(lastIndex, ann.start));
      }
      const isNote = ann.type === 'note' && ann.note;
      const spanContent = (
        <span
          className={`px-0.5 rounded ${ann.type === 'highlight' ? 'bg-accent/30' : 'bg-primary/30'
            } ${isNote ? 'cursor-pointer hover:bg-primary/50' : ''}`}
        >
          {originalText.substring(ann.start, ann.end)}
        </span>
      );

      if (isNote) {
        parts.push(
          <Popover key={ann.id}>
            <PopoverTrigger asChild>{spanContent}</PopoverTrigger>
            <PopoverContent className="w-80 shadow-xl">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none text-primary">Annotation Note</h4>
                  <p className="text-sm text-muted-foreground">
                    For text: <span className="italic">"{ann.text}"</span>
                  </p>
                </div>
                <p className="text-sm">{ann.note}</p>
                <Button variant="outline" size="sm" onClick={() => removeAnnotation(ann.id)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Annotation
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      } else {
        parts.push(
          <span key={ann.id}>
            {spanContent}
          </span>
        );
      }
      lastIndex = ann.end;
    });

    if (lastIndex < originalText.length) {
      parts.push(originalText.substring(lastIndex));
    }
    // Add data-text-display-area to the div for more precise selection detection
    return <div ref={textDisplayRef} data-text-display-area className="whitespace-pre-wrap leading-relaxed selection:bg-accent selection:text-accent-foreground">{parts}</div>;
  };

  const fetchAiGuide = async () => {
    if (!originalText) {
      toast({ title: "No Text Provided", description: "Please paste some text first.", variant: "destructive" });
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
      toast({ title: "No Text Provided", description: "Please paste some text first.", variant: "destructive" });
      return;
    }
    if (annotations.length === 0) {
      toast({ title: "No Annotations", description: "Please make some annotations first to get feedback.", variant: "destructive" });
      return;
    }
    setIsLoadingAiAnnotationFeedback(true);
    setAiAnnotationFeedback(null);
    try {
      const annotationDetails = annotations.map(ann => ({
        text: ann.text, // Text content of the annotation itself
        type: ann.type,
        note: ann.note,
      }));
      const result = await getAiAnnotationFeedbackAction({ originalText, annotations: annotationDetails });
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
            Paste your text into the area below to begin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Paste your text here..."
            rows={8}
            value={originalText}
            onPaste={handleTextPaste}
            onChange={(e) => {
              setOriginalText(e.target.value);
              setProcessedText(e.target.value); // Update processed text on change
              setAnnotations([]); // Clear annotations if text changes substantially
              setSummaryText("");
              setAiAnnotationGuide(null);
              setAiSummaryFeedback(null);
              setAiAnnotationFeedback(null);
            }}
            className="text-base"
          />
        </CardContent>
      </Card>

      {originalText && (
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 shadow-xl relative">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-primary" />
                <CardTitle>Active Reading Space</CardTitle>
              </div>
              <CardDescription>Select text to highlight or annotate. Your annotations will appear highlighted or noted in the text.</CardDescription>
            </CardHeader>
            <CardContent className="prose max-w-none min-h-[300px] p-6 text-base relative">
              {renderTextWithAnnotations()}
              {showAnnotationToolbar && currentSelection && currentSelection.text.trim() !== "" && (
                <div 
                  className="absolute bg-card border border-border rounded-md shadow-lg p-1 flex gap-1 z-10"
                  style={{ left: Math.max(0, toolbarPosition.x), top: Math.max(0, toolbarPosition.y), transform: 'translate(-50%, -100%)' }}
                  // Prevent toolbar from closing when clicking on it
                  onMouseDown={(e) => e.stopPropagation()} 
                  onMouseUp={(e) => e.stopPropagation()}
                >
                  <Button variant="outline" size="sm" onClick={handleHighlight} className="p-2">
                    <Highlighter className="h-4 w-4" />
                  </Button>
                  <Popover 
                    open={!!editingAnnotation} 
                    onOpenChange={(isOpen) => {
                      if (!isOpen) {
                        setEditingAnnotation(null);
                        // setShowAnnotationToolbar(false); // Hide toolbar when popover closes
                      } else {
                        // This case is handled by handleOpenAnnotationPopup
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleOpenAnnotationPopup} className="p-2">
                        <StickyNote className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    {editingAnnotation && ( // Ensure editingAnnotation is not null before rendering PopoverContent
                      <PopoverContent className="w-64 p-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Add Note</p>
                          <Textarea 
                            placeholder="Type your note..." 
                            value={annotationNote}
                            onChange={(e) => setAnnotationNote(e.target.value)}
                            rows={3}
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingAnnotation(null); setAnnotationNote(""); setShowAnnotationToolbar(false); }}>Cancel</Button>
                            <Button size="sm" onClick={handleSaveAnnotationNote}>Save</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    )}
                  </Popover>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6 md:col-span-1">
            <Tabs defaultValue="ai-guide" className="w-full">
              <TabsList className="grid w-full grid-cols-4"> {/* Updated to 4 columns */}
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
                  placeholderText="Click 'Get Guide' to see AI-suggested annotations."
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
                  placeholderText="Make some annotations on the text, then click 'Get Feedback'."
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
                  placeholderText="Submit your summary to get AI-powered feedback."
                />
              </TabsContent>
            </Tabs>
            
            {annotations.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-medium">Your Annotations</CardTitle>
                </CardHeader>
                <CardContent>
                  {annotations.length > 0 ? (
                    <ul className="space-y-3 max-h-60 overflow-y-auto">
                      {annotations.map(ann => (
                        <li key={ann.id} className="text-sm p-3 border rounded-md bg-secondary/30 hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className={`font-semibold ${ann.type === 'highlight' ? 'text-accent-foreground' : 'text-primary'} truncate max-w-[200px]`}>{ann.text}</p>
                              {ann.note && <p className="text-muted-foreground mt-1">Note: {ann.note}</p>}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeAnnotation(ann.id)} className="text-destructive hover:text-destructive/80 p-1 h-auto">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                     <p className="text-sm text-muted-foreground">No annotations yet. Select text to start.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
