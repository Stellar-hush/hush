import type { CampaignTemplate } from "../types/campaign";

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "template-setup",
    name: "Campaign Setup",
    description: "Initial configuration and targeting for a new campaign.",
    checklist: [
      {
        id: "c-1",
        label: "Define Audience",
        description: "Select the target demographic and user segments.",
        required: true,
        completed: true,
      },
      {
        id: "c-2",
        label: "Set Budget",
        description: "Allocate privacy budgets for the campaign events.",
        required: true,
        completed: false,
      },
      {
        id: "c-3",
        label: "Configure Sender Profile",
        description: "Assign verified domains and labels.",
        required: true,
        completed: false,
      },
    ],
  },
  {
    id: "template-validation",
    name: "Content Validation",
    description: "Ensure message content meets policy and deliverability standards.",
    checklist: [
      {
        id: "v-1",
        label: "Subject Line Scan",
        description: "Check for spam triggers in the subject.",
        required: true,
        completed: true,
      },
      {
        id: "v-2",
        label: "Link Verification",
        description: "Verify all outbound links are safe and reachable.",
        required: true,
        completed: true,
      },
      {
        id: "v-3",
        label: "Policy Compliance",
        description: "Ensure content abides by Hush network rules.",
        required: true,
        completed: false,
      },
    ],
  },
  {
    id: "template-publish",
    name: "Publish Readiness",
    description: "Final checks before federating the campaign to relays.",
    checklist: [
      {
        id: "p-1",
        label: "Preview Generation",
        description: "Generate inbox previews for varying clients.",
        required: true,
        completed: false,
      },
      {
        id: "p-2",
        label: "Test Delivery",
        description: "Send a batch to internal seed accounts.",
        required: true,
        completed: false,
      },
      {
        id: "p-3",
        label: "Approval Sign-off",
        description: "Obtain manager approval to start the campaign.",
        required: false,
        completed: false,
      },
    ],
  },
];
