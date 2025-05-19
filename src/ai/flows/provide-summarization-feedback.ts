'use server';

/**
 * @fileOverview Provides feedback on student summaries using AI.
 *
 * - provideSummarizationFeedback - A function that provides feedback on a given summary.
 * - ProvideSummarizationFeedbackInput - The input type for the provideSummarizationFeedback function.
 * - ProvideSummarizationFeedbackOutput - The return type for the provideSummarizationFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProvideSummarizationFeedbackInputSchema = z.object({
  text: z.string().describe('The original text that the summary is based on.'),
  summary: z.string().describe('The student-written summary to provide feedback on.'),
});

export type ProvideSummarizationFeedbackInput = z.infer<
  typeof ProvideSummarizationFeedbackInputSchema
>;

const ProvideSummarizationFeedbackOutputSchema = z.object({
  feedback: z.string().describe('AI-generated feedback on the summary.'),
});

export type ProvideSummarizationFeedbackOutput = z.infer<
  typeof ProvideSummarizationFeedbackOutputSchema
>;

export async function provideSummarizationFeedback(
  input: ProvideSummarizationFeedbackInput
): Promise<ProvideSummarizationFeedbackOutput> {
  return provideSummarizationFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'provideSummarizationFeedbackPrompt',
  input: {schema: ProvideSummarizationFeedbackInputSchema},
  output: {schema: ProvideSummarizationFeedbackOutputSchema},
  prompt: `You are an AI assistant that provides feedback to students on their summaries of texts.

  You will be given the original text and the student's summary. Your task is to provide feedback to the student, highlighting areas for improvement in clarity, completeness, and accuracy. Be specific and constructive.

  Original Text: {{{text}}}
  Student Summary: {{{summary}}}

  Feedback:
  `,
});

const provideSummarizationFeedbackFlow = ai.defineFlow(
  {
    name: 'provideSummarizationFeedbackFlow',
    inputSchema: ProvideSummarizationFeedbackInputSchema,
    outputSchema: ProvideSummarizationFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
