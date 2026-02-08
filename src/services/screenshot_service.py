"""
Screenshot Service for Goal Manifestation Agent.
Uses Playwright to capture screenshots of internal or external URLs.
"""
import logging
import os
import base64
from datetime import datetime

logger = logging.getLogger(__name__)

class ScreenshotService:
    """
    Captures screenshots of web pages.
    """
    
    def __init__(self):
        self.screenshot_dir = "data/screenshots"
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
    async def capture_url(self, url: str) -> str:
        """
        Captures a screenshot of the given URL.
        Returns the local file path to the screenshot.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright not installed. Cannot take screenshot.")
            return ""

        filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        filepath = os.path.join(self.screenshot_dir, filename)
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Set viewport size
                await page.set_viewport_size({"width": 1280, "height": 720})
                
                # Go to URL and wait for load
                try:
                    await page.goto(url, wait_until="networkidle", timeout=30000)
                except Exception as e:
                    logger.warning(f"Timeout waiting for network idle, taking screenshot anyway: {e}")
                
                await page.screenshot(path=filepath)
                await browser.close()
                
                logger.info(f"Screenshot taken: {filepath}")
                return filepath
                
        except Exception as e:
            logger.error(f"Failed to capture screenshot of {url}: {e}")
            return ""

    async def capture_url_base64(self, url: str) -> str:
        """
        Captures screenshot and returns base64 string (useful for sending to LLM).
        """
        filepath = await self.capture_url(url)
        if not filepath or not os.path.exists(filepath):
            return ""
            
        with open(filepath, "rb") as img_file:
            return base64.b64encode(img_file.read()).decode('utf-8')

# Singleton
screenshot_service = ScreenshotService()
