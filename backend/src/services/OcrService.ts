import Tesseract from 'tesseract.js';
import path from 'path';

export class OcrService {
  /**
   * Run OCR on an image buffer and extract text.
   * Uses tesseract.js locally without requiring paid APIs.
   */
  static async extractText(imageBuffer: Buffer): Promise<string> {
    try {
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        'eng',
        { logger: m => console.log(m) } // Optional: log progress
      );
      return text;
    } catch (error) {
      console.error('OCR Extraction failed:', error);
      throw new Error('Failed to extract text from prescription');
    }
  }
}
