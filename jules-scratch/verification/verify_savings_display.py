import asyncio
from playwright.sync_api import sync_playwright, Page, expect
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture console logs
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    # Mock the API response
    def mock_api(route):
        route.fulfill(
            status=200,
            headers={"Content-Type": "application/json"},
            body='''[
                {"id": "123", "channels": [{"identifier": "general", "type": "general"}, {"identifier": "feedIn", "type": "feedIn"}]}
            ]'''
        )

    def mock_usage_api(route):
        route.fulfill(
            status=200,
            headers={"Content-Type": "application/json"},
            body='''[
                {"nemTime": "2025-01-01T00:30:00+10:00", "kwh": 1.5, "perKwh": 30, "channelIdentifier": "general", "type": "general", "tariffInformation": {"demandWindow": false}},
                {"nemTime": "2025-01-01T01:00:00+10:00", "kwh": 1.2, "perKwh": 25, "channelIdentifier": "general", "type": "general", "tariffInformation": {"demandWindow": false}},
                {"nemTime": "2025-01-01T00:30:00+10:00", "kwh": 0.5, "perKwh": -10, "channelIdentifier": "feedIn", "type": "feedIn"}
            ]'''
        )

    page.route("**/api.amber.com.au/v1/sites", mock_api)
    page.route("**/api.amber.com.au/v1/sites/123/usage**", mock_usage_api)

    # Get the absolute path to the HTML file
    file_path = os.path.abspath('index.html')
    page.goto(f'file://{file_path}')

    # Fill in the form
    page.fill("#apiKey", "psk_dummy_key")
    page.fill("#startDate", "2025-01-01")
    page.fill("#endDate", "2025-01-01")

    # Click the fetch button
    page.click("#fetchData")

    # Wait for the results table to appear. This is a good indicator that the async operations are done.
    results_table = page.locator("#results-table-container table")
    expect(results_table).to_be_visible()

    # Now, check the plan selector text
    expect(page.locator("#planSelector > option[value='AGL - Standard']")).to_contain_text("(no difference)")

    # Take a screenshot of the plan selector
    plan_selector = page.locator("#planSelector")
    plan_selector.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)

print("Verification script finished and screenshot taken.")
