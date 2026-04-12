import type { SignalEnvelope } from "@digelim/12.signal";
import type { Frame, Profile } from "../domain";

export interface ProfileRepository {
  put(profile: Profile): Promise<void>;
  get(profileId: string, version?: string): Promise<Profile | null>;
}

export interface FrameRepository {
  put(frame: Frame): Promise<void>;
  get(frameId: string): Promise<Frame | null>;
}

export interface EventPublisher {
  publish(event: SignalEnvelope): Promise<void>;
}

export class InMemoryProfileRepository implements ProfileRepository {
  private profiles = new Map<string, Map<string, Profile>>();
  private latestById = new Map<string, Profile>();

  constructor(initial: Profile[] = []) {
    for (const profile of initial) {
      this.store(profile);
    }
  }

  private store(profile: Profile): void {
    let versions = this.profiles.get(profile.profileId);
    if (!versions) {
      versions = new Map();
      this.profiles.set(profile.profileId, versions);
    }
    versions.set(profile.version, profile);
    this.latestById.set(profile.profileId, profile);
  }

  async put(profile: Profile): Promise<void> {
    this.store(profile);
  }

  async get(profileId: string, version?: string): Promise<Profile | null> {
    if (version) {
      return this.profiles.get(profileId)?.get(version) ?? null;
    }
    return this.latestById.get(profileId) ?? null;
  }
}

export class InMemoryFrameRepository implements FrameRepository {
  private frames = new Map<string, Frame>();

  async put(frame: Frame): Promise<void> {
    this.frames.set(frame.frameId, frame);
  }

  async get(frameId: string): Promise<Frame | null> {
    return this.frames.get(frameId) ?? null;
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly events: SignalEnvelope[] = [];

  async publish(event: SignalEnvelope): Promise<void> {
    this.events.push(event);
  }
}
