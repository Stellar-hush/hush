# Campaign copy rules for demo messages and internal notes

This document defines the campaign copy quality rules used by the Demo Admin
Dashboard. It covers both external demo messages and internal notes that help
journal campaign status, review readiness, and task context.

## Purpose

- Keep demo content clear, safe, and easy to review.
- Use deterministic fake data that is safe for public repositories.
- Make campaign messaging feel realistic without exposing real people,
  organisations, or network secrets.
- Support the demo admin workflow by making templates and notes easy to scan,
  validate, and insert into the demo inbox dataset.

## Rules for demo message copy

1. Use simple, direct language.
   - Subject lines should summarize the message in 6–10 words.
   - Body text should answer "who, what, why, next step" clearly.
   - Avoid jargon, slang, or overly promotional phrasing.

2. Keep content safe and deterministic.
   - All recipients must use `example.com`, `example.org`, or `*.stealth.demo`.
   - No real user names, real organisations, PII, secrets, private keys, or
     live network references.
   - All fixture values must be hardcoded constants.

3. Structure longer content for readability.
   - Use short paragraphs, bullet lists, or labeled sections when helpful.
   - Avoid large blocks of text in demo bodies.
   - Prefer a positive, helpful tone that supports the demo scenario.

4. Make the purpose explicit.
   - State why the user is receiving the message.
   - Include a clear next action or informational summary.
   - For transactional/demo receipts, clearly note that the content is synthetic.

## Rules for internal notes

1. Write internal notes as concise status summaries.
   - Focus on campaign readiness, review status, or follow-up tasks.
   - Keep each note short and factual.
   - Avoid editorial language that is unrelated to the review context.

2. Use plain language and clear context.
   - Describe what changed, why it matters, and what happens next.
   - Use consistent labels like "status", "next step", and "review".
   - Keep the tone neutral and purposeful.

3. Avoid sensitive or private details.
   - Do not include real project secrets, live endpoints, or user-identifying
     details.
   - Internal notes should be safe for a demo admin surface and public review.

4. Keep internal notes visibly distinct from customer-facing copy.
   - Use explicit internal note labels in subject and body.
   - Capture review metadata, not user-facing marketing language.

## Examples

### Demo message example

Subject: Hush demo digest — what's new

Body:

Here's what's new in the demo build:

- Refreshed inbox layout
- Faster command palette
- Friendlier first-run onboarding

Thanks for following along.

This example uses a clear subject, short bullet points, and a safe public tone.

### Internal note example

Subject: Campaign copy review note

Body:

Status: ready for review
Next step: confirm the new campaign templates and insert the internal note
template into the demo draft dataset.

This note is short, factual, and clearly marked for internal campaign review.

## Review checklist

- [ ] The copy uses only safe demo recipients and reserved domains.
- [ ] The subject is explicit and matched by the message body.
- [ ] The body is easy to scan, with short paragraphs or list structure.
- [ ] External demo messages state the scenario clearly and note the content is
      synthetic when appropriate.
- [ ] Internal notes are factual, concise, and distinct from customer-facing
      copy.
- [ ] The template or note remains deterministic and does not rely on runtime
      values.
- [ ] Campaign copy metadata is present where relevant (e.g. `audience`).
