// Run with Playwright CLI run-code from a fresh browser session against production.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async page => {
  const timeout = 25_000;
  const timings = {};
  const start = Date.now();
  const pageResponse = await page.goto("https://www.liveopweg.nl/", { waitUntil: "domcontentloaded", timeout });
  if (!pageResponse?.ok()) throw new Error("Public radar did not load");
  await page.waitForFunction(() => Number(document.querySelector(".radarFleetCount strong")?.textContent?.replace(/\D/g, "")) > 0, undefined, { timeout });
  timings.firstMappedTrainMs = Date.now() - start;

  const stationStart = Date.now();
  await page.getByRole("combobox", { name: /Zoek trein/ }).fill("Utrecht Centraal");
  await page.getByRole("option").filter({ hasText: "Utrecht Centraal" }).click();
  await page.locator(".stationPanel .stationResult").first().waitFor({ timeout });
  timings.stationBoardMs = Date.now() - stationStart;

  await page.getByRole("button", { name: "Reisplanner", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Van", exact: true }).fill("Utrecht");
  await page.getByRole("option").filter({ hasText: "Utrecht Centraal" }).click();
  await page.getByRole("combobox", { name: "Naar", exact: true }).fill("Amsterdam");
  await page.getByRole("option").filter({ hasText: "Amsterdam Centraal" }).click();
  const adviceStart = Date.now();
  await page.getByRole("button", { name: "Zoek reizen", exact: true }).click();
  await page.locator(".journeyPlannerPanel .uiAdvice").first().waitFor({ timeout });
  timings.journeyAdviceMs = Date.now() - adviceStart;

  return { station: "Utrecht Centraal", journey: "Utrecht Centraal → Amsterdam Centraal", timings };
}
