declare module "word-extractor" {
  class Document {
    getBody(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getFooters(): string;
    getAnnotations(): string;
    getEndnotes(): string;
    getFootnotes(): string;
    getTextboxes(options?: { includeHeadersAndFooters?: boolean; includeBody?: boolean }): string;
  }

  class WordExtractor {
    extract(source: string | Buffer): Promise<Document>;
  }

  export = WordExtractor;
}
