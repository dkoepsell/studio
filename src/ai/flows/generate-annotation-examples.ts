'use server';

/**
 * @fileOverview A flow to generate example annotations for a given text.
 *
 * - generateAnnotationExamples - A function that generates annotation examples for a given text.
 * - GenerateAnnotationExamplesInput - The input type for the generateAnnotationExamples function.
 * - GenerateAnnotationExamplesOutput - The return type for the generateAnnotationExamples function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAnnotationExamplesInputSchema = z.object({
  text: z
    .string()
    .describe('The text to generate annotation examples for.'),
});
export type GenerateAnnotationExamplesInput = z.infer<typeof GenerateAnnotationExamplesInputSchema>;

const GenerateAnnotationExamplesOutputSchema = z.object({
  annotationExamples: z
    .string()
    .describe('Examples of effective annotations for the given text.'),
});
export type GenerateAnnotationExamplesOutput = z.infer<typeof GenerateAnnotationExamplesOutputSchema>;

export async function generateAnnotationExamples(
  input: GenerateAnnotationExamplesInput
): Promise<GenerateAnnotationExamplesOutput> {
  return generateAnnotationExamplesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAnnotationExamplesPrompt',
  input: {schema: GenerateAnnotationExamplesInputSchema},
  output: {schema: GenerateAnnotationExamplesOutputSchema},
  prompt: `You are an expert academic. A student has provided you with a piece of text and asked you to give some examples of annotations that they could make to help them understand the text better. Your response should be a textual description of what kinds of annotations would be useful, and where they ought to be placed in the text.

Text: {{{text}}}`,
});

const generateAnnotationExamplesFlow = ai.defineFlow(
  {
    name: 'generateAnnotationExamplesFlow',
    inputSchema: GenerateAnnotationExamplesInputSchema,
    outputSchema: GenerateAnnotationExamplesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
