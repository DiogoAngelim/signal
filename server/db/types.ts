export type DocumentId = string;

export interface SignalWriteOptions {
  readonly expectedVersion?: number;
}

export interface SignalDB {
  find<T = any>(collection: string, query: any): Promise<T[]>;
  findOne<T = any>(collection: string, query: any): Promise<T | null>;
  findById<T = any>(collection: string, id: DocumentId): Promise<T | null>;
  insert<T = any>(collection: string, doc: Partial<T>): Promise<DocumentId>;
  update<T = any>(
    collection: string,
    id: DocumentId,
    update: Partial<T>,
    options?: SignalWriteOptions
  ): Promise<void>;
  remove(collection: string, id: DocumentId): Promise<void>;
  delete(collection: string, id: DocumentId): Promise<void>;
  count(collection: string, query: any): Promise<number>;
  isConnected(): Promise<boolean>;
  disconnect(): Promise<void>;
}
