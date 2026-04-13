declare module "papaparse" {
  export interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean;
  }

  export interface ParseResult<T> {
    data: T[];
  }

  const Papa: {
    parse<T>(input: string, config?: ParseConfig): ParseResult<T>;
  };

  export default Papa;
}
