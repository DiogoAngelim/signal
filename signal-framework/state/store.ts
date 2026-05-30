import type { SignalSnapshot } from "../types";

export class SnapshotStore {
  private snapshots: Readonly<SignalSnapshot>[] = [];

  constructor(private readonly maxSnapshots = 120) {}

  append(snapshot: Readonly<SignalSnapshot>) {
    this.snapshots = [...this.snapshots, snapshot].slice(-this.maxSnapshots);
  }

  latest() {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  history() {
    return this.snapshots.slice();
  }
}

