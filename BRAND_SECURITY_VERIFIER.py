"""
BRAND_SECURITY_VERIFIER.py
ThreatLens Brand Security & Authentication Email Verification Engine.

Evaluates security notifications, password resets, login alerts, and account recoveries
for Google, Steam (Valve), Microsoft, and Amazon.
Differentiates authentic security alerts (2-5% Safe) from deceptive password-harvesting
phishing campaigns (95-99% Critical).
"""

import re

BRAND_SPECS = {
    'google': {
        'name': 'Google Account Security',
        'official_domains': ['google.com', 'accounts.google.com', 'googlemail.com'],
        'official_senders': ['no-reply@accounts.google.com', 'googlealerts-noreply@google.com'],
        'official_url_domains': ['google.com', 'accounts.google.com', 'myaccount.google.com'],
        'code_regex': r'\bG-[0-9]{6}\b',
        'was_this_you_patterns': [
            r'is it you trying to sign in\?',
            r'is this you trying to sign in\?',
            r'check activity',
            r'we noticed a new sign-in to your google account',
            r'new sign-in on',
            r'security alert.*new sign-in',
            r'your password was changed'
        ],
        'official_disclaimers': [
            r'you don\'t need to do anything',
            r'safely ignore this email',
            r'myaccount\.google\.com',
            r'google will never ask for your password'
        ]
    },
    'steam': {
        'name': 'Steam / Valve Guard Security',
        'official_domains': ['steampowered.com', 'steamcommunity.com'],
        'official_senders': ['noreply@steampowered.com'],
        'official_url_domains': ['steampowered.com', 'steamcommunity.com', 'help.steampowered.com'],
        'code_regex': r'\b[A-Z0-9]{5}\b',  # Steam Guard 5-character alphanumeric
        'was_this_you_patterns': [
            r'your steam account: access from new (?:web or mobile )?device',
            r'access from new computer or web browser',
            r'here is the steam guard code',
            r'account recovery request has been submitted',
            r'steam account recovery',
            r'password reset request for your steam account'
        ],
        'official_disclaimers': [
            r'steam support will never ask (?:you )?for your password',
            r'support will never ask for your password or steam guard code',
            r'if you are not attempting to (?:log in|recover your account)',
            r'help\.steampowered\.com'
        ]
    },
    'microsoft': {
        'name': 'Microsoft Account Security',
        'official_domains': ['microsoft.com', 'accountprotection.microsoft.com', 'live.com'],
        'official_senders': ['account-security-noreply@accountprotection.microsoft.com', 'accountprotection.microsoft.com'],
        'official_url_domains': ['microsoft.com', 'account.live.com', 'login.live.com', 'login.microsoftonline.com'],
        'code_regex': r'\b[0-9]{6,7}\b',  # Microsoft 6 or 7-digit security code
        'was_this_you_patterns': [
            r'microsoft account unusual sign-in activity',
            r'unusual sign-in activity',
            r'someone may have accessed your account',
            r'single-use code to use with your microsoft account',
            r'microsoft account password reset',
            r'microsoft account security code',
            r'we detected something unusual about a recent sign-in'
        ],
        'official_disclaimers': [
            r'if this was you, you can safely ignore',
            r'if you didn\'t request this code',
            r'account\.live\.com',
            r'recent activity page'
        ]
    },
    'amazon': {
        'name': 'Amazon Security & OTP Service',
        'official_domains': ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de', 'amazon.ca'],
        'official_senders': ['account-update@amazon.com', 'no-reply@amazon.com'],
        'official_url_domains': ['amazon.com', 'amazon.in', 'amazon.co.uk', 'amazon.de', 'amazon.ca'],
        'code_regex': r'\b[0-9]{6}\b',  # Amazon 6-digit numeric OTP
        'was_this_you_patterns': [
            r'amazon security alert: sign-in attempt',
            r'did you just sign in\?',
            r'amazon password assistance',
            r'verify your new amazon account',
            r'sign-in attempt from a device or location we don\'t recognize',
            r'use the following one-time password \(otp\)'
        ],
        'official_disclaimers': [
            r'do not share this (?:code|otp) with anyone',
            r'amazon (?:customer service )?will never ask (?:you )?for your password',
            r'amazon will never ask for your password or otp',
            r'we hope to see you again soon'
        ]
    }
}

# Deceptive password harvesting phrases
PASSWORD_HARVEST_PATTERNS = [
    r'\bconfirm (?:your )?(?:current|old|existing) password\b',
    r'\bverify (?:your )?(?:current|account) password\b',
    r'\benter (?:your )?(?:current|old) password\b',
    r'\bre-enter your password\b',
    r'\breply with your password\b',
    r'\bsend your password\b',
    r'\bkeep your (?:current )?password\b',
    r'\bupdate your password to prevent (?:account )?deletion\b',
    r'\bpassword expires? (?:in|today|within)\b',
    r'\baccount (?:will be|is) (?:suspended|terminated|deleted|locked) within [0-9]+ hours?\b',
    r'\bavoid (?:permanent )?(?:ban|closure|suspension)\b'
]

# Fraudulent "Money Credited / Cash Refund / Wallet Grant" bait phrases
MONEY_CREDITED_PATTERNS = [
    r'\b(?:has been|have been|is) credited to (?:your )?(?:account|wallet|balance)\b',
    r'\b(?:cash|unclaimed|bonus|refund|grant) (?:balance|payout|grant|deposit) (?:of|is waiting)\b',
    r'\bclick (?:here )?to claim (?:your )?(?:money|cash|refund|credit|bonus|grant)\b',
    r'\bdeposit (?:has been )?processed into your\b',
    r'\bwallet credit has been credited\b',
    r'\breceive (?:your )?(?:funds|grant|refund payout)\b'
]

# Legitimate marketing / promotional / holiday sale patterns
PROMOTIONAL_PATTERNS = [
    r'\b(?:summer|winter|autumn|spring|holiday|black friday|cyber monday|prime day|big deal days|clearance) sale\b',
    r'\bsave up to [0-9]+%\b',
    r'\b(?:exclusive|special|limited-time) (?:deals|discounts|offers?)\b',
    r'\bon your wishlist\b',
    r'\bshop now\b',
    r'\bunsubscribe\b'
]

def detect_brand(text, from_header=""):
    """
    Identifies if an email claims to originate from or represent Google, Steam, Microsoft, or Amazon.
    Prioritizes From: header and Subject: header over body text (ignoring To: recipient addresses).
    """
    # 1. First priority: Check From: header / address
    from_lower = from_header.lower()
    if 'steam' in from_lower or 'valve' in from_lower:
        return 'steam'
    if 'amazon' in from_lower:
        return 'amazon'
    if 'microsoft' in from_lower or 'office365' in from_lower or 'accountprotection' in from_lower or 'live.com' in from_lower:
        return 'microsoft'
    if 'google' in from_lower or 'accounts.google' in from_lower or 'googlemail' in from_lower:
        return 'google'

    # 2. Second priority: Check Subject: line
    subj_match = re.search(r'^(?:Subject|Subj):\s*(.+)$', text, re.IGNORECASE | re.MULTILINE)
    if subj_match:
        subj = subj_match.group(1).lower()
        if 'steam' in subj or 'valve' in subj:
            return 'steam'
        if 'amazon' in subj:
            return 'amazon'
        if 'microsoft' in subj or 'office365' in subj or 'outlook' in subj:
            return 'microsoft'
        if 'google' in subj:
            return 'google'

    # 3. Third priority: Clean body (strip out "To: ...@..." recipient line to avoid user email false matches!)
    clean_body = re.sub(r'^(?:To|Recipient):\s*.+$', '', text, flags=re.IGNORECASE | re.MULTILINE)[:600].lower()
    if 'steam' in clean_body or 'valve' in clean_body or 'steam guard' in clean_body:
        return 'steam'
    if 'amazon' in clean_body:
        return 'amazon'
    if 'microsoft' in clean_body or 'office 365' in clean_body:
        return 'microsoft'
    if 'google' in clean_body or 'accounts.google' in clean_body:
        return 'google'

    return None

def verify_brand_security_email(text, from_addr="", from_domain=""):
    """
    Comprehensive brand security and password verification analyzer:
    1. Detects claimed brand.
    2. Validates From: domain against official brand authority.
    3. Evaluates structural confirmation patterns (OTP, Was This You, telemetry, disclaimers).
    4. Evaluates aggressive password solicitation & credential harvesting threats.
    """
    raw = text.strip()
    brand_key = detect_brand(raw, from_addr)
    
    if not brand_key:
        return {'is_brand_security': False, 'score': 0, 'indicators': []}

    spec = BRAND_SPECS[brand_key]
    indicators = []
    score = 0
    
    # 1. Domain Authenticity
    is_official_domain = False
    clean_domain = from_domain.lower() if from_domain else ""
    if clean_domain:
        is_official_domain = any(clean_domain == d or clean_domain.endswith('.' + d) for d in spec['official_domains'])

    # 2. Extract Embedded Links/Domains in email body
    found_urls = re.findall(r'https?://([a-zA-Z0-9.-]+)', raw)
    has_unverified_url = False
    for u in found_urls:
        u_clean = u.lower()
        if not any(u_clean == od or u_clean.endswith('.' + od) for od in spec['official_url_domains']):
            has_unverified_url = True
            break

    # 3. Check for Malicious Password Harvesting & Suspension Threats
    harvest_matches = []
    for pat in PASSWORD_HARVEST_PATTERNS:
        m = re.search(pat, raw, re.IGNORECASE)
        if m:
            harvest_matches.append(m.group(0))

    # 4. Check for Authentic Confirmation Patterns
    has_was_this_you = any(re.search(p, raw, re.IGNORECASE) for p in spec['was_this_you_patterns'])
    has_auth_disclaimer = any(re.search(p, raw, re.IGNORECASE) for p in spec['official_disclaimers'])
    has_valid_code = bool(re.search(spec['code_regex'], raw))
    has_telemetry = bool(re.search(r'\b(?:device|browser|location|ip address|near)\b', raw, re.IGNORECASE))

    # 5. Check for Fraudulent "Money Credited" Bait
    money_credited_matches = []
    for pat in MONEY_CREDITED_PATTERNS:
        m = re.search(pat, raw, re.IGNORECASE)
        if m:
            money_credited_matches.append(m.group(0))

    # 6. Check for Legitimate Brand Promotion / Sale
    promotional_matches = []
    for pat in PROMOTIONAL_PATTERNS:
        m = re.search(pat, raw, re.IGNORECASE)
        if m:
            promotional_matches.append(m.group(0))

    # --- DECISION LOGIC ---

    # Case A1: FRAUDULENT "MONEY CREDITED / REFUND" BAIT
    if money_credited_matches and (not is_official_domain or has_unverified_url or harvest_matches):
        score = 98
        indicators.append({
            'name': f"Fraudulent 'Money Credited' Financial Bait ({spec['name']} Impersonation)",
            'severity': 'CRITICAL',
            'score_impact': 65,
            'description': f"CRITICAL FINANCIAL LURE: Email deceptively claims that money, wallet credit, or a refund has been credited to your account (\"{money_credited_matches[0]}\"). Attackers exploit brand recognition to lure victims into entering account credentials or payment details on phishing portals."
        })

        if not is_official_domain and clean_domain:
            indicators.append({
                'name': f"Unauthorized Impostor Sender Domain ({clean_domain})",
                'severity': 'CRITICAL',
                'score_impact': 40,
                'description': f"Sender domain '{clean_domain}' is not authorized by {spec['name']}. Authentic domain: {', '.join(spec['official_domains'])}."
            })

        if has_unverified_url:
            indicators.append({
                'name': 'Unverified External Claim Link in Financial Notice',
                'severity': 'HIGH',
                'score_impact': 25,
                'description': f"Financial notification directs user to an external link outside {spec['name']} infrastructure."
            })

        return {
            'is_brand_security': True,
            'brand': brand_key,
            'is_phishing': True,
            'is_authentic': False,
            'score': 98,
            'indicators': indicators,
            'verdict': f"Fake Financial Credit Phishing Lure ({spec['name']} Impersonation)",
            'recommendation': f"⛔ DO NOT CLAIM: Fraudulent financial incentive lure impersonating {spec['name']}. Cybercriminals use fake wallet balances and refund claims to harvest logins. Do not click links or provide credentials."
        }

    # Case A2: DECEPTIVE PASSWORD HARVESTING / FAKE SECURITY ALERT
    if harvest_matches or (not is_official_domain and (has_unverified_url or has_was_this_you)):
        score = 98
        is_phishing = True
        
        indicators.append({
            'name': f"Deceptive Password-Harvesting Lure ({spec['name']} Impersonation)",
            'severity': 'CRITICAL',
            'score_impact': 65,
            'description': f"CRITICAL SECURITY ALERT: Email claims to be from {spec['name']}, but solicits credential verification or directs users to an unverified domain. Official platforms (Google, Microsoft, Steam, Amazon) NEVER ask users to confirm, type, or reply with their passwords."
        })

        if harvest_matches:
            indicators.append({
                'name': 'Credential Solicitation & Suspension Extortion',
                'severity': 'CRITICAL',
                'score_impact': 30,
                'description': f"Email uses coercive terminology: \"{', '.join(harvest_matches[:2])}\". Reputable security teams send self-service verification codes and never demand existing passwords."
            })

        if not is_official_domain and clean_domain:
            indicators.append({
                'name': f"Unauthorized Impostor Sender Domain ({clean_domain})",
                'severity': 'CRITICAL',
                'score_impact': 40,
                'description': f"The sender address uses domain '{clean_domain}', which is NOT an authorized web property for {spec['name']}. Authentic domain: {', '.join(spec['official_domains'])}."
            })

        if has_unverified_url:
            indicators.append({
                'name': 'Unverified External Link in Security Alert',
                'severity': 'HIGH',
                'score_impact': 25,
                'description': f"Security alert embeds external hyperlink leading outside official {spec['name']} web infrastructure."
            })

        return {
            'is_brand_security': True,
            'brand': brand_key,
            'is_phishing': True,
            'is_authentic': False,
            'score': min(99, score),
            'indicators': indicators,
            'verdict': f"Deceptive Password-Harvesting Phishing Attack ({spec['name']} Impersonation)",
            'recommendation': f"⛔ IMMEDIATE ACTION REQUIRED: This is a fraudulent credential harvesting trap impersonating {spec['name']}. Do NOT enter your password or click any links. Legitimate {spec['name']} alerts never request passwords."
        }

    # Case B1: AUTHENTIC CONFIRMATION / SIGN-IN VERIFICATION
    if is_official_domain and (has_was_this_you or has_valid_code or has_auth_disclaimer) and not harvest_matches:
        score = -45
        indicators.append({
            'name': f"Verified Official Security Notification ({spec['name']})",
            'severity': 'SAFE',
            'score_impact': -45,
            'description': f"Verified authentic security alert from {spec['name']} ({clean_domain}). The message adheres to standard platform verification formats (Code/Telemetry/Official Disclaimer) and does not solicit sensitive passwords."
        })

        if has_was_this_you:
            indicators.append({
                'name': 'Standard Login Verification Telemetry ("Was this you?")',
                'severity': 'SAFE',
                'score_impact': 0,
                'description': "Matches standard sign-in verification protocol displaying session telemetry without requesting credentials."
            })

        if has_auth_disclaimer:
            indicators.append({
                'name': 'Standard Zero-Password Disclaimer Verified',
                'severity': 'SAFE',
                'score_impact': 0,
                'description': f"Contains mandatory security advisory affirming that {spec['name']} support will never ask for your password."
            })

        return {
            'is_brand_security': True,
            'brand': brand_key,
            'is_phishing': False,
            'is_authentic': True,
            'score': 2,
            'indicators': indicators,
            'verdict': f"Verified Official Security Notification ({spec['name']})",
            'recommendation': f"✅ AUTHENTIC {spec['name'].upper()} SECURITY DISPATCH: Validated authoritative notification. If you did not initiate this sign-in or code, log in to your official account dashboard directly to review recent security activity."
        }

    # Case B2: OFFICIAL BRAND PROMOTIONAL / HOLIDAY MARKETING
    if is_official_domain and promotional_matches and not harvest_matches and not has_unverified_url:
        indicators.append({
            'name': f"Official Brand Promotion / Sale Notice Verified ({spec['name']})",
            'severity': 'SAFE',
            'score_impact': 0,
            'description': f"Authentic promotional marketing dispatch from {spec['name']} ({clean_domain}). Matches standard catalog/holiday sale notification structure without credential requests."
        })

        return {
            'is_brand_security': True,
            'brand': brand_key,
            'is_phishing': False,
            'is_authentic': True,
            'is_promotional': True,
            'score': 10,
            'indicators': indicators,
            'verdict': f"Verified Official Brand Promotional Email ({spec['name']})",
            'recommendation': f"✅ SAFE COMMERCIAL MARKETING: Legitimate promotional dispatch from {spec['name']}. Standard holiday sale or product marketing; no credential harvesting or malicious vectors observed."
        }

    return {'is_brand_security': False, 'score': 0, 'indicators': []}
