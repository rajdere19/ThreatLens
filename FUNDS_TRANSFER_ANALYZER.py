"""
FUNDS_TRANSFER_ANALYZER.py
ThreatLens Semantic Slot-Filling & Sentence-Bounded Financial Transaction Engine.

Extracts sentence boundaries using left and right sentence delimiters ('.', '!', '?', '\n')
around financial pivot phrases ("transfer of", "payment of", "wire of", etc.).
Dynamically analyzes the Left Window (Authority Mandate & Action Verbs) and
Right Window (Monetary Values & Beneficiary Destinations) without black-box ML.
"""

import re

# Primary transaction pivot phrases (anchors)
PIVOT_PATTERNS = [
    r'\btransfer of\b',
    r'\bwire of\b',
    r'\bpayment of\b',
    r'\bremittance of\b',
    r'\bsend of\b',
    r'\bwire transfer\b',
    r'\bprocess (?:a )?wire\b',
    r'\binvoice of\b',
    r'\bamount of\b',
    r'\bdisbursement of\b',
    r'\bsettlement of\b'
]

# Action verbs in left window (stemmed)
ACTION_VERBS = [
    r'\bprocess(?:ing|ed|es)?\b',
    r'\bexecut(?:e|ing|ed|es)\b',
    r'\binitiat(?:e|ing|ed|es)\b',
    r'\bsend(?:ing)?\b',
    r'\breleas(?:e|ing|ed|es)\b',
    r'\bwire(?:d|ing)?\b',
    r'\bremit(?:ting|ted)?\b',
    r'\bapprov(?:e|ing|ed|es)\b',
    r'\bclear(?:ing|ed)?\b',
    r'\bissu(?:e|ing|ed|es)\b',
    r'\bfacilitat(?:e|ing|ed|es)\b',
    r'\barrang(?:e|ing|ed|es)\b',
    r'\bforward(?:ing|ed)?\b',
    r'\bauthoriz(?:e|ing|ed|es)\b'
]

# Authority & Mandate directives in left window
MANDATE_DIRECTIVES = [
    r'\bi need you to\b',
    r'\bplease\b',
    r'\byou must\b',
    r'\brequire you to\b',
    r'\byou are required to\b',
    r'\burgently\b',
    r'\basap\b',
    r'\bwithout delay\b',
    r'\bhandle this\b',
    r'\bauthorized\b',
    r'\bdirective\b',
    r'\bpriority\b'
]

# Evasive verification-avoidance & communication blackout patterns
# (Includes the user's probabilistic formulation: inability to review/validate + mandate to proceed)
VERIFICATION_AVOIDANCE_PATTERNS = [
    r'(?:validation|review|approval) (?:on|of) the (?:processing|payment) might not be done',
    r'might not be available to review',
    r'not available to review (?:the )?payment',
    r'payment must go through without fail',
    r'must go through without fail',
    r'must proceed without delay',
    r'can\'?t take calls',
    r'cannot take calls',
    r'in (?:back-to-back )?meetings',
    r'in a conference',
    r'reply (?:only )?here once',
    r'just reply here'
]

# Beneficiary / Destination risk markers in right window
BENEFICIARY_RISK_PATTERNS = [
    (r'\b(?:to|for|into) (?:a |the )?new vendor\b', 'Unverified New Vendor Account', 'CRITICAL', 25),
    (r'\b(?:to|into) (?:a |the )?(?:new|updated|different|external) (?:bank )?account\b', 'Diverted External Bank Account', 'CRITICAL', 25),
    (r'\b(?:to|for) (?:a |the )?(?:foreign|offshore|overseas) (?:supplier|contractor|vendor)\b', 'Foreign / Offshore Entity Transfer', 'HIGH', 20),
    (r'\bbanking details (?:are )?attached\b', 'Unsolicited Attached Banking Coordinates', 'HIGH', 18),
    (r'\bpayment instructions (?:have )?changed\b', 'Modified Payment Coordinates', 'CRITICAL', 25),
    (r'\bto beneficiary\b', 'Direct Beneficiary Remittance', 'MEDIUM', 10)
]

def is_sentence_boundary(text, idx):
    """Checks if character at idx is a true sentence delimiter and not a decimal point or abbreviation"""
    ch = text[idx]
    if ch in {'\n', '\r', '!', '?'}:
        return True
    if ch == '.':
        # Do not treat decimal points in numbers as sentence boundary (e.g. 48,750.00)
        if idx > 0 and text[idx - 1].isdigit() and idx + 1 < len(text) and text[idx + 1].isdigit():
            return False
        # Common time/unit abbreviations like p.m. or a.m.
        if idx >= 2 and text[idx-2:idx].lower() in ('am', 'pm'):
            return False
        return True
    return False

def find_sentence_boundaries(text, match_start, match_end):
    """
    Scans backwards from match_start to find the left sentence delimiter
    and forwards from match_end to find the right sentence delimiter.
    Ignores decimal points inside currency/floating-point values.
    Returns (sentence_start_idx, sentence_end_idx).
    """
    # Scan backward for left delimiter
    left_idx = match_start
    while left_idx > 0:
        if is_sentence_boundary(text, left_idx - 1):
            break
        left_idx -= 1
        
    # Scan forward for right delimiter
    right_idx = match_end
    text_len = len(text)
    while right_idx < text_len:
        if is_sentence_boundary(text, right_idx):
            right_idx += 1  # Include the fullstop in the sentence span
            break
        right_idx += 1
        
    return left_idx, right_idx

def parse_currency_amount(clause):
    """
    Extracts currency symbol and numeric amounts from the right window.
    Supports: $48,750.00, 48750 USD, €50,000, Rs. 4,999, ₹50,000, 50k, etc.
    """
    # Standard currency pattern: [$€£₹]|(?:USD|EUR|GBP|INR|Rs\.?) followed by digits
    pattern = r'([$€£₹]|(?:USD|EUR|GBP|INR|Rs\.?))\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?|\b[0-9]+k\b)'
    match = re.search(pattern, clause, re.IGNORECASE)
    
    if not match:
        # Check without leading currency symbol (e.g. 48,750.00 dollars)
        alt_pattern = r'\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s?(dollars|usd|euros|rupees)\b'
        alt_match = re.search(alt_pattern, clause, re.IGNORECASE)
        if alt_match:
            amount_str = alt_match.group(1).replace(',', '')
            try:
                val = float(amount_str)
                return {
                    'raw': alt_match.group(0),
                    'currency': alt_match.group(2).upper(),
                    'numeric': val,
                    'is_high_value': val >= 10000.0,
                    'is_corporate_wire_range': 5000.0 <= val <= 250000.0
                }
            except:
                pass
        return None

    currency = match.group(1).strip()
    amount_str = match.group(2).strip().lower()
    
    # Handle 'k' notation (e.g. 50k -> 50000)
    if amount_str.endswith('k'):
        try:
            val = float(amount_str[:-1]) * 1000.0
        except:
            val = 0.0
    else:
        try:
            val = float(amount_str.replace(',', ''))
        except:
            val = 0.0

    return {
        'raw': match.group(0),
        'currency': currency,
        'numeric': val,
        'is_high_value': val >= 10000.0,
        'is_corporate_wire_range': 5000.0 <= val <= 250000.0
    }

def analyze_funds_transfer(text):
    """
    Main analysis pipeline:
    1. Scans text for pivot triggers.
    2. Binds sentence boundaries with left/right delimiters.
    3. Evaluates Left Window (Mandate + Action Verb).
    4. Evaluates Right Window (Monetary Amount + Beneficiary Destination).
    5. Checks broader document context for verification-avoidance tactics.
    """
    findings = []
    total_score = 0
    indicators = []

    # Check for pivot phrases
    seen_sentence_spans = set()
    for pivot_pat in PIVOT_PATTERNS:
        for match in re.finditer(pivot_pat, text, re.IGNORECASE):
            p_start, p_end = match.start(), match.end()
            pivot_text = match.group(0)

            # Snap to sentence delimiters
            s_start, s_end = find_sentence_boundaries(text, p_start, p_end)
            if (s_start, s_end) in seen_sentence_spans:
                continue
            seen_sentence_spans.add((s_start, s_end))

            sentence = text[s_start:s_end].strip()
            
            # Left clause (start of sentence to start of pivot)
            left_clause = text[s_start:p_start].strip()
            # Right clause (end of pivot to end of sentence)
            right_clause = text[p_end:s_end].strip()

            # --- 1. Left Window Slot Analysis (Mandate & Action Verb) ---
            action_verb_found = None
            for av in ACTION_VERBS:
                m_av = re.search(av, left_clause, re.IGNORECASE)
                if m_av:
                    action_verb_found = m_av.group(0)
                    break

            mandate_found = None
            for md in MANDATE_DIRECTIVES:
                m_md = re.search(md, left_clause, re.IGNORECASE)
                if m_md:
                    mandate_found = m_md.group(0)
                    break

            # --- 2. Right Window Slot Analysis (Currency & Beneficiary) ---
            amount_data = parse_currency_amount(right_clause)
            
            beneficiary_findings = []
            for ben_pat, ben_title, ben_sev, ben_pts in BENEFICIARY_RISK_PATTERNS:
                if re.search(ben_pat, right_clause, re.IGNORECASE) or re.search(ben_pat, text, re.IGNORECASE):
                    beneficiary_findings.append({
                        'title': ben_title,
                        'severity': ben_sev,
                        'points': ben_pts
                    })

            # Check for urgency conditions in the sentence
            has_deadline = bool(re.search(r'\b(?:before|by) (?:[0-9]{1,2}(?::[0-9]{2})?\s?(?:am|pm)?|today|close of business|cutoff)\b', sentence, re.I))
            has_deal_loss_threat = bool(re.search(r'\bor (?:we|you) lose\b', sentence, re.I))

            # --- Scoring Calculation for This Bounded Sentence ---
            sentence_score = 25  # Base trigger for financial transfer pivot
            
            if action_verb_found:
                sentence_score += 15
            if mandate_found:
                sentence_score += 15
            if amount_data:
                sentence_score += 20
                if amount_data['is_high_value']:
                    sentence_score += 15
            if has_deadline:
                sentence_score += 10
            if has_deal_loss_threat:
                sentence_score += 15

            for bf in beneficiary_findings:
                sentence_score += bf['points']

            # Create detailed indicator for the financial transfer
            if amount_data:
                amount_str = amount_data['raw']
                directive_desc = f"Action Directive: '{mandate_found or 'direct instruction'}' '{action_verb_found or pivot_text}'."
                desc_parts = [
                    f"Sentence bounded by full-stop delimiters commands execution of a financial transfer ({amount_str}).",
                    directive_desc,
                    f"Target Sentence: \"{sentence}\""
                ]
                if beneficiary_findings:
                    desc_parts.append(f"Destination Risk: {beneficiary_findings[0]['title']}.")

                indicators.append({
                    'name': f"Sentence-Bounded Financial Transfer Instruction ({amount_str})",
                    'severity': 'CRITICAL' if (amount_data['is_high_value'] or beneficiary_findings) else 'HIGH',
                    'score_impact': min(55, sentence_score),
                    'description': " ".join(desc_parts)
                })

            total_score += sentence_score
            findings.append({
                'sentence': sentence,
                'left_clause': left_clause,
                'right_clause': right_clause,
                'pivot': pivot_text,
                'action_verb': action_verb_found,
                'mandate': mandate_found,
                'amount': amount_data,
                'beneficiaries': beneficiary_findings,
                'score': sentence_score
            })

    # --- 3. Verification-Avoidance & Evasive Review Analysis ---
    avoidance_matches = []
    for vap in VERIFICATION_AVOIDANCE_PATTERNS:
        m_vap = re.search(vap, text, re.IGNORECASE)
        if m_vap:
            avoidance_matches.append(m_vap.group(0))

    if avoidance_matches:
        indicators.append({
            'name': 'Verification-Avoidance & Review-Blackout Coercion',
            'severity': 'CRITICAL',
            'score_impact': 30,
            'description': f"Sender actively suppresses out-of-band verification and claims unavailability to review/validate while mandating that the payment must proceed without fail. Matched phrases: \"{', '.join(avoidance_matches[:2])}\"."
        })
        total_score += 30

    return {
        'detected': len(findings) > 0,
        'findings': findings,
        'total_score': min(90, total_score),
        'indicators': indicators,
        'has_avoidance': len(avoidance_matches) > 0
    }
