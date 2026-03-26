---
title: User Onboarding Flow
---

# User Onboarding Flow

1. A client sends `user.onboard.v1`.
2. The runtime updates the user record.
3. The runtime emits `user.onboarded.v1`.
4. The onboarding subscriber records the event once per message id.
