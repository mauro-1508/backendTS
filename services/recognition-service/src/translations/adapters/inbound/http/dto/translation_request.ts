export interface CreateTranslationRequestDto {
  inputText?: string;
  outputText: string;
  type: string;
  confidence?: number;
  source?: string;
}
