"""
EMAIL_HEADER_PARSER.py
ThreatLens Email Header Intelligence & Cousin Domain Spoofing Engine.

Parses 'From:', 'To:', and 'Reply-To:' headers in email text, extracting
display names, email addresses, and domains.
Detects Cousin / Lookalike domain masquerading (inserted hyphens, TLD mismatches,
typosquatting) and Executive Display Name Impersonation.
"""

import re

EXECUTIVE_TITLES = [
    r'\bceo\b', r'\bcfo\b', r'\bcoo\b', r'\bcto\b', r'\bpresident\b',
    r'\bdirector\b', r'\bvice president\b', r'\bvp\b', r'\bmanaging director\b',
    r'\bchairman\b', r'\bhead of\b', r'\bpartner\b', r'\bfounder\b'
]

def extract_email_address(raw_str):
    """
    Extracts email address and display name from a header string like:
    'Michael Reyes, CEO <m.reyes.ceo@northwind-holdings.co> [2]'
    """
    # Look for address inside angle brackets: <email@domain.com>
    bracket_match = re.search(r'<([^>]+@[^>]+)>', raw_str)
    if bracket_match:
        addr = bracket_match.group(1).strip()
        display_name = raw_str[:bracket_match.start()].strip()
        return display_name, addr
    
    # Otherwise look for standalone email: email@domain.com
    bare_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', raw_str)
    if bare_match:
        addr = bare_match.group(0).strip()
        display_name = raw_str[:bare_match.start()].strip()
        return display_name, addr
        
    return raw_str.strip(), ""

def split_domain(domain):
    """
    Splits domain like 'northwind-holdings.co' into ('northwind-holdings', 'co')
    """
    parts = domain.lower().split('.')
    if len(parts) >= 2:
        return '.'.join(parts[:-1]), parts[-1]
    return domain.lower(), ""

def compute_levenshtein(s1, s2):
    """Simple Levenshtein distance between two strings"""
    if len(s1) < len(s2):
        return compute_levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            insert = prev[j + 1] + 1
            delete = curr[j] + 1
            sub = prev[j] + (c1 != c2)
            curr.append(min(insert, delete, sub))
        prev = curr
    return prev[-1]

def analyze_email_headers(text):
    """
    Parses 'From:' and 'To:' lines in text and audits domain authenticity.
    """
    from_match = re.search(r'^(?:From|Sender):\s*(.+)$', text, re.IGNORECASE | re.MULTILINE)
    to_match = re.search(r'^(?:To|Recipient):\s*(.+)$', text, re.IGNORECASE | re.MULTILINE)

    if not from_match:
        return {'has_headers': False, 'score': 0, 'indicators': []}

    sender_display, sender_addr = extract_email_address(from_match.group(1))
    recip_display, recip_addr = extract_email_address(to_match.group(1)) if to_match else ("", "")

    sender_domain = sender_addr.split('@')[-1].lower() if '@' in sender_addr else ""
    recip_domain = recip_addr.split('@')[-1].lower() if '@' in recip_addr else ""

    indicators = []
    score = 0
    is_cousin_spoof = False
    spoof_details = []

    # Check for Executive Display Name Impersonation
    has_exec_title = any(re.search(title, sender_display, re.IGNORECASE) for title in EXECUTIVE_TITLES)
    if has_exec_title:
        indicators.append({
            'name': 'Executive Display Name Impersonation (CEO / Executive Title)',
            'severity': 'HIGH',
            'score_impact': 25,
            'description': f"Sender display name ('{sender_display}') claims executive leadership authority to compel immediate compliance."
        })
        score += 25

    # Check Cousin / Lookalike Domain Spoofing against Recipient Domain
    if sender_domain and recip_domain and sender_domain != recip_domain:
        s_root, s_tld = split_domain(sender_domain)
        r_root, r_tld = split_domain(recip_domain)

        # 1. Hyphen insertion / deletion check (e.g. northwind-holdings vs northwindholdings)
        s_root_nohyphen = s_root.replace('-', '')
        r_root_nohyphen = r_root.replace('-', '')

        if s_root_nohyphen == r_root_nohyphen and s_root != r_root:
            is_cousin_spoof = True
            spoof_details.append(f"Inserted hyphen in root domain ('{s_root}' vs legitimate '{r_root}')")

        # 2. Levenshtein typosquat distance
        edit_dist = compute_levenshtein(s_root_nohyphen, r_root_nohyphen)
        if 1 <= edit_dist <= 2 and not is_cousin_spoof:
            is_cousin_spoof = True
            spoof_details.append(f"Character edit distance of {edit_dist} ('{s_root}' vs '{r_root}')")

        # 3. TLD Mismatch (.co vs .com, .site vs .com, etc.)
        if s_tld != r_tld:
            if s_tld in ('co', 'xyz', 'site', 'top', 'info', 'cc', 'org', 'biz', 'net') and r_tld == 'com':
                spoof_details.append(f"Cousin TLD spoofing: sender uses '.{s_tld}' to mimic corporate '.{r_tld}'")
                if s_root_nohyphen == r_root_nohyphen or is_cousin_spoof:
                    is_cousin_spoof = True

        if is_cousin_spoof:
            impact = 50
            score += impact
            indicators.append({
                'name': f"Deceptive Cousin Domain Spoofing ({sender_domain} vs {recip_domain})",
                'severity': 'CRITICAL',
                'score_impact': impact,
                'description': f"CRITICAL IDENTITY THEFT: The sender address '{sender_addr}' is registered on a fraudulent lookalike domain '{sender_domain}' mimicking the internal corporate domain '{recip_domain}'. Attack technique: {'; '.join(spoof_details)}."
            })

    return {
        'has_headers': True,
        'sender_display': sender_display,
        'sender_addr': sender_addr,
        'sender_domain': sender_domain,
        'recip_addr': recip_addr,
        'recip_domain': recip_domain,
        'is_cousin_spoof': is_cousin_spoof,
        'has_exec_title': has_exec_title,
        'score': score,
        'indicators': indicators
    }
