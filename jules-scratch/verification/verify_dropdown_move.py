from playwright.sync_api import sync_playwright
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get the absolute path to the HTML file
        file_path = os.path.abspath('index.html')

        # Go to the local HTML file
        page.goto(f'file://{file_path}')

        # 1. Initial state: Configuration is visible
        page.screenshot(path='jules-scratch/verification/01_initial_state.png')

        # 2. Click the "Hide" button
        toggle_button = page.locator('#toggleConfigBtn')
        toggle_button.click()

        # Wait for the animation to complete
        page.wait_for_timeout(500)

        # 3. Hidden state: Dropdown should be in the header
        page.screenshot(path='jules-scratch/verification/02_hidden_state.png')

        # 4. Click the "Show" button
        toggle_button.click()

        # Wait for the animation to complete
        page.wait_for_timeout(500)

        # 5. Shown state: Dropdown should be back in its original position
        page.screenshot(path='jules-scratch/verification/03_shown_state.png')

        browser.close()

if __name__ == "__main__":
    run_verification()