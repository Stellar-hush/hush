# Campaign Integration Handoff Guide

This handoff document details the architecture of the **Campaign Draft Snapshot** feature and outlines the steps, code locations, and safety mitigations required to wire this demo campaign data into the live Hush demo inbox UI in future stages.

---

## 1. Feature Architecture Overview

All campaign administration operates completely isolated under `src/features/demo-admin-dashboard/`. The key states and adapters are:

1. **Active Draft Dataset (`Draft[]`)**:
   - Accumulates draft messages selected via the **Templates** tab (`TemplatePicker`).
   - Synced to the **Campaigns** tab to save custom snapshots.
   - Persisted in browser's local storage under the key `demoAdminDraftDataset` via `saveDraftDataset` and `loadDraftDataset`.

2. **Campaign Snapshots (`CampaignSnapshot[]`)**:
   - Represents snapshot states containing name, description, target audience, tag list, timestamp, status, and the draft list.
   - Saved in local storage under the key `demoAdminCampaignSnapshots` via `saveCampaignSnapshots` and `loadCampaignSnapshots` (falls back to `defaultCampaignSnapshots` fixtures when empty).

3. **Display Tokens**:
   - Defined in `constants/displayTokens.ts`. Maps tag keywords, statuses, and target audiences to CSS classes, keeping campaign representation consistent across panels.

---

## 2. Step-by-Step Integration Steps

To connect these demo drafts to the live inbox UI, follow these steps:

### Step A: Load the Demo Drafts in the Main Mail Store

When the main mailbox initializes, load the active campaign draft dataset if the application is running in "Demo/Admin" mode.

- **Location**: Locate the inbox state initializer (e.g., in `src/components/mail/useMail` or `src/features/inbox/store`).
- **Wiring**:

  ```ts
  import { loadDraftDataset } from "@/features/demo-admin-dashboard";

  // Seed the active draft state if present in local storage
  const activeCampaignDrafts = loadDraftDataset();
  if (activeCampaignDrafts && activeCampaignDrafts.length > 0) {
    // Dispatch or set the draft folder state to include these records
    dispatch({ type: "LOAD_DRAFTS", payload: activeCampaignDrafts });
  }
  ```

### Step B: Sync Draft Updates Back to Local Storage

If a user edits a campaign draft within the live inbox compose view:

- **Location**: Compose editor submit/save handlers.
- **Wiring**: Capture the updated draft list and update the dataset in storage:

  ```ts
  import { saveDraftDataset, loadDraftDataset } from "@/features/demo-admin-dashboard";

  function handleDraftUpdate(updatedDraft: Draft) {
    const currentDataset = loadDraftDataset() || [];
    const nextDataset = currentDataset.map((d) => (d.id === updatedDraft.id ? updatedDraft : d));
    saveDraftDataset(nextDataset);
  }
  ```

### Step C: Apply Theme & Badge Styles to the Inbox List

Render metadata attributes (status, tags, and audience) alongside drafts in the sidebar or detailed view.

- **Location**: Inbox item lists.
- **Wiring**:

  ```ts
  import { getTagToken, getAudienceToken } from "@/features/demo-admin-dashboard";

  // Inside your component render:
  {
    draft.tags.map((tag) => {
      const token = getTagToken(tag);
      return (
        <span className={`${token.bg} ${token.text} border ${token.border}`}>{token.label}</span>
      );
    });
  }
  ```

---

## 3. Risk Notes & Safety Barriers

Integrating synthetic data into a live system introduces risks. Apply these strict mitigations:

### Risk 1: Demo Mails routed to Production SMTP/Postage Relays

- **Impact**: Synthetic messages are processed by live relays, resulting in failed transactions or mail delivery spam.
- **Mitigation**:
  - Ensure all demo template recipients use reserved domains like `@stealth.demo`, `@example.com`, or `@example.org`.
  - Implement a routing gateway interceptor in the postage service (`src/features/postage-service/` or similar):
    ```ts
    export function shouldBlockRelaying(recipient: string): boolean {
      return recipient.endsWith(".demo") || recipient.includes("example.");
    }
    ```

### Risk 2: Schema Version Mismatches

- **Impact**: Future changes to the `Draft` or `CampaignSnapshot` shapes corrupt storage values.
- **Mitigation**:
  - Add a version check helper in `localStorageAdapter.ts` to invalidate and purge local storage if structure mismatches are detected upon loading.

### Risk 3: Demo Data Leaking into Staging/Production builds

- **Impact**: Demo dashboard or datasets expose test structures on production builds.
- **Mitigation**:
  - Restrict imports or mounting of `DemoAdminDashboard` strictly under development modes:
    ```tsx
    {
      import.meta.env.MODE === "development" && <DemoAdminDashboard />;
    }
    ```
