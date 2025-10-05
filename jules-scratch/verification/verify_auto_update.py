from playwright.sync_api import sync_playwright, Page, expect
import os
import json

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock API responses
        def mock_sites_api(route):
            route.fulfill(
                status=200,
                headers={"Content-Type": "application/json"},
                body=json.dumps([
                    {
                        "id": "01H0K3V01S4F3Q0N7N0J4X1X7X",
                        "nmi": "1234567890",
                        "channels": [
                            {"identifier": "E1", "type": "general"},
                            {"identifier": "B1", "type": "feedIn"}
                        ],
                        "network": "United Energy",
                        "status": "active"
                    }
                ])
            )

        def mock_usage_api(route):
            # A minimal usage payload
            route.fulfill(
                status=200,
                headers={"Content-Type": "application/json"},
                body=json.dumps([
                    {
                        "channelIdentifier": "E1", "nemTime": "2025-01-01T00:30:00+11:00",
                        "perKwh": 30.0, "kwh": 1.5, "type": "usage",
                        "tariffInformation": {"demandWindow": False}
                    },
                    {
                        "channelIdentifier": "B1", "nemTime": "2025-01-01T12:30:00+11:00",
                        "perKwh": -10.0, "kwh": 0.5, "type": "feedIn",
                        "tariffInformation": {"demandWindow": False}
                    }
                ])
            )

        page.route("https://api.amber.com.au/v1/sites", mock_sites_api)
        page.route("https://api.amber.com.au/v1/sites/**/usage**", mock_usage_api)

        # Go to the local HTML file
        file_path = os.path.abspath('index.html')
        page.goto(f'file://{file_path}')

        # 1. Fill in API key and click "Compare Costs"
        page.locator("#apiKey").fill("psk_dummy_key")
        page.locator("#fetchData").click()

        # 2. Wait for initial results and take a screenshot
        results_table_header = page.locator("th", has_text="Other Supplier")
        expect(results_table_header).to_be_visible()
        page.screenshot(path='jules-scratch/verification/01_initial_results.png')

        # 3. Change the plan
        page.locator("#stateSelector").select_option("NSW")
        page.locator("#planSelector").select_option("AGL - Standard")

        # 4. Wait for the results to update automatically and take a screenshot
        updated_results_header = page.locator("th", has_text="AGL - Standard")
        expect(updated_results_header).to_be_visible()
        page.screenshot(path='jules-scratch/verification/02_updated_results.png')

        browser.close()

if __name__ == "__main__":
    run_verification()