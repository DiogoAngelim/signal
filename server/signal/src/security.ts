import type { SignalEnvelope } from "./protocol";

export type AuthContext = {
  actorId?: string;
  roles?: string[];
  scopes?: string[];
};

export interface AuthenticationHook {
  authenticate(envelope: SignalEnvelope): Promise<AuthContext | null>;
}

export interface AuthorizationHook {
  authorize(
    envelope: SignalEnvelope,
    auth: AuthContext | null,
  ): Promise<boolean>;
}

export interface MessageSignatureHook {
  sign(envelope: SignalEnvelope): Promise<string>;
  verify(envelope: SignalEnvelope, signature: string): Promise<boolean>;
}

export type SecurityHooks = {
  authentication?: AuthenticationHook;
  authorization?: AuthorizationHook;
  messageSigning?: MessageSignatureHook;
};

export const createNoopSecurityHooks = (): SecurityHooks => ({
  authentication: {
    async authenticate(): Promise<AuthContext | null> {
      return null;
    },
  },
  authorization: {
    async authorize(): Promise<boolean> {
      return true;
    },
  },
});
