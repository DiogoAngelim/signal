/**
 * Auth Provider
 * 
 * Handles authentication context extraction from requests.
 */

import { SignalAuth } from "../core/Types";

export class AuthProvider {
  /**
   * Extract auth from request headers
   */
  static fromHeaders(headers: Record<string, string> = {}): SignalAuth {
    const auth: SignalAuth = {};

    // Extract Bearer token
    const authHeader = headers.authorization || headers.Authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      auth.token = authHeader.slice(7);
    }

    // Parse optional user ID from header
    const userId = headers["x-user-id"];
    if (userId) {
      auth.user = { id: userId };
    }

    // Parse optional roles from header
    const rolesHeader = headers["x-user-roles"];
    if (rolesHeader && auth.user) {
      auth.user.roles = rolesHeader.split(",").map((r) => r.trim());
    }

    return auth;
  }

  /**
   * Extract auth from query/mutation params
   */
  static fromParams(
    params: Record<string, any> = {}
  ): { auth: SignalAuth; cleanParams: Record<string, any> } {
    const auth: SignalAuth = {};
    const cleanParams = { ...params };

    // Remove auth fields from params (security)
    delete cleanParams._auth;
    delete cleanParams._token;
    delete cleanParams._userId;

    return { auth, cleanParams };
  }

  /**
   * Merge multiple auth sources
   */
  static merge(...auths: SignalAuth[]): SignalAuth {
    const merged: SignalAuth = {};

    for (const auth of auths) {
      if (auth.token) {
        merged.token = auth.token;
      }
      if (auth.user) {
        merged.user = { ...merged.user, ...auth.user };
      }
    }

    return merged;
  }

  /**
   * Check if authenticated
   */
  static isAuthenticated(auth: SignalAuth): boolean {
    return auth.user != null;
  }

  /**
   * Check if has role
   */
  static hasRole(auth: SignalAuth, role: string): boolean {
    return auth.user?.roles?.includes(role) ?? false;
  }

  /**
   * Create anonymous auth
   */
  static anonymous(): SignalAuth {
    return {};
  }

  /**
   * Create authenticated auth
   */
  static authenticated(userId: string, roles?: string[]): SignalAuth {
    return {
      user: {
        id: userId,
        roles,
      },
    };
  }
}
