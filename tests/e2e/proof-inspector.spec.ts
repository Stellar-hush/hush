import { test, expect, openDemoMailbox } from "./fixtures";

test.describe("proof inspector", () => {
  test.beforeEach(async ({ page }) => {
    await openDemoMailbox(page);
  });

  test("opens from the toolbar button and shows the modal", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    await expect(page.getByRole("dialog", { name: "Cryptographic proof inspector" })).toBeVisible();
    await expect(page.getByText("Hush Proof Inspector")).toBeVisible();
    await expect(page.getByPlaceholder("Enter Message Hash, Payment")).toBeVisible();
  });

  test("shows quick shortcut buttons for local records", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    await expect(page.getByText("Quick shortcuts")).toBeVisible();
    const shortcuts = page.getByRole("dialog").getByRole("button");
    const shortcutCount = await shortcuts.count();
    expect(shortcutCount).toBeGreaterThanOrEqual(4);
  });

  test("searches by sender name and displays proof record", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    const input = page.getByPlaceholder("Enter Message Hash, Payment");
    await input.fill("Lina Park");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();

    // Demo mailbox is offline: message/storage evidence renders, but testnet
    // proofs are honestly shown as missing, so the verdict is "Incomplete".
    await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
    await expect(page.getByText("Policy Metadata")).toBeVisible();
    await expect(page.getByText("Postage details")).toBeVisible();
    await expect(page.getByText("Receipt details")).toBeVisible();
    await expect(page.getByText("Relay metadata")).toBeVisible();
  });

  test("shows not-found state for unmatched queries", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    const input = page.getByPlaceholder("Enter Message Hash, Payment");
    await input.fill("zzzzzdoesnotexist");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();

    await expect(page.getByText("Proof Record Not Found")).toBeVisible();
    await expect(page.getByText("Recommended Next Steps")).toBeVisible();
  });

  test("shows format validation for valid Stellar address", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    const input = page.getByPlaceholder("Enter Message Hash, Payment");
    const validAddress = `G${"A".repeat(55)}`;
    await input.fill(validAddress);

    await expect(page.getByText("Valid Stellar address format")).toBeVisible();
  });

  test("shows format validation error for invalid length address", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    const input = page.getByPlaceholder("Enter Message Hash, Payment");
    await input.fill("G" + "A".repeat(20));

    await expect(page.getByText("Invalid address length")).toBeVisible();
  });

  test("displays copy buttons within the proof record", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    const input = page.getByPlaceholder("Enter Message Hash, Payment");
    await input.fill("Lina Park");
    await page.getByRole("button", { name: "Inspect", exact: true }).click();

    await expect(page.getByText("Copy Proof Diagnostic Report")).toBeVisible();
    await expect(page.getByText("Stellar.Expert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Message" })).toBeVisible();
  });

  test("closes on backdrop click", async ({ page }) => {
    await page.getByRole("button", { name: "Proof Inspector" }).click();
    await expect(page.getByRole("dialog", { name: "Cryptographic proof inspector" })).toBeVisible();

    await page
      .locator(".fixed.inset-0")
      .nth(1)
      .click({ position: { x: 10, y: 10 } });
    await expect(
      page.getByRole("dialog", { name: "Cryptographic proof inspector" }),
    ).not.toBeVisible();
  });
});
