import sys
from app import evaluate_url, evaluate_message

print("--- Testing URL Engine ---")
test_urls = [
    ("https://fitgirl-repacks.site", "Official FitGirl"),
    ("https://fitgirl-repacks.to", "Known Clone FitGirl (.to)"),
    ("https://fitgir1-repacks.xyz", "Known Clone FitGirl (typosquat .xyz)"),
    ("https://fitgirl-repack.com", "Known Clone FitGirl (.com)"),
    ("https://fitgirl-repacks.unknown-shady.party", "Zero-day Unverified Clone"),
    ("https://sci-hub.se", "Official Sci-Hub (.se)"),
    ("https://sci-hub.top/paper/123", "Known Clone Sci-Hub (.top)"),
    ("https://steamunlocked.net", "Official SteamUnlocked"),
    ("https://steamun1ocked.net", "Known Clone SteamUnlocked"),
    ("https://thepiratebay.org", "Official The Pirate Bay"),
    ("https://pirateproxy.live", "Known Clone Pirate Bay Mirror"),
    ("https://www.google.com", "Legitimate Google Domain")
]

for url, label in test_urls:
    res = evaluate_url(url)
    print(f"[{res['risk_level']}] {label}")
    print(f"  URL: {url}")
    print(f"  Score: {res['score']}% | Verdict: {res['verdict']}")
    print(f"  Category: {res['threat_category']}")
    print(f"  Official Piracy: {res['metadata'].get('is_official_piracy')} | Clone: {res['metadata'].get('is_piracy_clone')} | Known Clone: {res['metadata'].get('is_known_clone')}")
    print()

print("\n--- Testing Hyper-Personalized Email Engine ---")
test_emails = [
    ("Are you at your desk? I'm in a conference and can't take calls. Need you to update my direct deposit routing details before payroll cutoff today.", "BEC Payroll Diversion"),
    ("Can you please handle an urgent wire transfer for an overdue vendor invoice? Payment instructions have changed so process this wire immediately.", "BEC Wire Fraud"),
    ("I need you to buy some apple gift cards for client gifts. Scratch off the back and send pictures of the codes ASAP.", "Executive Gift Card Scam"),
    ("Hey team, don't forget our weekly sync tomorrow at 10 AM. See the agenda doc.", "Legitimate Internal Email")
]

for text, label in test_emails:
    res = evaluate_message(text, 'email')
    print(f"[{res['risk_level']}] {label}")
    print(f"  Score: {res['score']}% | Verdict: {res['verdict']}")
    print(f"  Category: {res['threat_category']}")
    print()
