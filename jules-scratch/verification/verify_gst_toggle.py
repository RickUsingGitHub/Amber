from playwright.sync_api import sync_playwright, expect
import re

def run(playwright):
    chromium = playwright.chromium
    browser = chromium.launch(headless=True)
    page = browser.new_page()

    # Mock site data
    mock_sites_data = [{
        "id": "01H8X2J4P9Z5R6Q7S8T9V0W1X2",
        "nmi": "1234567890",
        "channels": [
            {"identifier": "E1", "type": "general"},
            {"identifier": "B1", "type": "feedIn"}
        ],
        "network": "NEM",
        "status": "active"
    }]

    # Corrected mock usage data with UTC timestamps and tariffInformation
    mock_usage_data = [
        {"channelIdentifier": "E1", "nemTime": "2025-01-01T12:00:00Z", "perKwh": 30, "kwh": 2.5, "type": "usage", "tariffInformation": {"demandWindow": False}},
        {"channelIdentifier": "B1", "nemTime": "2025-01-01T14:00:00Z", "perKwh": -10, "kwh": 1.0, "type": "usage", "tariffInformation": {"demandWindow": False}}
    ]

    def handle_route(route):
        if "api.amber.com.au/v1/sites" in route.request.url:
            route.fulfill(status=200, json=mock_sites_data)
        elif "api.amber.com.au/v1/sites/01H8X2J4P9Z5R6Q7S8T9V0W1X2/usage" in route.request.url:
            route.fulfill(status=200, json=mock_usage_data)
        else:
            route.continue_()

    page.route("**/*", handle_route)

    # Go to the local file
    page.goto("file:///app/index.html")

    # Clear local storage now that we are on the correct origin
    page.evaluate('localStorage.clear()')

    # Reload the page to apply the cleared storage
    page.reload()

    # Fill in the form
    page.locator("#apiKey").fill("psk_dummy_key")
    page.locator("#startDate").fill("2025-01-01")
    page.locator("#endDate").fill("2025-01-01")

    # Click the compare button
    page.locator("#fetchData").click()

    # Wait for the results to be displayed
    results_table = page.locator("#results-table-container")
    expect(results_table).to_be_visible(timeout=10000)

    # Wait for the total cost with GST ON. The total row has a specific background color.
    total_row_gst_on = page.locator("tr.bg-gray-50.font-bold")
    expect(total_row_gst_on.locator("td", has_text=re.compile(r"\$2\.56"))).to_be_visible()

    # Take a screenshot with GST ON
    page.screenshot(path="jules-scratch/verification/gst_on.png")

    # Click the GST toggle
    page.locator("#gstToggle").click()

    # Wait for the total cost with GST OFF
    total_row_gst_off = page.locator("tr.bg-gray-50.font-bold")
    expect(total_row_gst_off.locator("td", has_text=re.compile(r"\$2\.31"))).to_be_visible()

    # Take a screenshot with GST OFF
    page.screenshot(path="jules-scratch/verification/gst_off.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)

print("Verification script executed successfully.")