// src/app/actions.ts
'use server';

import {
  generateAnnotationExamples,
  type GenerateAnnotationExamplesInput,
  type GenerateAnnotationExamplesOutput,
} from '@/ai/flows/generate-annotation-examples';
import {
  provideSummarizationFeedback,
  type ProvideSummarizationFeedbackInput,
  type ProvideSummarizationFeedbackOutput,
} from '@/ai/flows/provide-summarization-feedback';

export async function getAiAnnotationGuideAction(
  input: GenerateAnnotationExamplesInput
): Promise<GenerateAnnotationExamplesOutput> {
  try {
    return await generateAnnotationExamples(input);
  } catch (error) {
    console.error("Error in getAiAnnotationGuideAction:", error);
    throw new Error("Failed to generate AI annotation guide.");
  }
}

export async function getAiSummaryFeedbackAction(
  input: ProvideSummarizationFeedbackInput
): Promise<ProvideSummarizationFeedbackOutput> {
  try {
    return await provideSummarizationFeedback(input);
  } catch (error) {
    console.error("Error in getAiSummaryFeedbackAction:", error);
    throw new Error("Failed to generate AI summary feedback.");
  }
}
