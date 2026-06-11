export type DocumentId = string;

export interface SignalWriteOptions {
  readonly expectedVersion?: number;
}

export interface SignalDB {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  find<T = any>(collection: string, query: any): Promise<T[]>;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  findOne<T = any>(collection: string, query: any): Promise<T | null>;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  findById<T = any>(collection: string, id: DocumentId): Promise<T | null>;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  insert<T = any>(collection: string, doc: Partial<T>): Promise<DocumentId>;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  update<T = any>(
    collection: string,
    id: DocumentId,
    update: Partial<T>,
    options?: SignalWriteOptions,
  ): Promise<void>;
  remove(collection: string, id: DocumentId): Promise<void>;
  delete(collection: string, id: DocumentId): Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB interface requires any for flexibility
  count(collection: string, query: any): Promise<number>;
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}
