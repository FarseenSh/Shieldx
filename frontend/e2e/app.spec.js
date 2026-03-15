import { test, expect } from "@playwright/test";

test.describe("ShieldX Frontend", () => {
  test("page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ShieldX/);
  });

  test("header renders ShieldX logo and name", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header").getByText("ShieldX", { exact: true })).toBeVisible();
  });

  test("network indicator shows Polkadot Hub Testnet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Polkadot Hub Testnet")).toBeVisible();
  });

  test("Connect Wallet button is present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
  });

  test("Dashboard shows hero MEV saved number", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("TOTAL MEV SAVED")).toBeVisible();
  });

  test("Dashboard shows 3 feature cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hidden Orders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fair Pricing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cross-Chain" })).toBeVisible();
  });

  test("Dashboard shows How It Works with 4 steps", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "How ShieldX Protects Your Trades" })).toBeVisible();
    await expect(page.getByText("Submit hidden order with collateral")).toBeVisible();
    await expect(page.getByText("Orders hidden during epoch")).toBeVisible();
    await expect(page.getByText("Uniform clearing price for all")).toBeVisible();
    await expect(page.getByText("Zero MEV, fair execution")).toBeVisible();
  });

  test("Trade tab renders order form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Trade" }).click();
    await expect(page.getByRole("heading", { name: "Submit Protected Order" })).toBeVisible();
    await expect(page.getByText("Token Pair")).toBeVisible();
    await expect(page.getByText("Limit Price")).toBeVisible();
  });

  test("Trade tab shows epoch timer with phase", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Trade" }).click();
    await expect(page.getByText("PHASE")).toBeVisible();
  });

  test("Trade tab shows BUY and SELL buttons", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Trade" }).click();
    await expect(page.getByRole("button", { name: "BUY" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SELL" })).toBeVisible();
  });

  test("MEV Demo tab renders sandwich comparison", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "MEV Demo" }).click();
    await expect(page.getByRole("heading", { name: "See MEV Protection in Action" })).toBeVisible();
  });

  test("MEV Demo shows Normal DEX panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "MEV Demo" }).click();
    await expect(page.getByRole("heading", { name: "Normal DEX" })).toBeVisible();
  });

  test("MEV Demo shows ShieldX Protected panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "MEV Demo" }).click();
    await expect(page.getByRole("heading", { name: "ShieldX Protected" })).toBeVisible();
  });

  test("MEV Demo shows comparison after animation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "MEV Demo" }).click();
    await page.waitForTimeout(12000);
    await expect(page.getByText("MEV Protection:")).toBeVisible();
  });

  test("History tab renders epoch table", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Epoch History" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "#849" })).toBeVisible();
  });

  test("all 4 tabs are navigable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("The first MEV protection")).toBeVisible();

    await page.getByRole("button", { name: "Trade" }).click();
    await expect(page.getByRole("heading", { name: "Submit Protected Order" })).toBeVisible();

    await page.getByRole("button", { name: "MEV Demo" }).click();
    await expect(page.getByRole("heading", { name: "See MEV Protection in Action" })).toBeVisible();

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Epoch History" })).toBeVisible();

    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByText("The first MEV protection")).toBeVisible();
  });

  test("footer shows hackathon info and links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Polkadot Hackathon 2026")).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  });
});
