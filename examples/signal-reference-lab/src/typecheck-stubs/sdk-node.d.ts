export type SignalEventDefinition = any;
export type SignalExecutionContext = any;
export type SignalMutationDefinition = any;
export type SignalQueryDefinition = any;
type OperationResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: { message: string } };
interface SignalRuntime {
  mutation<Input, Output>(name: string, input: Input, context: any): Promise<OperationResult<Output>>;
  query<Input, Output>(name: string, input: Input, context: any): Promise<OperationResult<Output>>;
  publish(...args: any[]): Promise<any>;
  registerQuery(...args: any[]): void;
  registerMutation(...args: any[]): void;
  registerEvent(...args: any[]): void;
  subscribe(name: string, handler: (envelope: { messageId: string }) => void, options?: any): void;
}
export declare function createDecisionRecord(input: any): any;
export declare function createInMemoryDecisionMemoryStore(...args: any[]): any;
export declare function createSignalRuntime(input: {
  observabilityPort?: { emit(context: any): void };
  [key: string]: any;
}): SignalRuntime;
