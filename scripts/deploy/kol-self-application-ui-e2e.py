"""KOL 自荐 UI 冒烟：partner-dashboard 页面与表单元素。"""
from playwright.sync_api import sync_playwright
import os
import sys

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
failures: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    try:
        resp = page.goto(f"{BASE}/partner-dashboard", wait_until="networkidle", timeout=60000)
        status = resp.status if resp else 0
        print(f"[INFO] partner-dashboard status={status} url={page.url}")
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        for needle, label in [("自荐", "tabSelf"), ("邀请码", "tabInvite"), ("小红书", "platform")]:
            ok = needle in body
            tag = "OK" if ok else "FAIL"
            print(f"[{tag}] UI contains {needle!r} ({label})")
            if not ok:
                failures.append(label)

        email = page.locator('input[type="email"]').first
        if email.count() > 0:
            email.fill("ui-e2e@test.tradelovin.local")
            print("[OK] email input fillable")
        else:
            print("[FAIL] email input not found")
            failures.append("email input")

        submit = page.get_by_role("button", name="发送验证码并继续")
        if submit.count() == 0:
            submit = page.locator("button").filter(has_text="验证码")
        if submit.count() > 0:
            print("[OK] submit button visible")
        else:
            print("[FAIL] submit button not found")
            failures.append("submit button")
    except Exception as e:
        print(f"[FAIL] {e}")
        failures.append(str(e))
    finally:
        browser.close()

if failures:
    print("UI E2E FAILED:", failures)
    sys.exit(1)
print("UI E2E PASSED")
