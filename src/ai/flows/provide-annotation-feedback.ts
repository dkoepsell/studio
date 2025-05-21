
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

const AnnotationTypeEnumSchema = z.enum([
  'highlight',
  'main-idea',
  'key-term',
  'evidence',
  'question',
  'connection',
  'custom-note'
]);
export type AnnotationType = z.infer<typeof AnnotationTypeEnumSchema>;

const AnnotationDetailSchema = z.object({
  text: z.string().describe('The text content of the annotation (the part of the original text that was selected).'),
  type: AnnotationTypeEnumSchema.describe('The semantic type of annotation (e.g., main-idea, key-term, custom-note).'),
  // Note: The 'note' field has been removed as per the new requirements.
  // note: z.string().optional().describe('The user-written note associated with this annotation, if any (especially relevant for types like "question", "connection", "custom-note").'),
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
  prompt: `You are an expert academic tutor. A student has provided you with a piece of text and their annotations on that text.
The annotations can be of several types:
- highlight: A simple visual emphasis.
- main-idea: Identifies a main point or thesis in the text.
- key-term: Marks an important vocabulary word or concept.
- evidence: Points to supporting details or examples for an argument.
- question: Marks a section of text that the student finds questionable or wishes to inquire further about.
- connection: Marks a section of text where the student identifies a connection (to self, other texts, or world).
- custom-note: Marks a general observation or point of interest for the student.

Your task is to provide feedback on the quality, relevance, and insightfulness of their annotations.
Consider:
- Is the chosen annotation type appropriate for the selected text? (e.g., is a "main-idea" annotation truly a main idea, or is it a supporting detail better marked as "evidence"?)
- Are there missed opportunities for important annotations (e.g., unmarked key terms)?
- Is there a good balance of annotation types, or is the student over-relying on one type (like just highlighting)?
- Do the annotations collectively help in understanding the text, capturing key points, or showing critical engagement with the material?
- Offer specific examples from their annotations if possible, explaining why something is good or how it could be improved.

Be specific, constructive, and encouraging.

Original Text:
\`\`\`
{{{originalText}}}
\`\`\`

Student Annotations:
{{#if annotations.length}}
{{#each annotations}}
- Annotated Text: "{{this.text}}"
  - Type: {{this.type}}
{{/each}}
{{else}}
The student has not made any annotations yet. You can encourage them to start, perhaps by suggesting what type of annotation might be useful for this text.
{{/if}}

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
