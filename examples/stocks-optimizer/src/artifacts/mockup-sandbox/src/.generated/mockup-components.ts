type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;
export const modules: ModuleMap = {};
