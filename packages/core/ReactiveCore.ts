/**
 * Reactive Core
 * 
 * ARCHITECTURAL: Decoupled from database layer
 * 
 * This module is responsible for ALL reactivity in Signal.
 * It is completely independent from the database layer.
 * 
 * Responsibilities:
 * - Receiving signal events from mutations
 * - Notifying subscribed queries
 * - Managing query subscriptions
 * - Fan-out to clients
 * - Versioning and consistency
 * 
 * NOT Responsibilities:
 * - Watching database changes (no change streams, oplogs, triggers)
 * - Managing data persistence
 * - Parsing database-native events
 * 
 * All events originate from explicit Signal.mutation() calls.
 */

import { SignalEvent, EventSubscriber } from "./Types";
import { generateId } from "../utils/stableHash";

/**
 * Represents a query subscription
 * Tracks query shape, connected clients, and version
 */
export interface QuerySubscription {
  readonly id: string;
  readonly queryKey: string; // "collection.operation"
  readonly params: any;
  readonly createdAt: number;
  readonly handlers: Set<EventSubscriber>;
  _version?: number; // For consistency tracking (mutable for subscription versioning)
}

/**
 * Resource version tracking for consistency
 */
export interface ResourceVersion {
  readonly resourceKey: string; // "collection:id"
  readonly _version: number;
  readonly _lastUpdated: number;
  readonly _causationId?: string; // Event ID that caused update
}

/**
 * Reactive Core: Decoupled signal emission and subscription management
 * 
 * ARCHITECTURAL GUARANTEE:
 * - No database queries run in this module
 * - No database subscriptions are created
 * - Only explicit Signal events are processed
 * - All reactivity is application-level
 */
export class ReactiveCore {
  private subscriptions = new Map<string, Set<QuerySubscription>>();
  private resourceVersions = new Map<string, ResourceVersion>();
  private eventHistory: SignalEvent[] = [];
  private maxEventHistory = 10000; // Prevent unbounded growth

  /**
   * Register a query subscription
   * 
   * Called when a client subscribes to query results.
   * Signal (not the database) owns subscriptions.
   */
  registerSubscription(
    queryKey: string,
    params: any,
    handler: EventSubscriber
  ): { unsubscribe: () => void; subscriptionId: string } {
    const subscriptionId = generateId("sub");

    const subscription: QuerySubscription = {
      id: subscriptionId,
      queryKey,
      params,
      createdAt: Date.now(),
      handlers: new Set([handler]),
      _version: 0,
    };

    if (!this.subscriptions.has(queryKey)) {
      this.subscriptions.set(queryKey, new Set());
    }

    this.subscriptions.get(queryKey)!.add(subscription);

    // Return unsubscribe function
    const unsubscribe = () => {
      const subs = this.subscriptions.get(queryKey);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(queryKey);
        }
      }
    };

    return { unsubscribe, subscriptionId };
  }

  /**
   * Emit a signal event (from mutation only, never from database)
   * 
   * This is the ONLY way events enter the reactive core.
   * Database adapters never call this directly.
   * 
   * ARCHITECTURAL: Event originates from Signal.mutation() only
   */
  async emitSignal(event: SignalEvent): Promise<SignalEvent> {
    const enrichedEvent = this.enrichEvent(event);

    // Add to history for at-least-once semantics
    this.eventHistory.push(enrichedEvent);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }

    // Fan-out to all interested subscriptions
    await this.fanOutToSubscriptions(enrichedEvent);

    // Update resource versions
    this.updateResourceVersion(enrichedEvent);

    return enrichedEvent;
  }

  /**
   * Fan-out signal to all matching subscriptions
   * 
   * ARCHITECTURAL: This is pure application logic, no database involvement
   */
  private async fanOutToSubscriptions(event: SignalEvent): Promise<void> {
    const [resource] = event.name.split(".");

    // Notify all subscriptions for this resource
    for (const [queryKey, subscriptions] of this.subscriptions) {
      // Check if this query is affected by this event
      if (this.isQueryAffectedByEvent(queryKey, event)) {
        // Notify all handlers for this query
        for (const subscription of subscriptions) {
          try {
            // Increment version for this subscription
            const newVersion = (subscription._version || 0) + 1;
            subscription._version = newVersion;

            // Execute all handlers (clients can resync)
            for (const handler of subscription.handlers) {
              // Create invalidation event for clients
              const invalidationEvent: SignalEvent = {
                ...event,
                _metadata: {
                  ...event._metadata,
                  affectedQuery: queryKey,
                  subscriptionVersion: newVersion,
                },
              };

              try {
                await handler(invalidationEvent);
              } catch (error) {
                console.error(
                  `Subscription handler failed for ${queryKey}`,
                  error
                );
              }
            }
          } catch (error) {
            console.error(`Fan-out failed for ${queryKey}`, error);
          }
        }
      }
    }
  }

  /**
   * Determine if a query is affected by an event
   * 
   * Simple heuristic: if event is for same resource, query is affected
   * More sophisticated filtering can be done at application level
   * 
   * ARCHITECTURAL: Signal decides what to invalidate, not database
   */
  private isQueryAffectedByEvent(queryKey: string, event: SignalEvent): boolean {
    const [eventResource] = event.name.split(".");
    const [queryCollection] = queryKey.split(".");

    // Basic matching: same collection
    return eventResource === queryCollection;
  }

  /**
   * Update resource version for consistency
   * 
   * ARCHITECTURAL: Supports optimistic updates and resync
   * Not from database, but from explicit Signal events
   */
  private updateResourceVersion(event: SignalEvent): void {
    // Extract resource ID if present in payload or derived field
    const id = event.resourceId || event.payload?.id || event.payload?._id;
    if (id) {
      const resource = event.resource || event.name.split(".")[0];
      const resourceKey = `${resource}:${id}`;

      const version = (this.resourceVersions.get(resourceKey)?._version || 0) + 1;
      this.resourceVersions.set(resourceKey, {
        resourceKey,
        _version: version,
        _lastUpdated: event.timestamp,
        _causationId: event.id,
      });
    }
  }

  /**
   * Enrich event with derived metadata for consistency
   */
  private enrichEvent(event: SignalEvent): SignalEvent {
    const [resource, action] = event.name.split(".");
    const resourceId =
      event.resourceId || event.payload?.id || event.payload?._id || event.payload?.result?._id;
    const currentVersion = resourceId
      ? (this.resourceVersions.get(`${resource}:${resourceId}`)?._version || 0) + 1
      : undefined;

    // Create a new object with copied metadata to avoid frozen object issues
    const newEvent: SignalEvent = {
      ...event,
      resource,
      action,
      resourceId,
      version: currentVersion,
      _metadata: {
        ...(event._metadata || {}),
        resourceKey: resourceId ? `${resource}:${resourceId}` : undefined,
        resourceVersion: currentVersion,
      },
    };

    return newEvent;
  }

  /**
   * Get resource version (for consistency checks)
   */
  getResourceVersion(resourceKey: string): ResourceVersion | undefined {
    return this.resourceVersions.get(resourceKey);
  }

  /**
   * Get event history (for replay/resync)
   */
  getEventHistory(since?: number): SignalEvent[] {
    if (!since) {
      return [...this.eventHistory];
    }
    return this.eventHistory.filter((e) => e.timestamp > since);
  }

  /**
   * Invalidate a query subscription (force resync)
   * 
   * Called explicitly, never from database polling
   */
  invalidateQuery(queryKey: string): void {
    this.subscriptions.delete(queryKey);
  }

  /**
   * Get all active subscriptions (for monitoring)
   */
  getActiveSubscriptions(): Map<string, Set<QuerySubscription>> {
    return new Map(this.subscriptions);
  }

  /**
   * Clear all subscriptions (for testing/reset)
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.resourceVersions.clear();
    this.eventHistory = [];
  }
}
