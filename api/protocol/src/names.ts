import { z } from "zod";

export const signalVersionPattern = /^v[1-9]\d*$/;

export const signalNamePattern =
  /^(?<domain>[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*)\.(?<action>[a-z][a-z0-9-]*)\.(?<version>v[1-9]\d*)$/;

export const signalNameSchema = z
  .string()
  .min(1)
  .regex(
    signalNamePattern,
    "Signal names must use <domain>.<action>.<version> with lowercase dot-separated segments",
  );

export interface SignalNameParts {
  domain: string;
  action: string;
  version: string;
}

export function isSignalName(value: string): boolean {
  return signalNameSchema.safeParse(value).success;
}

export function parseSignalName(value: string): SignalNameParts {
  const parsed = signalNameSchema.parse(value);
  const match = signalNamePattern.exec(parsed);

  if (!match?.groups) {
    throw new Error(`Invalid Signal name: ${value}`);
  }

  const groups = match.groups as Record<
    "domain" | "action" | "version",
    string
  >;

  return {
    domain: groups.domain,
    action: groups.action,
    version: groups.version,
  };
}

export function createSignalName(
  domain: string,
  action: string,
  version = "v1",
): string {
  return `${domain}.${action}.${version}`;
}

const pastTenseSuffixes = ["ed", "en", "t"];

export function looksPastTense(action: string): boolean {
  return pastTenseSuffixes.some((suffix) => action.endsWith(suffix));
}
