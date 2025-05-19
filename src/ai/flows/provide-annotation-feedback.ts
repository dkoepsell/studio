'use server';
/**
 * @fileOverview Provides feedback on student annotations using AI.
 *
 * - provideAnnotationFeedback - A function that provides feedback on a given set of annotations.
 * - ProvideAnnotationFeedbackInput - The input type for the provideAnnotationFeedback function.
 * - ProvideAnnotationFeedbackOutput - The return type for the provideAnnotationFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnnotationDetailSchema = z.object({
  text: z.string().describe('The text content of the annotation.'),
  type: z.enum(['highlight', 'note']).describe('The type of annotation.'),
  note: z.string().optional().describe('The note associated with the annotation, if any.'),
});

const ProvideAnnotationFeedbackInputSchema = z.object({
  originalText: z.string().describe('The original text that the annotations are based on.'),
  annotations: z.array(AnnotationDetailSchema).describe('The student-made annotations.'),
});

export type ProvideAnnotationFeedbackInput = z.infer<
  typeof ProvideAnnotationFeedbackInputSchema
>;

const ProvideAnnotationFeedbackOutputSchema = z.object({
  feedback: z.string().describe('AI-generated feedback on the annotations.'),
});

export type ProvideAnnotationFeedbackOutput = z.infer<
  typeof ProvideAnnotationFeedbackOutputSchema
>;

export async function provideAnnotationFeedback(
  input: ProvideAnnotationFeedbackInput
): Promise<ProvideAnnotationFeedbackOutput> {
  return provideAnnotationFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'provideAnnotationFeedbackPrompt',
  input: {schema: ProvideAnnotationFeedbackInputSchema},
  output: {schema: ProvideAnnotationFeedbackOutputSchema},
  prompt: `You are an expert academic tutor. A student has provided you with a piece of text and their annotations (highlights and notes) on that text.
Your task is to provide feedback on the quality, relevance, and insightfulness of their annotations.
Consider if the annotations help in understanding the text, if they capture key points, or if they show critical engagement. Be specific and constructive.

Original Text:
{{{originalText}}}

Student Annotations:
{{#each annotations}}
- Type: {{this.type}}
  - Annotated Text: "{{this.text}}"
  {{#if this.note}}
  - Note: "{{this.note}}"
  {{/if}}
{{/each}}

Feedback on Annotations:
  `,
});

const provideAnnotationFeedbackFlow = ai.defineFlow(
  {
    name: 'provideAnnotationFeedbackFlow',
    inputSchema: ProvideAnnotationFeedbackInputSchema,
    outputSchema: ProvideAnnotationFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
