"""
Playwright 站点冒烟测试：验证 tradelovin.com 关键页面可访问且渲染正常。
"""
from playwright.sync_api import sync_playwright
import sys

BASE = "https://tradelovin.com"

PAGES = [
    ("/", "首页"),
    ("/courses", "教学视频列表"),
    ("/login", "登录页"),
    ("/register", "注册页"),
]

def main():
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
        )
        page = ctx.new_page()

        for path, label in PAGES:
            url = BASE + path
            try:
                resp = page.goto(url, wait_until="networkidle", timeout=30000)
                status = resp.status if resp else 0
                title = page.title()
                # 检查页面是否有内容（body 不为空）
                body_text = page.inner_text("body")[:200].replace("\n", " ")
                print(f"[{'OK' if status == 200 else 'WARN'}] {label} {path}")
                print(f"  status={status}  title={title[:60]}")
                print(f"  body_preview={body_text[:120]}")
                if status != 200:
                    failures.append(f"{path}: status {status}")
            except Exception as e:
                print(f"[FAIL] {label} {path}")
                print(f"  error={e}")
                failures.append(f"{path}: {e}")

        # 额外检查：教学视频列表是否有视频项
        try:
            page.goto(f"{BASE}/courses", wait_until="networkidle", timeout=30000)
            # 等一下客户端渲染
            page.wait_for_timeout(3000)
            video_items = page.query_selector_all("ul li a[href*='video-player']")
            print(f"\n[CHECK] 教学视频列表视频项数量: {len(video_items)}")
            if len(video_items) == 0:
                failures.append("/courses: 无视频项")
        except Exception as e:
            print(f"\n[CHECK] 视频列表检查失败: {e}")
            failures.append(f"/courses check: {e}")

        browser.close()

    print("\n" + "=" * 50)
    if failures:
        print(f"结果: {len(failures)} 项失败")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("结果: 全部通过")
        sys.exit(0)

if __name__ == "__main__":
    main()
